import { BadRequestException, ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { Role } from "@prisma/client";
import { JobsService } from "../src/common/jobs/jobs.service";

describe("JobsService", () => {
  const actor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER
  };

  function createPrismaMock() {
    return {
      jobExecution: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn()
      }
    };
  }

  function createStorageServiceMock() {
    return {
      appendSystemEvent: jest.fn().mockResolvedValue(undefined),
      exportOperationalSnapshot: jest.fn()
    };
  }

  function createStorageDriverMock() {
    return {
      resolveAccess: jest.fn(),
      readText: jest.fn(),
      pathExists: jest.fn().mockResolvedValue(true)
    };
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  it("records successful job executions with summary", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const logger = createLoggerMock();
    prisma.jobExecution.create.mockResolvedValue({ id: "job-1" });
    prisma.jobExecution.update.mockResolvedValue(undefined);

    const service = new JobsService(
      prisma as never,
      createStorageDriverMock() as never,
      storageService as never,
      logger as never
    );
    const result = await service.run({
      jobName: "notifications.daily-reminder",
      triggerSource: "api",
      actor: actor as never,
      scope: "notifications:daily-reminder:2026-04-10",
      targetDate: new Date("2026-04-10T00:00:00.000Z"),
      summarizeResult: (value: { campaignId: string }) => ({ campaignId: value.campaignId }),
      action: async () => ({ campaignId: "campaign-1" })
    });

    expect(prisma.jobExecution.create).toHaveBeenCalledWith({
      data: {
        jobName: "notifications.daily-reminder",
        triggerSource: "api",
        scope: "notifications:daily-reminder:2026-04-10",
        actorId: "manager-1",
        targetDate: new Date("2026-04-10T00:00:00.000Z"),
        status: "RUNNING"
      }
    });
    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: { id: "job-1" },
      data: {
        status: "SUCCEEDED",
        finishedAt: expect.any(Date),
        errorMessage: null,
        resultSummary: {
          campaignId: "campaign-1"
        }
      }
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor,
      eventType: "JOB_EXECUTION_SUCCEEDED",
      payload: {
        jobExecutionId: "job-1",
        jobName: "notifications.daily-reminder",
        triggerSource: "api",
        scope: "notifications:daily-reminder:2026-04-10",
        targetDate: "2026-04-10",
        resultSummary: {
          campaignId: "campaign-1"
        }
      }
    });
    expect(logger.info).toHaveBeenCalledWith("job.execution.started", expect.objectContaining({
      jobExecutionId: "job-1",
      jobName: "notifications.daily-reminder"
    }));
    expect(result).toEqual({
      campaignId: "campaign-1"
    });
  });

  it("records failed job executions and rethrows the original error", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const logger = createLoggerMock();
    const failure = new Error("program missing");
    prisma.jobExecution.create.mockResolvedValue({ id: "job-2" });
    prisma.jobExecution.update.mockResolvedValue(undefined);

    const service = new JobsService(
      prisma as never,
      createStorageDriverMock() as never,
      storageService as never,
      logger as never
    );

    await expect(
      service.run({
        jobName: "notifications.daily-reminder",
        triggerSource: "api",
        actor: actor as never,
        scope: "notifications:daily-reminder:2026-04-11",
        targetDate: new Date("2026-04-11T00:00:00.000Z"),
        action: async () => {
          throw failure;
        }
      })
    ).rejects.toThrow("program missing");

    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: { id: "job-2" },
      data: {
        status: "FAILED",
        finishedAt: expect.any(Date),
        errorMessage: "program missing"
      }
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor,
      eventType: "JOB_EXECUTION_FAILED",
      payload: {
        jobExecutionId: "job-2",
        jobName: "notifications.daily-reminder",
        triggerSource: "api",
        scope: "notifications:daily-reminder:2026-04-11",
        targetDate: "2026-04-11",
        errorMessage: "program missing"
      }
    });
    expect(logger.error).toHaveBeenCalledWith("job.execution.failed", {
      jobExecutionId: "job-2",
      jobName: "notifications.daily-reminder",
      triggerSource: "api",
      scope: "notifications:daily-reminder:2026-04-11",
      errorMessage: "program missing"
    });
  });

  it("lists recent executions for managers", async () => {
    const prisma = createPrismaMock();
    prisma.jobExecution.findMany.mockResolvedValue([
      {
        id: "job-1",
        jobName: "program-templates.materialize",
        triggerSource: "api",
        scope: "program-template:template-1",
        status: "SUCCEEDED",
        targetDate: new Date("2026-04-10T00:00:00.000Z"),
        startedAt: new Date("2026-04-10T08:00:00.000Z"),
        finishedAt: new Date("2026-04-10T08:00:03.000Z"),
        errorMessage: null,
        resultSummary: { createdProjectCount: 1 },
        actor: {
          id: "manager-1",
          username: "yonetici",
          displayName: "Ana Yonetici",
          role: Role.MANAGER
        }
      }
    ]);

    const service = new JobsService(
      prisma as never,
      createStorageDriverMock() as never,
      createStorageServiceMock() as never,
      createLoggerMock() as never
    );

    const result = await service.listExecutions(actor as never, {
      status: "SUCCEEDED",
      jobName: "materialize",
      limit: 5
    });

    expect(prisma.jobExecution.findMany).toHaveBeenCalledWith({
      where: {
        jobName: { contains: "materialize", mode: "insensitive" },
        status: "SUCCEEDED"
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: [{ startedAt: "desc" }],
      take: 5
    });
    expect(result).toEqual([
      {
        id: "job-1",
        jobName: "program-templates.materialize",
        triggerSource: "api",
        scope: "program-template:template-1",
        status: "SUCCEEDED",
        targetDate: "2026-04-10",
        startedAt: "2026-04-10T08:00:00.000Z",
        finishedAt: "2026-04-10T08:00:03.000Z",
        errorMessage: null,
        resultSummary: { createdProjectCount: 1 },
        actor: {
          id: "manager-1",
          username: "yonetici",
          displayName: "Ana Yonetici",
          role: Role.MANAGER
        }
      }
    ]);
  });

  it("blocks field users from reading job execution history", async () => {
    const service = new JobsService(
      createPrismaMock() as never,
      createStorageDriverMock() as never,
      createStorageServiceMock() as never,
      createLoggerMock() as never
    );

    await expect(
      service.listExecutions(
        {
          sub: "field-1",
          username: "saha",
          displayName: "Saha Personeli",
          role: Role.FIELD
        } as never,
        {}
      )
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("creates a backup export through the shared job runner", async () => {
    const prisma = createPrismaMock();
    const storageService = createStorageServiceMock();
    const logger = createLoggerMock();
    prisma.jobExecution.create.mockResolvedValue({ id: "job-3" });
    prisma.jobExecution.update.mockResolvedValue(undefined);
    storageService.exportOperationalSnapshot.mockResolvedValue({
      relativePath: "backups/exports/2026-04-10/export.json",
      absolutePath: "C:/storage/backups/exports/2026-04-10/export.json",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      metadata: {
        relativePath: "backups/exports/2026-04-10/export.json",
        date: "2026-04-10",
        actorUsername: "yonetici",
        actorRole: "MANAGER"
      },
      inventory: {
        artifactCount: 3,
        artifacts: [
          { type: "manifest", relativePath: "backups/exports/2026-04-10/export.json" },
          { type: "summary", relativePath: "backups/exports/2026-04-10/export.summary.json" },
          { type: "system-event-log", relativePath: "system/events.ndjson" }
        ],
        relatedLogs: ["system/events.ndjson"]
      },
      integrity: {
        algorithm: "sha256",
        payloadSha256: "abc123",
        payloadBytes: 512
      },
      counts: {
        projects: 12
      }
    });

    const service = new JobsService(
      prisma as never,
      createStorageDriverMock() as never,
      storageService as never,
      logger as never
    );
    const result = await service.createBackupExport(actor as never, {
      label: "Nisan"
    });

    expect(storageService.exportOperationalSnapshot).toHaveBeenCalledWith({
      actor,
      label: "Nisan"
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor,
      eventType: "BACKUP_EXPORT_CREATED",
      payload: {
        relativePath: "backups/exports/2026-04-10/export.json",
        exportedAt: "2026-04-10T10:00:00.000Z",
        label: "Nisan",
        metadata: {
          relativePath: "backups/exports/2026-04-10/export.json",
          date: "2026-04-10",
          actorUsername: "yonetici",
          actorRole: "MANAGER"
        },
        inventory: {
          artifactCount: 3,
          artifacts: [
            { type: "manifest", relativePath: "backups/exports/2026-04-10/export.json" },
            { type: "summary", relativePath: "backups/exports/2026-04-10/export.summary.json" },
            { type: "system-event-log", relativePath: "system/events.ndjson" }
          ],
          relatedLogs: ["system/events.ndjson"]
        },
        integrity: {
          algorithm: "sha256",
          payloadSha256: "abc123",
          payloadBytes: 512
        },
        counts: {
          projects: 12
        }
      }
    });
    expect(prisma.jobExecution.update).toHaveBeenCalledWith({
      where: { id: "job-3" },
      data: {
        status: "SUCCEEDED",
        finishedAt: expect.any(Date),
        errorMessage: null,
        resultSummary: {
          relativePath: "backups/exports/2026-04-10/export.json",
          exportedAt: "2026-04-10T10:00:00.000Z",
          label: "Nisan",
          integrity: {
            algorithm: "sha256",
            payloadSha256: "abc123",
            payloadBytes: 512
          },
          counts: {
            projects: 12
          }
        }
      }
    });
    expect(result).toEqual({
      relativePath: "backups/exports/2026-04-10/export.json",
      absolutePath: "C:/storage/backups/exports/2026-04-10/export.json",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      metadata: {
        relativePath: "backups/exports/2026-04-10/export.json",
        date: "2026-04-10",
        actorUsername: "yonetici",
        actorRole: "MANAGER"
      },
      inventory: {
        artifactCount: 3,
        artifacts: [
          { type: "manifest", relativePath: "backups/exports/2026-04-10/export.json" },
          { type: "summary", relativePath: "backups/exports/2026-04-10/export.summary.json" },
          { type: "system-event-log", relativePath: "system/events.ndjson" }
        ],
        relatedLogs: ["system/events.ndjson"]
      },
      integrity: {
        algorithm: "sha256",
        payloadSha256: "abc123",
        payloadBytes: 512
      },
      counts: {
        projects: 12
      }
    });
  });

  it("resolves allowed artifact downloads for managers", async () => {
    const storageDriver = createStorageDriverMock();
    storageDriver.resolveAccess.mockResolvedValue({
      kind: "redirect",
      url: "/api/storage/object-proxy?path=backups%2Fexports%2F2026-04-10%2Fexport.summary.json"
    });

    const service = new JobsService(
      createPrismaMock() as never,
      storageDriver as never,
      createStorageServiceMock() as never,
      createLoggerMock() as never
    );

    const result = await service.resolveArtifactDownload(actor as never, "backups/exports/2026-04-10/export.summary.json");

    expect(storageDriver.resolveAccess).toHaveBeenCalledWith(
      "backups/exports/2026-04-10/export.summary.json",
      {
        disposition: "attachment",
        filename: "export.summary.json",
        contentType: "application/json"
      }
    );
    expect(result).toEqual({
      access: {
        kind: "redirect",
        url: "/api/storage/object-proxy?path=backups%2Fexports%2F2026-04-10%2Fexport.summary.json"
      },
      filename: "export.summary.json",
      contentType: "application/json"
    });
  });

  it("rejects disallowed artifact paths", async () => {
    const service = new JobsService(
      createPrismaMock() as never,
      createStorageDriverMock() as never,
      createStorageServiceMock() as never,
      createLoggerMock() as never
    );

    await expect(
      service.resolveArtifactDownload(actor as never, "../secret.txt")
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns formatted artifact previews for managers", async () => {
    const storageDriver = createStorageDriverMock();
    storageDriver.readText.mockResolvedValue({
      contents: JSON.stringify({ manifestVersion: 2, counts: { projects: 12 } }),
      truncated: false
    });

    const service = new JobsService(
      createPrismaMock() as never,
      storageDriver as never,
      createStorageServiceMock() as never,
      createLoggerMock() as never
    );

    const result = await service.previewArtifact(
      actor as never,
      "backups/exports/2026-04-10/export.summary.json"
    );

    expect(storageDriver.readText).toHaveBeenCalledWith(
      "backups/exports/2026-04-10/export.summary.json",
      { maxBytes: 12288 }
    );
    expect(result).toEqual({
      path: "backups/exports/2026-04-10/export.summary.json",
      filename: "export.summary.json",
      contentType: "application/json",
      preview: JSON.stringify({ manifestVersion: 2, counts: { projects: 12 } }, null, 2),
      truncated: false,
      previewMode: "json"
    });
  });

  it("prepares backup restore by verifying manifest integrity and inventory", async () => {
    const storageDriver = createStorageDriverMock();
    const manifestPayload = {
      manifestVersion: 2,
      exportType: "operational-snapshot",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      metadata: {
        relativePath: "backups/exports/2026-04-10/export.json",
        date: "2026-04-10",
        actorUsername: "yonetici",
        actorRole: "MANAGER"
      },
      inventory: {
        artifactCount: 3,
        artifacts: [
          { type: "manifest", relativePath: "backups/exports/2026-04-10/export.json" },
          { type: "summary", relativePath: "backups/exports/2026-04-10/export.summary.json" },
          { type: "system-event-log", relativePath: "system/events.ndjson" }
        ],
        relatedLogs: ["system/events.ndjson"]
      },
      counts: {
        projects: 12,
        activeProjects: 9
      }
    };
    const canonicalPayload = JSON.stringify(manifestPayload, null, 2);
    storageDriver.readText.mockResolvedValue({
      contents: JSON.stringify(
        {
          ...manifestPayload,
          integrity: {
            algorithm: "sha256",
            payloadSha256: createHash("sha256").update(canonicalPayload).digest("hex"),
            payloadBytes: Buffer.byteLength(canonicalPayload, "utf8")
          }
        },
        null,
        2
      ),
      truncated: false
    });

    const storageService = createStorageServiceMock();
    const prisma = createPrismaMock();
    prisma.jobExecution.create.mockResolvedValue({ id: "job-restore-1" });
    prisma.jobExecution.update.mockResolvedValue(undefined);

    const service = new JobsService(
      prisma as never,
      storageDriver as never,
      storageService as never,
      createLoggerMock() as never
    );

    const result = await service.prepareBackupRestore(actor as never, {
      manifestPath: "backups/exports/2026-04-10/export.json"
    });

    expect(result).toEqual({
      manifestPath: "backups/exports/2026-04-10/export.json",
      exportType: "operational-snapshot",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      integrityVerified: true,
      inventoryVerified: true,
      missingArtifacts: [],
      artifactCount: 3,
      counts: {
        projects: 12,
        activeProjects: 9
      },
      integrity: {
        expectedSha256: createHash("sha256").update(canonicalPayload).digest("hex"),
        calculatedSha256: createHash("sha256").update(canonicalPayload).digest("hex"),
        expectedBytes: Buffer.byteLength(canonicalPayload, "utf8"),
        calculatedBytes: Buffer.byteLength(canonicalPayload, "utf8")
      },
      artifacts: [
        {
          type: "manifest",
          relativePath: "backups/exports/2026-04-10/export.json",
          exists: true
        },
        {
          type: "summary",
          relativePath: "backups/exports/2026-04-10/export.summary.json",
          exists: true
        },
        {
          type: "system-event-log",
          relativePath: "system/events.ndjson",
          exists: true
        }
      ]
    });
    expect(storageService.appendSystemEvent).toHaveBeenCalledWith({
      actor,
      eventType: "BACKUP_RESTORE_PREPARE_COMPLETED",
      payload: expect.objectContaining({
        manifestPath: "backups/exports/2026-04-10/export.json",
        integrityVerified: true,
        integrity: expect.objectContaining({
          expectedSha256: createHash("sha256").update(canonicalPayload).digest("hex")
        })
      })
    });
  });
});
