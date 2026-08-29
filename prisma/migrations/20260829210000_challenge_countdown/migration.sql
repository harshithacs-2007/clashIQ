-- Add server-side countdown deadline for accepted challenges.
ALTER TABLE "Challenge" ADD COLUMN "countdownEndsAt" TIMESTAMP(3);
