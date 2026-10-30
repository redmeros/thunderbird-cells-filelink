import { CellsClient } from "./lib/cells.js";
import { SERVER_URL, UPLOAD_SIZE_LIMIT, loadSettings } from "./lib/config.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// Upload state per composer file id, so aborts can cancel in-flight requests.
const controllers = new Map();

const fileKey = (accountId, fileId) => `file:${accountId}:${fileId}`;

function timestampFolder() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

// Cells rejects a few characters in node names; keep the rest of the original name.
function safeName(name) {
  return name.replace(/[\\/:*?"<>|]/g, "_").trim() || "attachment";
}

async function clientFor(accountId) {
  const settings = await loadSettings(accountId);
  if (!settings.token) throw new Error("Pydio Cells is not configured: add a Personal Access Token in the FileLink settings.");
  return { client: new CellsClient(SERVER_URL, settings.token), settings };
}

browser.cloudFile.onFileUpload.addListener(async (account, { id, name, data }) => {
  const controller = new AbortController();
  controllers.set(id, controller);
  const { signal } = controller;

  let uploadFolder;
  try {
    const { client, settings } = await clientFor(account.id);
    uploadFolder = [settings.workspace, settings.folder, timestampFolder()].filter(Boolean).join("/");
    const path = `${uploadFolder}/${safeName(name)}`;

    await client.createFolder(uploadFolder, signal);
    await client.putObject(path, data, signal);
    const node = await client.waitForNode(path, signal);

    const expiresAt = settings.expiryDays > 0 ? Date.now() + settings.expiryDays * DAY_MS : 0;
    const link = await client.createLink(
      {
        nodeUuid: node.Uuid,
        label: name,
        description: "Shared from Thunderbird",
        expiresAt,
        maxDownloads: settings.maxDownloads,
        password: settings.password,
      },
      signal
    );

    await browser.storage.local.set({
      [fileKey(account.id, id)]: { folder: uploadFolder, linkUuid: link.Uuid, created: Date.now() },
    });

    const templateInfo = { service_name: "Pydio Cells", service_url: SERVER_URL };
    if (expiresAt) templateInfo.download_expiry_date = { timestamp: expiresAt };
    if (settings.maxDownloads > 0) templateInfo.download_limit = settings.maxDownloads;
    if (settings.password) templateInfo.download_password_protected = true;

    return { url: client.publicUrl(link), templateInfo };
  } catch (e) {
    if (signal.aborted) {
      cleanupAbortedUpload(account.id, uploadFolder);
      return { aborted: true };
    }
    console.error("Pydio Cells upload failed", e);
    return { error: e.message || true };
  } finally {
    controllers.delete(id);
  }
});

async function cleanupAbortedUpload(accountId, folder) {
  if (!folder) return;
  try {
    const { client } = await clientFor(accountId);
    await client.deleteNode(folder, true);
  } catch (e) {
    console.warn("Pydio Cells: could not clean up aborted upload", folder, e);
  }
}

browser.cloudFile.onFileUploadAbort.addListener((account, fileId) => {
  controllers.get(fileId)?.abort();
});

browser.cloudFile.onFileDeleted.addListener(async (account, fileId) => {
  const key = fileKey(account.id, fileId);
  const entry = (await browser.storage.local.get(key))[key];
  if (!entry) return;
  try {
    const { client, settings } = await clientFor(account.id);
    if (entry.linkUuid) await client.deleteLink(entry.linkUuid);
    if (settings.deleteOnRemove) await client.deleteNode(entry.folder);
  } catch (e) {
    console.warn("Pydio Cells: could not delete remote file", entry, e);
  } finally {
    await browser.storage.local.remove(key);
  }
});

browser.cloudFile.onAccountAdded.addListener(async (account) => {
  const settings = await loadSettings(account.id);
  await browser.cloudFile.updateAccount(account.id, {
    configured: !!settings.token,
    uploadSizeLimit: UPLOAD_SIZE_LIMIT,
  });
});

browser.cloudFile.onAccountDeleted.addListener(async (accountId) => {
  const all = await browser.storage.local.get(null);
  const keys = Object.keys(all).filter((k) => k === `account:${accountId}` || k.startsWith(`file:${accountId}:`));
  await browser.storage.local.remove(keys);
});

// Messages from the management page.
browser.runtime.onMessage.addListener(async (message) => {
  if (message?.type !== "testConnection") return undefined;
  try {
    const client = new CellsClient(SERVER_URL, message.token);
    const node = await client.stat(message.workspace);
    if (!node) return { ok: false, error: `Workspace "${message.workspace}" not found.` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.status === 401 ? "Token rejected by the server (401)." : e.message };
  }
});

// Forget bookkeeping for attachments that were sent long ago (onFileDeleted never fires for those).
async function pruneOldEntries() {
  const all = await browser.storage.local.get(null);
  const cutoff = Date.now() - 90 * DAY_MS;
  const stale = Object.entries(all)
    .filter(([k, v]) => k.startsWith("file:") && (v?.created ?? 0) < cutoff)
    .map(([k]) => k);
  if (stale.length) await browser.storage.local.remove(stale);
}
browser.runtime.onStartup.addListener(pruneOldEntries);
