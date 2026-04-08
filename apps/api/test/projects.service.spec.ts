import { Role } from "@prisma/client";
import { ProjectsService } from "../src/projects/projects.service";
import * as storage from "../src/common/utils/storage";

jest.mock("../src/common/utils/storage", () => ({
  ensureDir: jest.fn(),
  getStorageRoot: jest.fn(() => "C:/storage"),
  removeEmptyStorageDirectories: jest.fn(),
  removeStoredFiles: jest.fn(),
  removeStorageTree: jest.fn(),
  resolveStoragePath: jest.fn((value: string) => `C:/storage/${value}`),
  writeBufferToStorage: jest.fn()
}));

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
    const service = new ProjectsService(prisma as never, storageService as never);

    await expect(
      service.create(
        {
          name: "Test Proje"
        },
        actor as never
      )
    ).rejects.toThrow("db-failed");

    expect(storage.ensureDir).toHaveBeenCalledTimes(2);
    expect(storage.removeStorageTree).toHaveBeenCalledWith(expect.stringMatching(/^projects\//));
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

    (storage.writeBufferToStorage as jest.Mock).mockResolvedValue({
      absolutePath: "C:/storage/projects/project-1/main/proje/a.pdf",
      relativeDirectory: "projects/project-1/main/proje",
      relativePath: "projects/project-1/main/proje/a.pdf"
    });

    const storageService = createStorageServiceMock();
    const service = new ProjectsService(prisma as never, storageService as never);

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

    expect(storage.removeStoredFiles).toHaveBeenCalledWith([
      "projects/project-1/main/proje/a.pdf"
    ]);
    expect(storage.removeEmptyStorageDirectories).toHaveBeenCalledWith(
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
    const service = new ProjectsService(prisma as never, storageService as never);
    jest.spyOn(service, "listMainFiles").mockResolvedValue([] as never);

    await service.deleteMainFile("project-1", "file-1", actor as never);

    expect(storage.removeStoredFiles).toHaveBeenCalledWith([
      "projects/project-1/main/proje/a.pdf",
      "projects/project-1/main/proje/b.pdf"
    ]);
    expect(storage.removeEmptyStorageDirectories).toHaveBeenCalledWith(
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
