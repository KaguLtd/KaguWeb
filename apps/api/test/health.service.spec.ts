jest.mock("node:fs/promises", () => ({
  access: jest.fn(),
  mkdir: jest.fn()
}));

import { access, mkdir } from "node:fs/promises";
import { HealthService } from "../src/health/health.service";

describe("HealthService", () => {
  const accessMock = access as jest.Mock;
  const mkdirMock = mkdir as jest.Mock;

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createService(options?: {
    databaseError?: Error;
    storageError?: Error;
    storageRoot?: string;
  }) {
    const prisma = {
      $queryRaw: options?.databaseError
        ? jest.fn().mockRejectedValue(options.databaseError)
        : jest.fn().mockResolvedValue([{ ok: 1 }])
    };

    mkdirMock.mockResolvedValue(undefined);
    accessMock.mockResolvedValue(undefined);

    if (options?.storageError) {
      accessMock.mockRejectedValue(options.storageError);
    }

    const configService = {
      getOrThrow: jest.fn().mockReturnValue(options?.storageRoot ?? "./storage")
    };

    return {
      prisma,
      configService,
      service: new HealthService(prisma as never, configService as never)
    };
  }

  it("returns a basic health snapshot", () => {
    const { service } = createService();
    const result = service.getHealth();

    expect(result.status).toBe("ok");
    expect(result.service).toBe("kagu-api");
    expect(typeof result.timestamp).toBe("string");
  });

  it("reports readiness ok when database and storage checks pass", async () => {
    const { prisma, service } = createService({ storageRoot: "./runtime/storage" });
    const result = await service.getReadiness();

    expect(result.status).toBe("ok");
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    expect(mkdirMock).toHaveBeenCalledTimes(1);
    expect(accessMock).toHaveBeenCalledTimes(1);
    expect(result.checks.storage.path).toContain("runtime");
  });

  it("returns error readiness when the database check fails", async () => {
    const { service } = createService({
      databaseError: new Error("database unavailable")
    });
    const result = await service.getReadiness();

    expect(result.status).toBe("error");
    expect(result.checks.database).toEqual({
      status: "error",
      detail: "database unavailable"
    });
  });

  it("returns error readiness when the storage check fails", async () => {
    const { service } = createService({
      storageError: new Error("access denied")
    });
    const result = await service.getReadiness();

    expect(result.status).toBe("error");
    expect(result.checks.storage).toMatchObject({
      status: "error",
      detail: "access denied"
    });
  });
});
