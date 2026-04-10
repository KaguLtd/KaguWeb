import { BadRequestException, ConflictException } from "@nestjs/common";
import { IdempotencyStatus, Prisma } from "@prisma/client";
import { IdempotencyService } from "../src/common/idempotency/idempotency.service";

describe("IdempotencyService", () => {
  function createLoggerMock() {
    return {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
  }

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("returns stored response for completed duplicates without re-running the action", async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({
          status: IdempotencyStatus.COMPLETED,
          response: {
            id: "session-1"
          }
        })
      }
    };

    const logger = createLoggerMock();
    const service = new IdempotencyService(prisma as never, logger as never);
    const action = jest.fn();

    await expect(
      service.execute({
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "work-start-123",
        action
      })
    ).resolves.toEqual({
      id: "session-1"
    });

    expect(action).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("idempotency.replay.completed", {
      actorId: "field-1",
      scope: "assignment:1:work-start",
      key: "work-start-123"
    });
  });

  it("rejects malformed idempotency keys", async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn()
      }
    };

    const service = new IdempotencyService(prisma as never, createLoggerMock() as never);

    await expect(
      service.execute({
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "bad key",
        action: async () => ({ ok: true })
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects in-progress duplicates", async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue({
          status: IdempotencyStatus.IN_PROGRESS
        })
      }
    };

    const logger = createLoggerMock();
    const service = new IdempotencyService(prisma as never, logger as never);

    await expect(
      service.execute({
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "work-start-123",
        action: async () => ({ ok: true })
      })
    ).rejects.toBeInstanceOf(ConflictException);
    expect(logger.warn).toHaveBeenCalledWith("idempotency.replay.conflict", {
      actorId: "field-1",
      scope: "assignment:1:work-start",
      key: "work-start-123"
    });
  });

  it("cleans the reservation when the action fails", async () => {
    const prisma = {
      idempotencyKey: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({
          id: "idem-1"
        }),
        deleteMany: jest.fn().mockResolvedValue({
          count: 1
        })
      }
    };

    const service = new IdempotencyService(prisma as never, createLoggerMock() as never);

    await expect(
      service.execute({
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "work-start-123",
        action: async () => {
          throw new Error("boom");
        }
      })
    ).rejects.toThrow("boom");

    expect(prisma.idempotencyKey.deleteMany).toHaveBeenCalledWith({
      where: {
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "work-start-123",
        status: IdempotencyStatus.IN_PROGRESS
      }
    });
  });

  it("returns completed response after a create race instead of re-running the action", async () => {
    const createRaceError = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test"
    });
    const prisma = {
      idempotencyKey: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce({
            status: IdempotencyStatus.COMPLETED,
            response: {
              id: "session-2"
            }
          }),
        create: jest.fn().mockRejectedValue(createRaceError)
      }
    };

    const logger = createLoggerMock();
    const service = new IdempotencyService(prisma as never, logger as never);
    const action = jest.fn();

    await expect(
      service.execute({
        actorId: "field-1",
        scope: "assignment:1:work-start",
        key: "work-start-456",
        action
      })
    ).resolves.toEqual({
      id: "session-2"
    });

    expect(action).not.toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith("idempotency.replay.completed", {
      actorId: "field-1",
      scope: "assignment:1:work-start",
      key: "work-start-456"
    });
  });
});
