import { prisma } from "@/lib/db";
import { avatarSchema } from "@/lib/validation";
import { jsonError, jsonOk } from "@/lib/http";
import { guardMutating, parseJson, requireUser } from "@/lib/request";

export async function GET(req: Request) {
  try {
    const user = await requireUser(req);
    const avatar = await prisma.avatar.findUnique({ where: { userId: user.id } });
    return jsonOk({ avatar });
  } catch (e) {
    return jsonError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser(req);
    await guardMutating(req, `avatar:${user.id}`, 20, 60);
    const config = avatarSchema.parse(await parseJson(req));
    const avatar = await prisma.avatar.upsert({
      where: { userId: user.id },
      create: { userId: user.id, style: config.style, seed: `${config.style}-${user.id.slice(0, 8)}`, config },
      update: { style: config.style, config },
    });
    return jsonOk({ avatar });
  } catch (e) {
    return jsonError(e);
  }
}
