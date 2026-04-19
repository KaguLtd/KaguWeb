import { Role } from "@prisma/client";
import { ProgramsService } from "../src/programs/programs.service";

describe("ProgramsService", () => {
  const actor = {
    sub: "manager-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createStorageServiceMock() {
    return {
      appendProjectNote: jest.fn().mockResolvedValue(undefined),
      appendProjectEvent: jest.fn().mockResolvedValue(undefined),
      appendProgramEvent: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createIdempotencyServiceMock() {
    return {
      execute: jest.fn(async ({ action }) => action())
    };
  }

  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  function createProgramTemplatesServiceMock() {
    return {
      seedDailyProgramForDate: jest.fn().mockResolvedValue(undefined),
      seedDailyProgramsForMonth: jest.fn().mockResolvedValue(undefined)
    };
  }

  it("seeds recurring templates before reading month summaries", async () => {
    const prisma = {
      dailyProgram: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const programTemplatesService = createProgramTemplatesServiceMock();

    const service = new ProgramsService(
      prisma as never,
      {} as never,
      { sendAssignmentNotice: jest.fn() } as never,
      createStorageServiceMock() as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      programTemplatesService as never
    );

    await service.getProgramMonthSummary({ month: "2026-03" }, actor as never);

    expect(programTemplatesService.seedDailyProgramsForMonth).toHaveBeenCalledWith(
      "2026-03",
      actor
    );
  });

  it("seeds recurring templates before reading a day detail", async () => {
    const prisma = {
      dailyProgram: {
        findUnique: jest.fn().mockResolvedValue(null)
      }
    };
    const programTemplatesService = createProgramTemplatesServiceMock();

    const service = new ProgramsService(
      prisma as never,
      {} as never,
      { sendAssignmentNotice: jest.fn() } as never,
      createStorageServiceMock() as never,
      createIdempotencyServiceMock() as never,
      createLoggerMock() as never,
      programTemplatesService as never
    );

    await service.getProgramByDate("2026-03-29", actor as never);

    expect(programTemplatesService.seedDailyProgramForDate).toHaveBeenCalledWith(
      new Date("2026-03-29T00:00:00.000Z"),
      actor
    );
  });

  it("cleans staged timeline files when entry creation fails after staging", async () => {
    const stagedFiles = [
      {
        title: "saha.jpg",
        category: "IMAGE",
        extension: ".jpg",
        mimeType: "image/jpeg",
        originalName: "saha.jpg",
        relativeDirectory: "projects/project-1/timeline/2026-03-29",
        relativePath: "projects/project-1/timeline/2026-03-29/saha.jpg",
        size: 32
      }
    ];

    const prisma = {
      dailyProgramProject: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-project-1",
          projectId: "project-1",
          dailyProgram: {
            date: new Date("2026-03-29T00:00:00.000Z")
          },
          project: {
            storageRoot: "projects/project-1"
          },
          assignments: []
        })
      },
      $transaction: jest.fn().mockRejectedValue(new Error("tx-failed"))
    };

    const projectsService = {
      stageTimelineFiles: jest.fn().mockResolvedValue(stagedFiles),
      createTimelineFiles: jest.fn(),
      cleanupStagedTimelineFiles: jest.fn().mockResolvedValue(undefined)
    };
    const notificationsService = {
      sendDailyReminder: jest.fn(),
      sendManual: jest.fn(),
      sendAssignmentNotice: jest.fn()
    };
    const storageService = createStorageServiceMock();
    const idempotencyService = createIdempotencyServiceMock();
    const logger = createLoggerMock();

    const service = new ProgramsService(
      prisma as never,
      projectsService as never,
      notificationsService as never,
      storageService as never,
      idempotencyService as never,
      logger as never,
      createProgramTemplatesServiceMock() as never
    );

    await expect(
      service.createEntry(
        "program-project-1",
        {},
        [
          {
            originalname: "saha.jpg",
            mimetype: "image/jpeg",
            buffer: Buffer.from("img"),
            size: 32
          } as Express.Multer.File
        ],
        actor as never
      )
    ).rejects.toThrow("tx-failed");

    expect(projectsService.stageTimelineFiles).toHaveBeenCalled();
    expect(projectsService.cleanupStagedTimelineFiles).toHaveBeenCalledWith(
      stagedFiles,
      "projects/project-1/timeline"
    );
  });

  it("writes GunlukSaha note audit entries when adding a project to program with a note", async () => {
    const prisma = {
      dailyProgram: {
        findUnique: jest.fn().mockResolvedValue({
          id: "program-1",
          date: new Date("2026-03-29T00:00:00.000Z"),
          _count: { programProjects: 0 }
        })
      },
      project: {
        findUnique: jest.fn().mockResolvedValue({
          id: "project-1",
          name: "Merkez Santiye",
          storageRoot: "projects/merkez-santiye__carisiz__2026-03-29",
          isArchived: false
        })
      },
      dailyProgramProject: {
        upsert: jest.fn().mockResolvedValue({
          id: "program-project-1"
        })
      },
      projectEntry: {
        create: jest.fn().mockResolvedValue({})
      }
    };

    const projectsService = {};
    const notificationsService = {
      sendAssignmentNotice: jest.fn()
    };
    const storageService = createStorageServiceMock();
    const idempotencyService = createIdempotencyServiceMock();
    const logger = createLoggerMock();

    const service = new ProgramsService(
      prisma as never,
      projectsService as never,
      notificationsService as never,
      storageService as never,
      idempotencyService as never,
      logger as never,
      createProgramTemplatesServiceMock() as never
    );

    await service.addProjectToProgram(
      "program-1",
      { projectId: "project-1", note: "Ilk saha plan notu" },
      actor as never
    );

    expect(storageService.appendProjectNote).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "GUNLUK_SAHA",
        note: "Ilk saha plan notu"
      })
    );
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "PROJECT_ADDED_TO_PROGRAM"
      })
    );
  });

  it("audits daily program note updates for linked projects", async () => {
    const prisma = {
      dailyProgram: {
        update: jest.fn().mockResolvedValue({
          id: "program-1",
          date: new Date("2026-03-29T00:00:00.000Z"),
          managerNote: "Tum ekip saat 08:00'de sahada olsun",
          programProjects: [
            {
              project: {
                id: "project-1",
                storageRoot: "projects/merkez-santiye__carisiz__2026-03-29",
                name: "Merkez Santiye",
                customer: null
              }
            }
          ]
        })
      }
    };

    const projectsService = {};
    const notificationsService = {
      sendAssignmentNotice: jest.fn()
    };
    const storageService = createStorageServiceMock();
    const idempotencyService = createIdempotencyServiceMock();
    const logger = createLoggerMock();

    const service = new ProgramsService(
      prisma as never,
      projectsService as never,
      notificationsService as never,
      storageService as never,
      idempotencyService as never,
      logger as never,
      createProgramTemplatesServiceMock() as never
    );

    await service.updateProgramNote(
      "program-1",
      { managerNote: "Tum ekip saat 08:00'de sahada olsun" },
      actor as never
    );

    expect(storageService.appendProjectEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "DAILY_PROGRAM_NOTE_UPDATED"
      })
    );
    expect(storageService.appendProjectNote).toHaveBeenCalledWith(
      expect.objectContaining({
        source: "GUNLUK_SAHA",
        note: "Tum ekip saat 08:00'de sahada olsun"
      })
    );
  });
});
