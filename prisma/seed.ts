import { PrismaClient } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { randomBytes } from "node:crypto";

const prisma = new PrismaClient();

async function main() {
  const hostPass = process.env.SEED_HOST_PASSWORD ?? "change-this-host-password";
  const partPass = process.env.SEED_PARTICIPANT_PASSWORD ?? "change-this-participant-password";
  const hostEmail = process.env.SEED_HOST_EMAIL ?? "host@clashiq.local";

  const passwordHash = await hash(hostPass, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });
  const partHash = await hash(partPass, { memoryCost: 19456, timeCost: 2, outputLen: 32, parallelism: 1 });

  const host = await prisma.user.upsert({
    where: { email: hostEmail },
    update: { role: "HOST", passwordHash },
    create: { email: hostEmail, displayName: "Arena Host", passwordHash, role: "HOST" },
  });

  await prisma.user.upsert({
    where: { email: "avery@clashiq.local" },
    update: {},
    create: { email: "avery@clashiq.local", displayName: "Avery", passwordHash: partHash, role: "PARTICIPANT" },
  });
  await prisma.user.upsert({
    where: { email: "dev@clashiq.local" },
    update: {},
    create: { email: "dev@clashiq.local", displayName: "Dev", passwordHash: partHash, role: "PARTICIPANT" },
  });

  const event = await prisma.event.create({
    data: { hostId: host.id, title: "Intramural Algorithms Night", description: "Seeded demo event" },
  });

  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = randomBytes(8);
  let code = "";
  for (let i = 0; i < 8; i++) code += alphabet[buf[i]! % alphabet.length];

  const room = await prisma.room.create({
    data: { eventId: event.id, name: "Main Floor", code, status: "OPEN", teamSize: 2, joinsEnabled: true },
  });

  const quizAct = await prisma.activity.create({
    data: { roomId: room.id, type: "QUIZ", title: "Warmup Circuits", status: "PUBLISHED", sortOrder: 10, durationMs: 120000 },
  });
  const quiz = await prisma.quiz.create({ data: { activityId: quizAct.id } });
  await prisma.quizQuestion.create({
    data: {
      quizId: quiz.id,
      prompt: "What is the time complexity of binary search on a sorted array?",
      explanation: "Halves the search space each step: O(log n).",
      points: 100,
      timeLimitMs: 20000,
      sortOrder: 10,
      current: true,
      options: {
        create: [
          { label: "O(n)", isCorrect: false, sortOrder: 0 },
          { label: "O(log n)", isCorrect: true, sortOrder: 1 },
          { label: "O(n log n)", isCorrect: false, sortOrder: 2 },
          { label: "O(1)", isCorrect: false, sortOrder: 3 },
        ],
      },
    },
  });

  const codeAct = await prisma.activity.create({
    data: { roomId: room.id, type: "CODING", title: "Square the Input", status: "PUBLISHED", sortOrder: 20, durationMs: 900000 },
  });
  const problem = await prisma.codingProblem.create({
    data: {
      activityId: codeAct.id,
      description: "Read integer n and print n*n.",
      constraints: "1 <= n <= 10000",
      inputFormat: "Single integer",
      outputFormat: "Single integer",
      examples: [{ input: "4", output: "16" }],
      difficulty: "easy",
      allowedLanguages: [71, 63],
      starterCode: { "71": "n=int(input())\nprint(n*n)\n", "63": "console.log((+require('fs').readFileSync(0,'utf8'))**2)\n" },
    },
  });
  await prisma.codingTestCase.createMany({
    data: [
      { problemId: problem.id, input: "4", expected: "16", points: 20, hidden: false, sortOrder: 0 },
      { problemId: problem.id, input: "9", expected: "81", points: 30, hidden: true, sortOrder: 1 },
      { problemId: problem.id, input: "12", expected: "144", points: 50, hidden: true, sortOrder: 2 },
    ],
  });

  await prisma.activity.create({
    data: { roomId: room.id, type: "CHALLENGE", title: "Floor Clash", status: "PUBLISHED", sortOrder: 30, durationMs: 180000 },
  });

  await prisma.powerCardCatalog.createMany({
    data: [
      { type: "STEAL", name: "Steal", description: "Take points from an opponent.", defaultCost: 200, durationMs: 0 },
      { type: "DOUBLE_POINTS", name: "Double", description: "Double challenge points.", defaultCost: 150, durationMs: 120000 },
      { type: "SHIELD", name: "Shield", description: "Block a steal.", defaultCost: 120, durationMs: 180000 },
      { type: "FREEZE", name: "Freeze", description: "Freeze an opponent briefly.", defaultCost: 180, durationMs: 30000 },
    ],
    skipDuplicates: true,
  });

  console.log(`Seeded host ${hostEmail} room code ${code}`);
}

main().finally(() => prisma.$disconnect());
