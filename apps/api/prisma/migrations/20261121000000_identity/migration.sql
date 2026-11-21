CREATE TYPE "Role" AS ENUM ('TEACHER', 'STUDENT');

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "telegramId" BIGINT,
    "role" "Role" NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_telegramId_key" ON "User"("telegramId");
CREATE UNIQUE INDEX "User_single_teacher" ON "User"("role") WHERE "role" = 'TEACHER';
