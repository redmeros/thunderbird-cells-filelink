// Thin client for the Pydio Cells v4 REST API (/a/...) and S3 gateway (/io).
import { signS3Request, s3Encode } from "./sigv4.js";

const S3_SECRET = "gatewaysecret";

export class CellsError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export class CellsClient {
  constructor(serverUrl, token) {
    this.base = serverUrl.replace(/\/+$/, "");
    this.token = token;
  }

  async api(method, path, body, signal) {
    const res = await fetch(this.base + path, {
      method,
      signal,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body !== undefined && { "Content-Type": "application/json" }),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      data = { Detail: text };
    }
    if (!res.ok) {
      const detail = data.Title || data.Detail || data.message || res.statusText;
      throw new CellsError(`Cells ${method} ${path} failed (${res.status}): ${detail}`, res.status);
    }
    return data;
  }

  // Returns the node at `path` (e.g. "personal-files/foo.pdf") or null.
  async stat(path, signal) {
    const data = await this.api("POST", "/a/tree/stats", { NodePaths: [path] }, signal);
    return (data.Nodes || [])[0] || null;
  }

  async createFolder(path, signal) {
    await this.api("POST", "/a/tree/create", { Nodes: [{ Path: path, Type: "COLLECTION" }], Recursive: true }, signal);
  }

  async deleteNode(path, removePermanently = false) {
    await this.api("POST", "/a/tree/delete", { Nodes: [{ Path: path }], Recursive: true, RemovePermanently: removePermanently });
  }

  async putObject(path, file, signal) {
    const url = `${this.base}/io/${path.split("/").map(s3Encode).join("/")}`;
    const headers = await signS3Request({ method: "PUT", url, accessKey: this.token, secretKey: S3_SECRET });
    const res = await fetch(url, {
      method: "PUT",
      signal,
      headers: { ...headers, "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const s3msg = /<Message>([^<]*)<\/Message>/.exec(text)?.[1];
      throw new CellsError(`Upload failed (${res.status}): ${s3msg || res.statusText}`, res.status);
    }
  }

  // Polls stat() until the freshly uploaded node is indexed.
  async waitForNode(path, signal, attempts = 10) {
    for (let i = 0; i < attempts; i++) {
      const node = await this.stat(path, signal).catch((e) => {
        if (e.status === 404) return null;
        throw e;
      });
      if (node?.Uuid) return node;
      await new Promise((r) => setTimeout(r, 300 * (i + 1)));
    }
    throw new CellsError(`Uploaded file not found on server: ${path}`);
  }

  async createLink({ nodeUuid, label, description, expiresAt, maxDownloads, password }, signal) {
    const shareLink = {
      Label: label,
      Description: description,
      RootNodes: [{ Uuid: nodeUuid }],
      Permissions: ["Preview", "Download"],
      ViewTemplateName: "pydio_unique_dl",
    };
    if (expiresAt) shareLink.AccessEnd = String(Math.floor(expiresAt / 1000));
    if (maxDownloads > 0) shareLink.MaxDownloads = String(maxDownloads);

    const body = { ShareLink: shareLink };
    if (password) {
      shareLink.PasswordRequired = true;
      body.PasswordEnabled = true;
      body.CreatePassword = password;
    }
    return this.api("PUT", "/a/share/link", body, signal);
  }

  async deleteLink(uuid) {
    await this.api("DELETE", `/a/share/link/${encodeURIComponent(uuid)}`);
  }

  publicUrl(link) {
    if (link.LinkUrl) {
      return /^https?:\/\//.test(link.LinkUrl) ? link.LinkUrl : this.base + (link.LinkUrl.startsWith("/") ? "" : "/") + link.LinkUrl;
    }
    if (link.LinkHash) return `${this.base}/public/${link.LinkHash}`;
    throw new CellsError("Share link was created but the server returned no URL");
  }
}
