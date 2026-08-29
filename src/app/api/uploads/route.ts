import { prisma } from "@/lib/db";
import { storeUpload } from "@/lib/storage";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `upload:${host.id}`, 20, 60);
    const form = await req.formData();
    const file = form.get("file");
    const roomId = String(form.get("roomId") ?? "");
    if (!(file instanceof File)) throw new HttpError(400, "file is required.");
    if (roomId) await requireHostOwnsRoom(host.id, roomId);
    const stored = await storeUpload(file, host.id);
    const media = await prisma.uploadedMedia.create({
      data: {
        roomId: roomId || null,
        uploaderId: host.id,
        storageKey: stored.key,
        mime: stored.mime,
        bytes: stored.bytes,
      },
    });
    return jsonOk({ media }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
