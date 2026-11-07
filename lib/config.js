// Placeholder: build.ps1 replaces this and host_permissions with values from build.local.json.
export const SERVER_URL = "https://cells.example.com";

export const DEFAULT_SETTINGS = {
  token: "", // Pydio Cells Personal Access Token
  workspace: "personal-files", // workspace slug the files are stored in
  folder: "Thunderbird Attachments",
  expiryDays: 30, // 0 = link never expires
  maxDownloads: 0, // 0 = unlimited
  password: "", // empty = no password on links
  deleteOnRemove: true, // delete the file when the attachment is removed from the draft
};

// Single S3 PUT limit (5 GiB).
export const UPLOAD_SIZE_LIMIT = 5 * 1024 * 1024 * 1024;

export async function loadSettings(accountId) {
  const key = `account:${accountId}`;
  const stored = (await browser.storage.local.get(key))[key] || {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export async function saveSettings(accountId, settings) {
  await browser.storage.local.set({ [`account:${accountId}`]: settings });
}
