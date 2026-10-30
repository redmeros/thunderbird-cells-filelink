// Minimal AWS Signature V4 for S3 requests against the Cells gateway.
// Cells: access key = user JWT/PAT, secret = "gatewaysecret", path-style bucket "io".

const enc = new TextEncoder();

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(text) {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(text)));
}

async function hmac(key, data) {
  const raw = typeof key === "string" ? enc.encode(key) : key;
  const cryptoKey = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", cryptoKey, enc.encode(data));
}

// RFC 3986 encoding as required by S3 canonical URIs.
export function s3Encode(segment) {
  return encodeURIComponent(segment).replace(/[!'()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase());
}

/**
 * Returns headers to attach to a fetch() for the given request.
 * The payload is not hashed (UNSIGNED-PAYLOAD) so large files are not read twice.
 */
export async function signS3Request({ method, url, accessKey, secretKey, region = "us-east-1" }) {
  const u = new URL(url);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = "UNSIGNED-PAYLOAD";

  const canonicalHeaders = `host:${u.host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [method, u.pathname, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");

  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256Hex(canonicalRequest)].join("\n");

  let key = await hmac("AWS4" + secretKey, dateStamp);
  key = await hmac(key, region);
  key = await hmac(key, "s3");
  key = await hmac(key, "aws4_request");
  const signature = hex(await hmac(key, stringToSign));

  return {
    "x-amz-date": amzDate,
    "x-amz-content-sha256": payloadHash,
    Authorization: `AWS4-HMAC-SHA256 Credential=${accessKey}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}
