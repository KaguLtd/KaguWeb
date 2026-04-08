CREATE INDEX "DailyProgramProject_dailyProgramId_sortOrder_idx"
ON "DailyProgramProject"("dailyProgramId", "sortOrder");

CREATE INDEX "ProjectAssignment_userId_isActive_idx"
ON "ProjectAssignment"("userId", "isActive");

CREATE INDEX "WorkSession_userId_endedAt_idx"
ON "WorkSession"("userId", "endedAt");

CREATE INDEX "ProjectEntry_dailyProgramProjectId_createdAt_idx"
ON "ProjectEntry"("dailyProgramProjectId", "createdAt");

CREATE INDEX "LocationPing_actorId_capturedAt_idx"
ON "LocationPing"("actorId", "capturedAt");
