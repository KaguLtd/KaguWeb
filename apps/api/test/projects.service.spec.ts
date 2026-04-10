import { Role } from "@prisma/client";
import { ProjectsService } from "../src/projects/projects.service";

describe("ProjectsService", () => {
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
      resolveUniqueProjectStorageRoot: jest.fn().mockResolvedValue("projects/test-proje__carisiz__2026-04-03"),
      ensureProjectScaffold: jest.fn(),
      appendProjectEvent: jest.fn(),
      writeProjectMetadata: jest.fn()
    };
  }

  function createStorageDriverMock() {
    return {
      ensureDirectory: jest.fn().mockResolvedValue(undefined),
      createReadStream: jest.fn(),
      pathExists: jest.fn(),
      writeBuffer: jest.fn(),
      writeText: jest.fn(),
      appendJsonLine: jest.fn(),
      moveTree: jest.fn(),
      removeTree: jest.fn().mockResolvedValue(undefined),
      removeFiles: jest.fn().mockResolvedValue(undefined),
      removeEmptyDirectories: jest.fn().mockResolvedValue(undefined)
    };
  }

  function createStoragePathServiceMock() {
    return {
      projectMainRoot: jest.fn((storageRoot: string) => `${storageRoot}/main`),
      projectTimelineRoot: jest.fn((storageRoot: string) => `${storageRoot}/timeline`),
      projectMainUploadDirectory: jest.fn((storageRoot: string) => `${storageRoot}/main/proje`),
      projectTimelineUploadDirectory: jest.fn((storageRoot: string) => `${storageRoot}/timeline/2026-03-29`),
      relativeDirectory: jest.fn((storagePath: string) => storagePath.split("/").slice(0, -1).join("/"))
    };
  }

  it("returns a merged timeline with form responses mapped as read-only items", async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({
          id: "project-1",
          storageRoot: "projects/project-1"
        })
      },
      projectAssignment: {
        findFirst: jest.fn()
      },
      projectEntry: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "entry-1",
            projectId: "project-1",
            entryType: "NOTE",
            note: "Gunun notu",
            entryDate: new Date("2026-04-10T00:00:00.000Z"),
            createdAt: new Date("2026-04-10T09:00:00.000Z"),
            actor: {
              id: "field-1",
              username: "saha",
              displayName: "Saha Personeli",
              role: Role.FIELD
            },
            files: []
          }
        ])
      },
      fieldFormResponse: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "response-1",
            projectId: "project-1",
            dailyProgramProjectId: "program-project-1",
            projectEntryId: "entry-1",
            payload: {
              answers: [{ key: "weather", value: "clear" }]
            },
            createdAt: new Date("2026-04-10T10:00:00.000Z"),
            actor: {
              id: "field-1",
              username: "saha",
              displayName: "Saha Personeli",
              role: Role.FIELD
            },
            template: {
              id: "template-1",
              name: "Gunluk Kontrol"
            },
            templateVersion: {
              id: "version-2",
              versionNumber: 2,
              title: "v2"
            }
          }
        ])
      }
    };

    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    const result = await service.getTimeline("project-1", actor as never);

    expect(prisma.projectEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: "project-1" }
      })
    );
    expect(prisma.fieldFormResponse.findMany).toHaveBeenCalledWith({
      where: { projectId: "project-1" },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        },
        template: {
          select: {
            id: true,
            name: true
          }
        },
        templateVersion: {
          select: {
            id: true,
            versionNumber: true,
            title: true
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });
    expect(result).toEqual([
      {
        id: "response-1",
        projectId: "project-1",
        entryType: "FIELD_FORM_RESPONSE",
        note: null,
        entryDate: "2026-04-10T10:00:00.000Z",
        createdAt: "2026-04-10T10:00:00.000Z",
        actor: {
          id: "field-1",
          username: "saha",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        files: [],
        formResponse: {
          id: "response-1",
          templateId: "template-1",
          templateName: "Gunluk Kontrol",
          templateVersionId: "version-2",
          templateVersionNumber: 2,
          templateVersionTitle: "v2",
          dailyProgramProjectId: "program-project-1",
          projectEntryId: "entry-1",
          payload: {
            answers: [{ key: "weather", value: "clear" }]
          }
        }
      },
      {
        id: "entry-1",
        projectId: "project-1",
        entryType: "NOTE",
        note: "Gunun notu",
        entryDate: "2026-04-10T00:00:00.000Z",
        createdAt: "2026-04-10T09:00:00.000Z",
        actor: {
          id: "field-1",
          username: "saha",
          displayName: "Saha Personeli",
          role: Role.FIELD
        },
        files: []
      }
    ]);
  });

  it("cleans prepared storage when project creation fails after scaffold", async () => {
    const prisma = {
      customer: {
        findUnique: jest.fn()
      },
      project: {
        create: jest.fn().mockRejectedValue(new Error("db-failed"))
      }
    };

    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    await expect(
      service.create(
        {
          name: "Test Proje"
        },
        actor as never
      )
    ).rejects.toThrow("db-failed");

    expect(storageDriver.ensureDirectory).toHaveBeenCalledTimes(2);
    expect(storageDriver.removeTree).toHaveBeenCalledWith(expect.stringMatching(/^projects\//));
  });

  it("removes staged main files when the DB transaction fails", async () => {
    const prisma = {
      project: {
        findUnique: jest.fn().mockResolvedValue({
          id: "project-1",
          isArchived: false,
          storageRoot: "projects/project-1"
        })
      },
      $transaction: jest.fn().mockRejectedValue(new Error("tx-failed"))
    };

    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    storageDriver.writeBuffer.mockResolvedValue({
      absolutePath: "C:/storage/projects/project-1/main/proje/a.pdf",
      relativeDirectory: "projects/project-1/main/proje",
      relativePath: "projects/project-1/main/proje/a.pdf"
    });

    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );

    await expect(
      service.uploadMainFiles(
        "project-1",
        {},
        [
          {
            originalname: "a.pdf",
            mimetype: "application/pdf",
            buffer: Buffer.from("pdf"),
            size: 3
          } as Express.Multer.File
        ],
        actor as never
      )
    ).rejects.toThrow("tx-failed");

    expect(storageDriver.removeFiles).toHaveBeenCalledWith([
      "projects/project-1/main/proje/a.pdf"
    ]);
    expect(storageDriver.removeEmptyDirectories).toHaveBeenCalledWith(
      ["projects/project-1/main/proje"],
      "projects/project-1/main"
    );
  });

  it("cleans physical files after deleting a main file record", async () => {
    const prisma = {
      projectFile: {
        findFirst: jest.fn().mockResolvedValue({
          id: "file-1",
          project: {
            storageRoot: "projects/project-1"
          },
          versions: [
            { storagePath: "projects/project-1/main/proje/a.pdf" },
            { storagePath: "projects/project-1/main/proje/b.pdf" }
          ]
        }),
        delete: jest.fn()
      },
      projectFileVersion: {
        deleteMany: jest.fn()
      },
      $transaction: jest.fn().mockResolvedValue(undefined)
    };

    const storageService = createStorageServiceMock();
    const storageDriver = createStorageDriverMock();
    const storagePaths = createStoragePathServiceMock();
    const service = new ProjectsService(
      prisma as never,
      storageService as never,
      storageDriver as never,
      storagePaths as never
    );
    jest.spyOn(service, "listMainFiles").mockResolvedValue([] as never);

    await service.deleteMainFile("project-1", "file-1", actor as never);

    expect(storageDriver.removeFiles).toHaveBeenCalledWith([
      "projects/project-1/main/proje/a.pdf",
      "projects/project-1/main/proje/b.pdf"
    ]);
    expect(storageDriver.removeEmptyDirectories).toHaveBeenCalledWith(
      ["projects/project-1/main/proje", "projects/project-1/main/proje"],
      "projects/project-1/main"
    );
    expect(storageService.appendProjectEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        eventType: "MAIN_FILE_DELETED"
      })
    );
  });
});
