import { z } from "zod";
import { AVATAR_STYLES } from "./constants";

const loginEmail = z.preprocess(
  (v) => (typeof v === "string" ? v.trim().toLowerCase() : v),
  z.string().email().max(200),
);

export const signupSchema = z.object({
  email: loginEmail,
  password: z.string().min(10).max(200),
  displayName: z.string().min(2).max(40).trim(),
});

export const loginSchema = z.object({
  email: loginEmail,
  password: z.string().min(1).max(200),
});

export const joinRoomSchema = z.object({
  code: z.string().min(4).max(16).transform((s) => s.toUpperCase().trim()),
});

export const avatarSchema = z.object({
  style: z.enum(AVATAR_STYLES),
  hue: z.number().int().min(0).max(359),
  visor: z.number().int().min(0).max(5),
  crest: z.number().int().min(0).max(5),
  mark: z.number().int().min(0).max(5),
});

export const teamSchema = z.object({
  name: z.string().min(2).max(24).trim(),
  teamId: z.string().optional(),
});

export const eventSchema = z.object({
  title: z.string().min(2).max(80).trim(),
  description: z.string().max(2000).default(""),
});

export const roomSchema = z.object({
  name: z.string().min(2).max(80).trim(),
  teamSize: z.number().int().min(2).max(3).default(2),
});

export const activitySchema = z.object({
  type: z.enum(["QUIZ", "CODING", "CHALLENGE"]),
  title: z.string().min(2).max(80).trim(),
  durationMs: z.number().int().min(5000).max(1000 * 60 * 180).default(60000),
  instructions: z.string().max(4000).default(""),
});

export const quizOptionSchema = z.object({
  label: z.string().min(1).max(400),
  isCorrect: z.boolean(),
});

export const quizQuestionSchema = z.object({
  activityId: z.string().min(1),
  prompt: z.string().min(1).max(2000),
  explanation: z.string().max(2000).default(""),
  points: z.number().int().min(1).max(10000).default(100),
  timeLimitMs: z.number().int().min(3000).max(300000).default(20000),
  imageId: z.string().optional(),
  options: z.array(quizOptionSchema).min(2).max(8),
});
