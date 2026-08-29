import { z } from "zod";
import { AVATAR_STYLES } from "./constants";

export const signupSchema = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase().trim()),
  password: z.string().min(10).max(200),
  displayName: z.string().min(2).max(40).trim(),
});

export const loginSchema = z.object({
  email: z.string().email().max(200).transform((s) => s.toLowerCase().trim()),
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
  teamSize: z.number().int().min(1).max(6).default(2),
});

export const activitySchema = z.object({
  type: z.enum(["QUIZ", "CODING", "CHALLENGE"]),
  title: z.string().min(2).max(80).trim(),
  durationMs: z.number().int().min(5000).max(1000 * 60 * 180).default(60000),
});
