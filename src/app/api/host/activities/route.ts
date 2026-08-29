import { activitySchema } from "@/lib/validation";
import { jsonError, jsonOk, HttpError } from "@/lib/http";
import { guardMutating, parseJson, requireHost } from "@/lib/request";
import { requireHostOwnsRoom } from "@/lib/access";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/realtime";

export async function POST(req: Request) {
  try {
    const host = await requireHost(req);
    await guardMutating(req, `activity:${host.id}`, 40, 60);
    const roomId = new URL(req.url).searchParams.get("roomId");
    if (!roomId) throw new HttpError(400, "roomId is required.");
    const room = await requireHostOwnsRoom(host.id, roomId);
    const body = activitySchema.parse(await parseJson(req));
    const last = room.activities.at(-1);
    const activity = await prisma.activity.create({
      data: {
        roomId,
        type: body.type,
        title: body.title,
        durationMs: body.durationMs,
        sortOrder: (last?.sortOrder ?? 0) + 10,
        status: "DRAFT",
      },
    });
    if (body.type === "QUIZ") {
      await prisma.quiz.create({ data: { activityId: activity.id } });
    }
    if (body.type === "CODING") {
      await prisma.codingProblem.create({
        data: {
          activityId: activity.id,
          description: "Describe the problem.",
          examples: [],
          allowedLanguages: [71, 63, 62],
          starterCode: { 71: "print('hello')\n", 63: "console.log('hello')\n", 62: "class Main { public static void main(String[] a) {} }\n" },
        },
      });
    }
    await audit({ roomId, actorId: host.id, action: "HOST_CREATED_ACTIVITY", payload: { activityId: activity.id, type: body.type } });
    return jsonOk({ activity }, 201);
  } catch (e) {
    return jsonError(e);
  }
}
