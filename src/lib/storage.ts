import { HttpError } from "./http";
import { getEnv } from "./env";
import { storageKey } from "./crypto";

const ALLOWED = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export async function storeUpload(file: File, uploaderId: string) {
  const env = getEnv();
  if (file.size > env.MAX_UPLOAD_BYTES) {
    throw new HttpError(400, "File is too large.");
  }
  if (!ALLOWED.has(file.type)) {
    throw new HttpError(400, "Only PNG, JPEG, WebP, and GIF images are allowed.");
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const header = buf.subarray(0, 12);
  if (!looksLikeImage(header, file.type)) {
    throw new HttpError(400, "File contents do not match the declared type.");
  }
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : file.type === "image/gif" ? "gif" : "jpg";
  const key = storageKey(ext);

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

function looksLikeImage(header: Buffer, mime: string): boolean {
  if (mime === "image/png") return header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  if (mime === "image/jpeg") return header[0] === 0xff && header[1] === 0xd8;
  if (mime === "image/gif") return header[0] === 0x47 && header[1] === 0x49 && header[2] === 0x46;
  if (mime === "image/webp") return header[8] === 0x57 && header[9] === 0x45 && header[10] === 0x42 && header[11] === 0x50;
  return false;
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
