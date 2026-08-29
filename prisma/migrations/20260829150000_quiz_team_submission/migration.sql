-- AlterTable
ALTER TABLE "QuizSubmission" ADD COLUMN IF NOT EXISTS "teamId" TEXT;

UPDATE "QuizSubmission" AS qs
SET "teamId" = tm."teamId"
FROM "TeamMember" AS tm
WHERE qs."teamId" IS NULL AND tm."userId" = qs."userId";

DELETE FROM "QuizSubmission" WHERE "teamId" IS NULL;

ALTER TABLE "QuizSubmission" ALTER COLUMN "teamId" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "QuizSubmission_questionId_teamId_key" ON "QuizSubmission"("questionId", "teamId");

ALTER TABLE "QuizSubmission" DROP CONSTRAINT IF EXISTS "QuizSubmission_teamId_fkey";
ALTER TABLE "QuizSubmission" ADD CONSTRAINT "QuizSubmission_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
