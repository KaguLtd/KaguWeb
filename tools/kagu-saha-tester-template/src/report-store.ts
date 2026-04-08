import path from "node:path";
import { allPersonas } from "./personas.js";
import { projectBlueprints } from "./scenarios.js";
import { workspaceRoot } from "./config.js";
import type { ReportData, TesterConfig } from "./types.js";
import { monthDateRange, readJson, summarizeMonth, writeJson } from "./utils.js";

export const reportDataPath = path.join(workspaceRoot, "report-data.json");

export function createEmptyReport(config: TesterConfig): ReportData {
  const report: ReportData = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    repoRoot: config.repoRoot,
    month: {
      startDate: config.month.startDate,
      endDate: config.month.endDate,
      totalDays: 0,
      workingDays: 0,
      halfDays: 0,
      offDays: 0
    },
    environment: {
      apiOrigin: config.runtime.apiOrigin,
      webOrigin: config.runtime.webOrigin,
      databaseUrl: config.runtime.databaseUrl,
      storageRoot: config.runtime.storageRoot,
      pushConfigured: false,
      secureContextExpected: false
    },
    personas: allPersonas,
    projects: projectBlueprints,
    events: [],
    uiResults: [],
    findings: [],
    technicalAudit: [],
    artifacts: [],
    metrics: {
      totalEvents: 0,
      passedEvents: 0,
      expectedFailures: 0,
      warnings: 0,
      unexpectedFailures: 0,
      notesCreated: 0,
      filesUploaded: 0,
      downloadsAttempted: 0,
      locationPings: 0,
      notificationsSent: 0,
      notificationFailures: 0,
      workStarts: 0,
      workEnds: 0,
      projectCreateAttempts: 0,
      projectDeleteAttempts: 0
    },
    daily: monthDateRange(config.month.startDate, config.month.endDate).map((date) => ({
      date,
      weekday: "",
      mode: "off-day",
      events: 0,
      passes: 0,
      expectedFailures: 0,
      unexpectedFailures: 0,
      projectCount: 0,
      assignmentCount: 0,
      noteCount: 0,
      fileCount: 0,
      pingCount: 0,
      notificationCount: 0
    })),
    personaScores: allPersonas.map((persona) => ({
      username: persona.username,
      displayName: persona.displayName,
      completedActions: 0,
      failedActions: 0,
      expectedFailures: 0,
      uiPassCount: 0,
      uiFailCount: 0,
      qualitative: persona.summary
    }))
  };

  return summarizeMonth(config, report);
}

export async function loadOrCreateReport(config: TesterConfig) {
  try {
    return await readJson<ReportData>(reportDataPath);
  } catch {
    const report = createEmptyReport(config);
    await saveReport(report);
    return report;
  }
}

export async function saveReport(report: ReportData) {
  report.generatedAt = new Date().toISOString();
  await writeJson(reportDataPath, report);
}
