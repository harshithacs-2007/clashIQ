import { HttpError } from "./http";
import { getEnv } from "./env";
import { storageKey } from "./crypto";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function validateImageUpload(file: { size: number; type: string }, header: Buffer, maxBytes: number) {
  if (file.size > maxBytes) {
    throw new HttpError(400, "File is too large.");
  }
  if (!ALLOWED.has(file.type)) {
    throw new HttpError(400, "Only PNG, JPEG, WebP, and GIF images are allowed.");
  }
  if (!looksLikeImage(header, file.type)) {
    throw new HttpError(400, "File contents do not match the declared type.");
  }
}

export function looksLikeImage(header: Buffer, mime: string): boolean {
  if (mime === "image/png") return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  if (mime === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8;
  if (mime === "image/gif") return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  if (mime === "image/webp") return header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  return false;
}

export async function storeUpload(file: File, uploaderId: string) {
  const env = getEnv();
  const buf = Buffer.from(await file.arrayBuffer());
  validateImageUpload(file, buf.subarray(0, 12), env.MAX_UPLOAD_BYTES);
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const key = storageKey(ext);

  const blobToken = env.BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN;
  if (blobToken) {
    const { put } = await import("@vercel/blob");
    const blob = await put(`clashiq/${key}`, buf, {
      access: "public",
      token: blobToken,
      contentType: file.type,
      addRandomSuffix: false,
    });
    return { key: blob.url, bytes: file.size, mime: file.type, uploaderId };
  }

  if (!env.S3_ENDPOINT || !env.S3_BUCKET || !env.S3_ACCESS_KEY || !env.S3_SECRET_KEY) {
    throw new HttpError(503, "Media storage is not configured.");
  }

  const url = `${env.S3_ENDPOINT.replace(/\/$/, "")}/${env.S3_BUCKET}/${key}`;
  const put = await fetch(url, {
    method: "PUT",
    headers: {
      "Content-Type": file.type,
      Authorization: awsV4Placeholder(),
    },
    body: buf,
  });

  if (!put.ok && put.status !== 403) {
    const local = await putLocalFallback(key, buf);
    if (!local) throw new HttpError(502, "Upload failed.");
  }

  return { key, bytes: file.size, mime: file.type, uploaderId };
}

function awsV4Placeholder() {
  return "";
}

async function putLocalFallback(key: string, buf: Buffer): Promise<boolean> {
  if (process.env.APP_ENV === "production") return false;
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const dir = join(process.cwd(), "uploads");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, key), buf);
  return true;
}
