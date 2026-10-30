import { SERVER_URL, UPLOAD_SIZE_LIMIT, loadSettings, saveSettings } from "../lib/config.js";

const accountId = new URL(location.href).searchParams.get("accountId");
const form = document.getElementById("settings");
const status = document.getElementById("status");
const fields = ["token", "workspace", "folder", "expiryDays", "maxDownloads", "password", "deleteOnRemove"];

function setStatus(text, kind = "") {
  status.textContent = text;
  status.className = kind;
}

async function init() {
  document.getElementById("server").textContent = SERVER_URL;
  const settings = await loadSettings(accountId);
  for (const name of fields) {
    const el = document.getElementById(name);
    if (el.type === "checkbox") el.checked = !!settings[name];
    else el.value = settings[name];
  }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const settings = {};
  for (const name of fields) {
    const el = document.getElementById(name);
    if (el.type === "checkbox") settings[name] = el.checked;
    else if (el.type === "number") settings[name] = Math.max(0, parseInt(el.value, 10) || 0);
    else settings[name] = el.value.trim();
  }
  settings.folder = settings.folder.replace(/^\/+|\/+$/g, "");

  setStatus("Checking connection…");
  const result = await browser.runtime.sendMessage({
    type: "testConnection",
    token: settings.token,
    workspace: settings.workspace,
  });
  if (!result?.ok) {
    setStatus(result?.error || "Connection failed.", "error");
    return;
  }

  await saveSettings(accountId, settings);
  await browser.cloudFile.updateAccount(accountId, { configured: true, uploadSizeLimit: UPLOAD_SIZE_LIMIT });
  setStatus("Saved. Connection OK.", "ok");
});

init();
