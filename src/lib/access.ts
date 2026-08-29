import "server-only";
import { prisma } from "./db";
import { HttpError } from "./http";
import { publicCodingProblem, publicQuizQuestionPayload } from "./public-payload";

export { publicCodingProblem, publicQuizQuestionPayload };

export async function requireHostOwnsRoom(hostId: string, roomId: string) {
  const room = await prisma.room.findUnique({
    where: { id: roomId },
    include: { event: true, activities: { orderBy: { sortOrder: "asc" } } },
  });
  if (!room) throw new HttpError(404, "Room not found.");
  if (room.event.hostId !== hostId) throw new HttpError(403, "You do not host this room.");
  return room;
}

export async function requireMembership(userId: string, roomId: string) {
  const member = await prisma.teamMember.findFirst({
    where: { userId, team: { roomId } },
    include: { team: true },
  });
  if (!member) throw new HttpError(403, "Join a team in this room first.");
  return member;
}

export async function publicQuizQuestion(questionId: string, revealAnswers = false) {
  const q = await prisma.quizQuestion.findUnique({
    where: { id: questionId },
    include: { options: { orderBy: { sortOrder: "asc" } } },
  });
  if (!q) return null;
  return publicQuizQuestionPayload(q, revealAnswers);
}
