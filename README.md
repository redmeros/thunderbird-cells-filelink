# Cells FileLink

> **Note:** This project was generated with [Anthropic Claude Code](https://claude.com/claude-code).

Thunderbird add-on (Manifest V3, Thunderbird 128+). It adds a **Pydio Cells** FileLink provider: large attachments are uploaded to your [Pydio Cells](https://pydio.com) server, and the email gets a public download link instead of the file.

## Configure your server

Before installing, point the add-on at your Cells instance in two places:

- `lib/config.js` → `SERVER_URL = "https://cells.example.com"`
- `manifest.json` → `"host_permissions": ["https://cells.example.com/*"]`

If you distribute the add-on, also change the add-on ID (`browser_specific_settings.gecko.id`) in `manifest.json` to one you own.

## How it works

| Thunderbird event | What happens on Cells |
|---|---|
| `onFileUpload` | Creates `<workspace>/<folder>/<timestamp>/` and uploads the file through the S3 gateway (`/io`, SigV4, access key = token, secret = `gatewaysecret`). Then it looks up the node's UUID (`POST /a/tree/stats`) and creates a download link (`PUT /a/share/link`, template `pydio_unique_dl`). It returns the link URL plus expiry, download-limit and password hints for the email template. |
| `onFileUploadAbort` | Cancels the in-flight request and removes the partial upload. |
| `onFileDeleted` | Deletes the share link (`DELETE /a/share/link/{uuid}`). If the setting is on, it also moves the file to the Cells recycle bin (`POST /a/tree/delete`). |

Each upload goes in its own timestamped subfolder. Files with the same name don't collide, and recipients still see the original filename.

## Install (development)

1. In Thunderbird open **Tools → Developer Tools → Debug Add-ons → Load Temporary Add-on…** and pick `manifest.json`.
2. Go to **Settings → Composition → Attachments → Add Pydio Cells**.
3. Paste a Cells **Personal Access Token** and click **Save**. Saving checks the connection first.
4. Compose a message, attach a file, and choose **Filelink → Pydio Cells**. You can also let Thunderbird offer it for files above the size threshold.

Debug logs: **Debug Add-ons → Cells FileLink → Inspect**.

## Getting a Personal Access Token

A Cells admin creates the token in one of two ways:

- **Web console:** **People** → edit the user → **Personal Access Tokens** → **+**. Choose **Auto Refresh** expiration.
- **Server CLI:** `./cells admin user token -u <login> -a 2592000 -q` (auto-refresh window of 30 days; `-q` prints only the token).

## Package for deployment

```powershell
./build.ps1   # → dist/cells-filelink-<version>.xpi
```

The XPI is unsigned. Either sign it via addons.thunderbird.net (unlisted), or deploy it through Thunderbird enterprise policies (`ExtensionSettings`) with signature checks configured accordingly.

## Settings (per FileLink account)

- **Personal Access Token**: use "Auto Refresh" expiration so it doesn't expire mid-use.
- **Workspace / Folder**: default `personal-files` / `Thunderbird Attachments`.
- **Link expiry (days)**: default 30. 0 means the link never expires.
- **Max downloads**: 0 means unlimited.
- **Link password**: optional.
- **Delete on remove**: deletes the file when the attachment is removed from a draft.

## Limitations

- Single-request uploads, so the maximum file size is 5 GiB.
- No upload progress bar; Thunderbird shows its spinner.
- Renaming an attachment after upload is not supported.

## References

- Thunderbird cloudFile API (MV3): <https://webextension-api.thunderbird.net/en/mv3/cloudFile.html>
- Pydio Cells REST API: <https://docs.pydio.com/latest/developer-guide/rest-api/index/>
