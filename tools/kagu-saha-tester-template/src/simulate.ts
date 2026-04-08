import path from "node:path";
import {
  assetsRoot,
  loadConfig,
  rawRoot,
  runtimeRoot,
  workspaceRoot
} from "./config.js";
import { buildFieldEntryForm, buildInvalidFieldEntryForm, buildMainUploadForm } from "./assets.js";
import { ApiClient } from "./http.js";
import { fieldPersonas, managerPersonas } from "./personas.js";
import { reportDataPath } from "./report-store.js";
import { projectBlueprints } from "./scenarios.js";
import { startIsolatedRuntime } from "./runtime.js";
import type {
  DailyProgramDetail,
  MainFileItem,
  ProgramProjectSummary,
  ProjectSummary,
  ReportData,
  Role,
  SimulationEvent,
  UserSummary
} from "./types.js";
import {
  addArtifact,
  buildEventId,
  monthDateRange,
  weekdayName,
  workMode,
  writeJson
} from "./utils.js";

type UserRecord = UserSummary & {
  token: string;
};

async function main() {
  const config = await loadConfig();
  const runtime = await startIsolatedRuntime(config, {
    api: true,
    web: false,
    runtimeRoot
  });

  try {
    const anonymous = new ApiClient(config);
    const bootstrapAuth = await anonymous.login(
      config.bootstrapAdmin.username,
      config.bootstrapAdmin.password
    );
    const managerApi = anonymous.withToken(bootstrapAuth.accessToken);
    const report = await initializeReport(config, managerApi);

    const users = await ensureUsers(config, managerApi, anonymous, report);
    const projects = await ensureProjects(managerApi, report);

    const workingDates = monthDateRange(config.month.startDate, config.month.endDate).filter(
      (date) => workMode(date, config) !== "off-day"
    );
    const openAssignments = new Map<string, string>();
    const dailySnapshots: Array<Record<string, unknown>> = [];

    for (const [index, date] of workingDates.entries()) {
      const actingManager = index % 3 === 1 ? users.get(config.managerMobile.username)! : users.get(config.bootstrapAdmin.username)!;
      const dayMode = workMode(date, config);
      const programId = await ensureProgram(date, actingManager, report);
      await actingManagerRequest(
        report,
        date,
        actingManager.displayName,
        null,
        "gunluk program notu guncelle",
        true,
        () =>
          new ApiClient(config, actingManager.token).updateProgramNote(
            programId,
            `${weekdayName(date)} operasyon notu: ${dayMode === "half-day" ? "cumartesi yarim gun" : "tam servis gunu"}.`
          )
      );

      const selectedCodes = selectProjectCodes(date, dayMode);
      for (const code of selectedCodes) {
        const project = projects.get(code)!;
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          code,
          "projeyi gunluk programa ekle",
          true,
          () =>
            new ApiClient(config, actingManager.token).addProjectToProgram(programId, {
              projectId: project.id,
              note: `${code} gunluk akisa alindi.`
            })
        );
      }

      let program = await new ApiClient(config, actingManager.token).getDailyProgram(date);
      if (!program) {
        throw new Error(`Gunluk program okunamadi: ${date}`);
      }

      if (program.programProjects.length > 1 && index % 2 === 0) {
        const orderedIds = [...program.programProjects.map((item) => item.id)].reverse();
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          null,
          "program sirasi guncelle",
          true,
          () => new ApiClient(config, actingManager.token).reorderProgram(programId, orderedIds)
        );
        program = (await new ApiClient(config, actingManager.token).getDailyProgram(date))!;
      }

      for (const programProject of program.programProjects) {
        const assignments = baseAssignments(programProject.project.code ?? "");
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          programProject.project.code ?? null,
          "saha atamalari yap",
          true,
          () =>
            new ApiClient(config, actingManager.token).assignUsers(
              programProject.id,
              assignments.map((username) => users.get(username)!.id)
            )
        );
      }

      program = (await new ApiClient(config, actingManager.token).getDailyProgram(date))!;

      if (date === "2026-04-02") {
        const anomaly = projects.get("TST-ANOM-01");
        if (anomaly) {
          await actingManagerRequest(
            report,
            date,
            config.managerMobile.displayName,
            "TST-ANOM-01",
            "yanlis acilan projeyi sil",
            true,
            () => new ApiClient(config, users.get(config.managerMobile.username)!.token).deleteProject(anomaly.id)
          );
          projects.delete("TST-ANOM-01");
        }
      }

      if (date === "2026-04-10") {
        const guardedProject = projects.get("TST-ANOM-02");
        if (guardedProject) {
          await actingManagerRequest(
            report,
            date,
            config.managerMobile.displayName,
            "TST-ANOM-02",
            "gecmisli projeyi silmeyi dene",
            false,
            () => new ApiClient(config, users.get(config.managerMobile.username)!.token).deleteProject(guardedProject.id)
          );
        }
      }

      for (const persona of fieldPersonas) {
        const user = users.get(persona.username)!;
        const userApi = new ApiClient(config, user.token);
        const assignments = await userApi.getAssignments();
        const todayAssignments = assignments.filter((item) => item.dailyProgramDate.slice(0, 10) === date);
        const assignment = todayAssignments[0];
        if (!assignment) {
          continue;
        }

        if (openAssignments.has(persona.username)) {
          await fieldRequest(
            report,
            date,
            persona.displayName,
            assignment.projectCode,
            "acik oturum varken yeni is basi dene",
            false,
            () =>
              userApi.workStart(assignment.assignmentId, {
                note: "Yeni ise baslama denemesi",
                latitude: 41.0,
                longitude: 29.0
              })
          );

          await fieldRequest(
            report,
            date,
            persona.displayName,
            null,
            "onceki gunden kalan oturumu kapat",
            true,
            () =>
              userApi.workEnd(openAssignments.get(persona.username)!, {
                note: "Gecikmeli gun sonu kapamasi",
                latitude: 41.0,
                longitude: 29.0
              })
          );
          openAssignments.delete(persona.username);
        }

        await runFieldPersona(date, report, config, userApi, persona.displayName, persona.username, assignment, program, openAssignments, dayMode);
      }

      if (index % 3 === 0) {
        const fieldIds = fieldPersonas.map((persona) => users.get(persona.username)!.id);
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          null,
          "manuel bildirim gonder",
          true,
          () =>
            new ApiClient(config, actingManager.token).sendManualNotification(
              `${weekdayName(date)} saha kontrolu`,
              "Tum ekipler proje notu ve gun sonu kayitlarini eksiksiz kapatsin.",
              fieldIds
            )
        );
      }

      if (index % 2 === 0) {
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          null,
          "gunluk hatirlatici gonder",
          true,
          () => new ApiClient(config, actingManager.token).sendDailyReminder(date)
        );
      }

      if (date === "2026-04-15" && program.programProjects[0]) {
        await actingManagerRequest(
          report,
          date,
          actingManager.displayName,
          program.programProjects[0].project.code ?? null,
          "gecmisli gunluk kaydi kaldirmayi dene",
          false,
          () => new ApiClient(config, actingManager.token).removeProjectFromProgram(program.programProjects[0].id)
        );
      }

      const managerOverview = await new ApiClient(config, actingManager.token).getManagerOverview(date);
      const trackingOverview = await new ApiClient(config, actingManager.token).getTrackingOverview(date);
      const campaigns = await new ApiClient(config, actingManager.token).listNotificationCampaigns();
      dailySnapshots.push({
        date,
        managerOverview,
        trackingOverview,
        campaigns
      });
    }

    report.environment.pushConfigured = (await managerApi.getNotificationConfig()).enabled;
    report.environment.secureContextExpected = config.runtime.webOrigin.startsWith("https://");
    await writeJson(path.join(rawRoot, "daily-snapshots.json"), dailySnapshots);
    await writeJson(path.join(rawRoot, "events.json"), report.events);
    await writeJson(reportDataPath, report);
    addArtifact(report.artifacts, "raw", "Etkinlik kayitlari", path.join(rawRoot, "events.json"), workspaceRoot);
    addArtifact(report.artifacts, "raw", "Gunluk snapshotlar", path.join(rawRoot, "daily-snapshots.json"), workspaceRoot);
    await writeJson(reportDataPath, report);
  } finally {
    await runtime.stop();
  }
}

async function initializeReport(config: Awaited<ReturnType<typeof loadConfig>>, managerApi: ApiClient) {
  const pushConfig = await managerApi.getNotificationConfig();
  const dates = monthDateRange(config.month.startDate, config.month.endDate);
  const halfDays = dates.filter((date) => workMode(date, config) === "half-day").length;
  const offDays = dates.filter((date) => workMode(date, config) === "off-day").length;
  const report: ReportData = {
    generatedAt: new Date().toISOString(),
    workspaceRoot,
    repoRoot: config.repoRoot,
    month: {
      startDate: config.month.startDate,
      endDate: config.month.endDate,
      totalDays: dates.length,
      workingDays: dates.length - offDays,
      halfDays,
      offDays
    },
    environment: {
      apiOrigin: config.runtime.apiOrigin,
      webOrigin: config.runtime.webOrigin,
      databaseUrl: config.runtime.databaseUrl,
      storageRoot: config.runtime.storageRoot,
      pushConfigured: pushConfig.enabled,
      secureContextExpected: config.runtime.webOrigin.startsWith("https://")
    },
    personas: [...managerPersonas, ...fieldPersonas],
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
    daily: dates.map((date) => ({
      date,
      weekday: weekdayName(date),
      mode: workMode(date, config),
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
    personaScores: [...managerPersonas, ...fieldPersonas].map((persona) => ({
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
  return report;
}

async function ensureUsers(
  config: Awaited<ReturnType<typeof loadConfig>>,
  managerApi: ApiClient,
  anonymous: ApiClient,
  report: ReportData
) {
  const byUsername = new Map<string, UserRecord>();
  const existing = await managerApi.listUsers("status=all");
  const desired = [
    { username: config.managerMobile.username, displayName: config.managerMobile.displayName, role: "MANAGER" as const, password: config.managerMobile.password },
    ...fieldPersonas.map((persona) => ({
      username: persona.username,
      displayName: persona.displayName,
      role: "FIELD" as const,
      password: config.fieldPassword
    }))
  ];

  for (const target of desired) {
    const found = existing.find((item) => item.username === target.username);
    if (!found) {
      await actingManagerRequest(report, config.month.startDate, config.bootstrapAdmin.displayName, null, `kullanici olustur ${target.username}`, true, () => managerApi.createUser(target));
    }
  }

  const refreshed = await managerApi.listUsers("status=all");
  const bootstrapAuth = await anonymous.login(config.bootstrapAdmin.username, config.bootstrapAdmin.password);
  const bootstrapUser = refreshed.find((item) => item.username === config.bootstrapAdmin.username)!;
  byUsername.set(config.bootstrapAdmin.username, { ...bootstrapUser, token: bootstrapAuth.accessToken });

  for (const target of desired) {
    const auth = await anonymous.login(target.username, target.password);
    const user = refreshed.find((item) => item.username === target.username)!;
    byUsername.set(target.username, { ...user, token: auth.accessToken });
  }

  return byUsername;
}

async function ensureProjects(managerApi: ApiClient, report: ReportData) {
  const existing = await managerApi.listProjects("status=all");
  const byCode = new Map<string, ProjectSummary>();

  for (const blueprint of projectBlueprints) {
    let project = existing.find((item) => item.code === blueprint.code);
    if (!project) {
      project = await managerApi.createProject({
        code: blueprint.code,
        name: blueprint.name,
        description: blueprint.description,
        locationLabel: blueprint.locationLabel,
        latitude: blueprint.latitude,
        longitude: blueprint.longitude
      });
      pushEvent(report, {
        id: buildEventId("2026-04-01", "SYSTEM", `create-${blueprint.code}`),
        date: "2026-04-01",
        actor: "SYSTEM",
        role: "SYSTEM",
        projectCode: blueprint.code,
        action: "proje olustur",
        status: "passed",
        expected: true,
        message: `${blueprint.code} olusturuldu.`
      });
    }

    const mainFiles = await managerApi.listMainFiles(project.id);
    if (mainFiles.length === 0) {
      await managerApi.uploadMainFiles(project.id, buildMainUploadForm(blueprint.code.toLowerCase()));
      pushEvent(report, {
        id: buildEventId("2026-04-01", "SYSTEM", `upload-main-${blueprint.code}`),
        date: "2026-04-01",
        actor: "SYSTEM",
        role: "SYSTEM",
        projectCode: blueprint.code,
        action: "ana dosya yukle",
        status: "passed",
        expected: true,
        message: `${blueprint.code} icin ana dosyalar yuklendi.`
      });
    }

    byCode.set(blueprint.code, project);
  }

  return byCode;
}

function selectProjectCodes(date: string, mode: "full-day" | "half-day" | "off-day") {
  const rotations = [
    ["TST-001", "TST-002", "TST-003"],
    ["TST-002", "TST-004", "TST-005"],
    ["TST-001", "TST-004", "TST-006"],
    ["TST-003", "TST-005", "TST-006"]
  ];
  const index = Number(date.slice(-2)) % rotations.length;
  const codes = [...rotations[index]];
  if (date >= "2026-04-08" && date <= "2026-04-18") {
    codes.push("TST-ANOM-02");
  }
  return mode === "half-day" ? codes.slice(0, 2) : codes;
}

function baseAssignments(projectCode: string) {
  switch (projectCode) {
    case "TST-001":
      return ["emre", "ayse"];
    case "TST-002":
      return ["baris", "hakan"];
    case "TST-003":
      return ["sibel", "ayse"];
    case "TST-004":
      return ["emre", "hakan"];
    case "TST-005":
      return ["sibel", "baris"];
    case "TST-006":
      return ["ayse", "emre"];
    case "TST-ANOM-02":
      return ["baris"];
    default:
      return ["emre"];
  }
}

async function runFieldPersona(
  date: string,
  report: ReportData,
  config: Awaited<ReturnType<typeof loadConfig>>,
  userApi: ApiClient,
  displayName: string,
  username: string,
  assignment: Awaited<ReturnType<ApiClient["getAssignments"]>>[number],
  program: DailyProgramDetail,
  openAssignments: Map<string, string>,
  mode: "full-day" | "half-day" | "off-day"
) {
  const projectCode = assignment.projectCode;
  const latBase = config.sampleCoordinates.baseLatitude + Number(date.slice(-2)) / 1000;
  const lngBase = config.sampleCoordinates.baseLongitude + Number(date.slice(-2)) / 1000;

  if (username === "baris" && Number(date.slice(-2)) % 5 === 1) {
    await fieldRequest(report, date, displayName, projectCode, "is basi olmadan gun sonu dene", false, () =>
      userApi.workEnd(assignment.assignmentId, {
        note: "Oturum olmadan kapatma denemesi",
        latitude: latBase,
        longitude: lngBase
      })
    );
  }

  await fieldRequest(report, date, displayName, projectCode, "is basi yap", true, () =>
    userApi.workStart(assignment.assignmentId, {
      note: `${displayName} saha baslangici`,
      latitude: latBase,
      longitude: lngBase
    })
  );

  if (username === "baris") {
    await fieldRequest(report, date, displayName, projectCode, "tekrar is basi dene", false, () =>
      userApi.workStart(assignment.assignmentId, {
        note: "Cift tiklama denemesi",
        latitude: latBase,
        longitude: lngBase
      })
    );
  }

  const pingCount = username === "hakan" ? 5 : username === "baris" ? 3 : username === "ayse" ? 3 : 2;
  for (let index = 0; index < pingCount; index += 1) {
    await fieldRequest(report, date, displayName, projectCode, "konum gonder", true, () =>
      userApi.createLocationPing(assignment.assignmentId, {
        latitude: latBase + index * 0.0007,
        longitude: lngBase + index * 0.0006,
        accuracy: 8 + index,
        source: index === pingCount - 1 ? "manual-check" : "watch"
      })
    );
  }

  if (username === "baris") {
    const anotherProject = program.programProjects.find((item) => item.id !== assignment.dailyProgramProjectId);
    if (anotherProject) {
      await fieldRequest(report, date, displayName, anotherProject.project.code, "yetkisiz proje girisi dene", false, () =>
        userApi.createEntry(anotherProject.id, buildFieldEntryForm("Yetkisiz not girisi denemesi", "document"))
      );
    }

    if (Number(date.slice(-2)) % 7 === 0) {
      await fieldRequest(report, date, displayName, projectCode, "gecersiz dosya yukle", false, () =>
        userApi.createEntry(assignment.dailyProgramProjectId, buildInvalidFieldEntryForm("Engelli uzanti testi"))
      );
    }
  }

  const entryVariant =
    username === "ayse" ? "mixed" : username === "emre" ? "document" : username === "hakan" ? "image" : "document";
  await fieldRequest(report, date, displayName, projectCode, "saha notu ekle", true, () =>
    userApi.createEntry(
      assignment.dailyProgramProjectId,
      buildFieldEntryForm(`${displayName} saha notu ${date}`, entryVariant)
    )
  );

  if (username === "ayse" || username === "emre" || username === "baris") {
    for (const file of assignment.mainFiles.slice(0, username === "ayse" ? 2 : 1)) {
      await fieldRequest(report, date, displayName, projectCode, "ana dosya indir", true, () =>
        userApi.download(file.latestVersion.downloadUrl)
      );
    }
  }

  const shouldLeaveOpen = username === "sibel" && Number(date.slice(-2)) % 6 === 0;
  if (shouldLeaveOpen) {
    openAssignments.set(username, assignment.assignmentId);
    pushEvent(report, {
      id: buildEventId(date, displayName, "gun-sonu-unutuldu"),
      date,
      actor: displayName,
      role: "FIELD",
      projectCode,
      action: "gun sonu unutuldu",
      status: "warning",
      expected: true,
      message: "Persona geregi oturum acik birakildi."
    });
    return;
  }

  await fieldRequest(report, date, displayName, projectCode, "gun sonu yap", true, () =>
    userApi.workEnd(assignment.assignmentId, {
      note: mode === "half-day" ? "Cumartesi yarim gun kapanisi" : "Gun sonu kapandi",
      latitude: latBase + 0.002,
      longitude: lngBase + 0.002
    })
  );
}

async function ensureProgram(date: string, actor: UserRecord, report: ReportData) {
  const api = new ApiClient(await loadConfig(), actor.token);
  const created = await api.createDailyProgram(date);
  pushEvent(report, {
    id: buildEventId(date, actor.displayName, "gunluk-program"),
    date,
    actor: actor.displayName,
    role: "MANAGER",
    projectCode: null,
    action: "gunluk program olustur",
    status: "passed",
    expected: true,
    message: `${date} icin gunluk program hazir.`
  });
  return created.id;
}

async function actingManagerRequest(
  report: ReportData,
  date: string,
  actor: string,
  projectCode: string | null,
  action: string,
  expectSuccess: boolean,
  work: () => Promise<unknown>
) {
  return await recordedRequest(report, date, actor, "MANAGER", projectCode, action, expectSuccess, work);
}

async function fieldRequest(
  report: ReportData,
  date: string,
  actor: string,
  projectCode: string | null,
  action: string,
  expectSuccess: boolean,
  work: () => Promise<unknown>
) {
  return await recordedRequest(report, date, actor, "FIELD", projectCode, action, expectSuccess, work);
}

async function recordedRequest(
  report: ReportData,
  date: string,
  actor: string,
  role: Role,
  projectCode: string | null,
  action: string,
  expectSuccess: boolean,
  work: () => Promise<unknown>
) {
  try {
    const result = await work();
    pushEvent(report, {
      id: buildEventId(date, actor, action),
      date,
      actor,
      role,
      projectCode,
      action,
      status: expectSuccess ? "passed" : "failed",
      expected: expectSuccess,
      message: expectSuccess ? "Beklenen sonuc alindi." : "Beklenen koruma calismadi.",
      metadata: { ok: expectSuccess }
    });
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    pushEvent(report, {
      id: buildEventId(date, actor, `${action}-${Math.random().toString(16).slice(2, 8)}`),
      date,
      actor,
      role,
      projectCode,
      action,
      status: expectSuccess ? "failed" : "expected_failure",
      expected: expectSuccess,
      message,
      metadata: { ok: !expectSuccess }
    });
    if (expectSuccess) {
      return null;
    }
    return null;
  }
}

function pushEvent(report: ReportData, event: SimulationEvent) {
  if (report.events.some((item) => item.id === event.id)) {
    event.id = `${event.id}-${report.events.length + 1}`;
  }
  report.events.push(event);
}

void main();
