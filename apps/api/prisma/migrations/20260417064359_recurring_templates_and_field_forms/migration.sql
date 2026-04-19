-- CreateEnum
CREATE TYPE "IdempotencyStatus" AS ENUM ('IN_PROGRESS', 'COMPLETED');

-- CreateEnum
CREATE TYPE "JobExecutionStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "RecurrenceFrequency" AS ENUM ('WEEKLY');

-- CreateEnum
CREATE TYPE "FieldFormFieldType" AS ENUM ('TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'DATE', 'SELECT', 'SIGNATURE');

-- DropForeignKey
ALTER TABLE "NotificationDelivery" DROP CONSTRAINT "NotificationDelivery_subscriptionId_fkey";

-- CreateTable
CREATE TABLE "ProgramTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "managerNote" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateRecurrenceRule" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "frequency" "RecurrenceFrequency" NOT NULL,
    "interval" INTEGER NOT NULL DEFAULT 1,
    "weekdays" INTEGER[],
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateRecurrenceRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateProject" (
    "id" TEXT NOT NULL,
    "programTemplateId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateProject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProgramTemplateAssignment" (
    "id" TEXT NOT NULL,
    "templateProjectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProgramTemplateAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldFormTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldFormTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldFormTemplateVersion" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "schema" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FieldFormTemplateVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FieldFormResponse" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "templateVersionId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "dailyProgramProjectId" TEXT,
    "projectEntryId" TEXT,
    "actorId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldFormResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdempotencyKey" (
    "id" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "status" "IdempotencyStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "response" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IdempotencyKey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobExecution" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "triggerSource" TEXT NOT NULL,
    "scope" TEXT,
    "actorId" TEXT,
    "targetDate" DATE,
    "status" "JobExecutionStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "resultSummary" JSONB,

    CONSTRAINT "JobExecution_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProgramTemplateRecurrenceRule_programTemplateId_idx" ON "ProgramTemplateRecurrenceRule"("programTemplateId");

-- CreateIndex
CREATE INDEX "ProgramTemplateProject_programTemplateId_sortOrder_idx" ON "ProgramTemplateProject"("programTemplateId", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTemplateProject_programTemplateId_projectId_key" ON "ProgramTemplateProject"("programTemplateId", "projectId");

-- CreateIndex
CREATE INDEX "ProgramTemplateAssignment_userId_idx" ON "ProgramTemplateAssignment"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramTemplateAssignment_templateProjectId_userId_key" ON "ProgramTemplateAssignment"("templateProjectId", "userId");

-- CreateIndex
CREATE INDEX "FieldFormTemplateVersion_templateId_createdAt_idx" ON "FieldFormTemplateVersion"("templateId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "FieldFormTemplateVersion_templateId_versionNumber_key" ON "FieldFormTemplateVersion"("templateId", "versionNumber");

-- CreateIndex
CREATE INDEX "FieldFormResponse_projectId_createdAt_idx" ON "FieldFormResponse"("projectId", "createdAt");

-- CreateIndex
CREATE INDEX "FieldFormResponse_actorId_createdAt_idx" ON "FieldFormResponse"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "FieldFormResponse_templateId_createdAt_idx" ON "FieldFormResponse"("templateId", "createdAt");

-- CreateIndex
CREATE INDEX "IdempotencyKey_createdAt_idx" ON "IdempotencyKey"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "IdempotencyKey_actorId_scope_key_key" ON "IdempotencyKey"("actorId", "scope", "key");

-- CreateIndex
CREATE INDEX "JobExecution_jobName_startedAt_idx" ON "JobExecution"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "JobExecution_status_startedAt_idx" ON "JobExecution"("status", "startedAt");

-- CreateIndex
CREATE INDEX "JobExecution_targetDate_startedAt_idx" ON "JobExecution"("targetDate", "startedAt");

-- AddForeignKey
ALTER TABLE "ProgramTemplate" ADD CONSTRAINT "ProgramTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateRecurrenceRule" ADD CONSTRAINT "ProgramTemplateRecurrenceRule_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateProject" ADD CONSTRAINT "ProgramTemplateProject_programTemplateId_fkey" FOREIGN KEY ("programTemplateId") REFERENCES "ProgramTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateProject" ADD CONSTRAINT "ProgramTemplateProject_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateAssignment" ADD CONSTRAINT "ProgramTemplateAssignment_templateProjectId_fkey" FOREIGN KEY ("templateProjectId") REFERENCES "ProgramTemplateProject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProgramTemplateAssignment" ADD CONSTRAINT "ProgramTemplateAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormTemplate" ADD CONSTRAINT "FieldFormTemplate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormTemplateVersion" ADD CONSTRAINT "FieldFormTemplateVersion_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FieldFormTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "FieldFormTemplate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_templateVersionId_fkey" FOREIGN KEY ("templateVersionId") REFERENCES "FieldFormTemplateVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_dailyProgramProjectId_fkey" FOREIGN KEY ("dailyProgramProjectId") REFERENCES "DailyProgramProject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_projectEntryId_fkey" FOREIGN KEY ("projectEntryId") REFERENCES "ProjectEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FieldFormResponse" ADD CONSTRAINT "FieldFormResponse_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "NotificationSubscription"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobExecution" ADD CONSTRAINT "JobExecution_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
