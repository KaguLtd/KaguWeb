import { StorageService } from "../src/storage/storage.service";

describe("StorageService", () => {
  function createPrismaMock() {
    return {
      project: {
        count: jest.fn().mockResolvedValue(12),
        findMany: jest.fn()
      },
      customer: {
        count: jest.fn().mockResolvedValue(4)
      },
      user: {
        count: jest.fn()
          .mockResolvedValueOnce(11)
          .mockResolvedValueOnce(9)
          .mockResolvedValueOnce(2)
          .mockResolvedValueOnce(7)
      },
      dailyProgram: {
        count: jest.fn().mockResolvedValue(21)
      },
      notificationCampaign: {
        count: jest.fn().mockResolvedValue(7)
      },
      fieldFormResponse: {
        count: jest.fn().mockResolvedValue(15)
      },
      programTemplate: {
        count: jest.fn().mockResolvedValue(5)
      },
      projectFileVersion: {
        findMany: jest.fn()
      },
      $transaction: jest.fn(),
      jobExecution: {
        count: jest.fn().mockResolvedValue(8)
      }
    };
  }

  function createStorageDriverMock() {
    return {
      ensureDirectory: jest.fn(),
      pathExists: jest.fn(),
      writeBuffer: jest.fn(),
      writeText: jest.fn().mockResolvedValue({
        absolutePath: "C:/storage/backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici.json",
        relativePath: "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici.json"
      }),
      appendJsonLine: jest.fn(),
      moveTree: jest.fn(),
      removeTree: jest.fn(),
      removeFiles: jest.fn(),
      removeEmptyDirectories: jest.fn(),
      createReadStream: jest.fn(),
      readText: jest.fn(),
      resolveAccess: jest.fn()
    };
  }

  function createStoragePathServiceMock() {
    return {
      projectScaffoldDirectories: jest.fn(),
      projectNotesLogFile: jest.fn(),
      projectEventsLogFile: jest.fn(),
      projectMetadataFile: jest.fn(),
      programEventsLogFile: jest.fn(),
      systemEventsLogFile: jest.fn().mockReturnValue("system/events.ndjson")
    };
  }

  it("writes a storage snapshot export manifest with aggregate counts", async () => {
    const prisma = createPrismaMock();
    prisma.project.count
      .mockResolvedValueOnce(12)
      .mockResolvedValueOnce(3);
    const storageDriver = createStorageDriverMock();
    const service = new StorageService(
      prisma as never,
      storageDriver as never,
      createStoragePathServiceMock() as never
    );

    const result = await service.exportOperationalSnapshot({
      actor: {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      label: "Nisan Export",
      timestamp: new Date("2026-04-10T10:00:00.000Z")
    });

    expect(storageDriver.writeText).toHaveBeenCalledWith(
      "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.json",
      expect.stringContaining('"manifestVersion": 2')
    );
    expect(storageDriver.writeText).toHaveBeenCalledWith(
      "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.json",
      expect.stringContaining('"algorithm": "sha256"')
    );
    expect(storageDriver.writeText).toHaveBeenCalledWith(
      "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.summary.json",
      expect.stringContaining('"exportType": "operational-snapshot-summary"')
    );
    expect(result).toEqual({
      relativePath: "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici.json",
      absolutePath: "C:/storage/backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici.json",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan Export",
      metadata: {
        relativePath: "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.json",
        date: "2026-04-10",
        actorUsername: "yonetici",
        actorRole: "MANAGER"
      },
      inventory: {
        artifactCount: 3,
        artifacts: [
          {
            type: "manifest",
            relativePath: "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.json"
          },
          {
            type: "summary",
            relativePath: "backups/exports/2026-04-10/2026-04-10T10-00-00.000Z-yonetici-nisan-export.summary.json"
          },
          {
            type: "system-event-log",
            relativePath: "system/events.ndjson"
          }
        ],
        relatedLogs: ["system/events.ndjson"]
      },
      integrity: {
        algorithm: "sha256",
        payloadSha256: expect.any(String),
        payloadBytes: expect.any(Number)
      },
      counts: {
        projects: 12,
        activeProjects: 9,
        archivedProjects: 3,
        customers: 4,
        totalUsers: 11,
        activeUsers: 9,
        inactiveUsers: 2,
        activeManagers: 2,
        activeFieldUsers: 7,
        dailyPrograms: 21,
        notificationCampaigns: 7,
        fieldFormResponses: 15,
        programTemplates: 5,
        jobExecutions: 8
      }
    });
  });
});
