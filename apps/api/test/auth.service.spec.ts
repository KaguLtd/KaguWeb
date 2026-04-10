jest.mock("bcryptjs", () => ({
  compare: jest.fn(),
  hash: jest.fn()
}));

jest.mock("node:crypto", () => {
  const actual = jest.requireActual("node:crypto");
  return {
    ...actual,
    randomUUID: jest.fn(() => "session-1"),
    randomBytes: jest.fn(() => Buffer.from("00112233445566778899aabbccddeeff", "hex"))
  };
});

import {
  BadRequestException,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { Role } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import { createHash } from "node:crypto";
import { AuthService } from "../src/auth/auth.service";

describe("AuthService", () => {
  const compareMock = compare as unknown as jest.Mock;
  const hashMock = hash as unknown as jest.Mock;

  const user = {
    id: "user-1",
    username: "yonetici",
    displayName: "Ana Yonetici",
    role: Role.MANAGER,
    isActive: true,
    passwordHash: "stored-password-hash"
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  function createService(overrides?: {
    prisma?: Partial<{
      user: {
        count: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
      };
      authSession: {
        create: jest.Mock;
        findUnique: jest.Mock;
        update: jest.Mock;
        updateMany: jest.Mock;
      };
      $transaction: jest.Mock;
    }>;
    jwtService?: {
      signAsync: jest.Mock;
    };
  }) {
    const prisma = {
      user: {
        count: jest.fn().mockResolvedValue(1),
        findUnique: jest.fn(),
        update: jest.fn()
      },
      authSession: {
        create: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn()
      },
      $transaction: jest.fn()
    };

    const jwtService = {
      signAsync: jest.fn().mockResolvedValue("access-token")
    };

    return {
      prisma: {
        ...prisma,
        ...overrides?.prisma
      },
      jwtService: {
        ...jwtService,
        ...overrides?.jwtService
      },
      service: new AuthService(
        {
          ...prisma,
          ...overrides?.prisma
        } as never,
        {
          ...jwtService,
          ...overrides?.jwtService
        } as never
      )
    };
  }

  it("rejects login when the system has no manager account yet", async () => {
    const { service } = createService({
      prisma: {
        user: {
          count: jest.fn().mockResolvedValue(0),
          findUnique: jest.fn(),
          update: jest.fn()
        }
      }
    });

    await expect(
      service.login({
        username: "yonetici",
        password: "Secret123!"
      })
    ).rejects.toThrow(ServiceUnavailableException);
  });

  it("issues a refresh session and auth response on successful login", async () => {
    compareMock.mockResolvedValue(true);

    const authSessionCreate = jest.fn().mockResolvedValue({
      id: "session-1",
      rememberMe: false
    });
    const { prisma, jwtService, service } = createService({
      prisma: {
        user: {
          count: jest.fn().mockResolvedValue(1),
          findUnique: jest.fn().mockResolvedValue(user),
          update: jest.fn()
        },
        authSession: {
          create: authSessionCreate,
          findUnique: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn()
        }
      }
    });

    const result = await service.login(
      {
        username: "yonetici",
        password: "Secret123!",
        rememberMe: false
      },
      "jest-agent"
    );

    expect(result).toEqual({
      auth: {
        accessToken: "access-token",
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role
        }
      },
      refreshToken: "session-1.00112233445566778899aabbccddeeff",
      rememberMe: false
    });
    expect(authSessionCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "session-1",
        userId: user.id,
        rememberMe: false,
        userAgent: "jest-agent",
        tokenHash: createHash("sha256")
          .update("session-1.00112233445566778899aabbccddeeff")
          .digest("hex"),
        expiresAt: expect.any(Date)
      })
    });
    expect(jwtService.signAsync).toHaveBeenCalledWith({
      sub: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({
      where: {
        username: "yonetici"
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        passwordHash: true
      }
    });
  });

  it("revokes expired refresh sessions", async () => {
    const refreshToken = "expired-session.secret";
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const authSessionUpdate = jest.fn().mockResolvedValue(undefined);
    const { service } = createService({
      prisma: {
        authSession: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: "expired-session",
            userId: user.id,
            tokenHash,
            rememberMe: true,
            expiresAt: new Date(Date.now() - 60_000),
            revokedAt: null,
            userAgent: "old-agent",
            user
          }),
          update: authSessionUpdate,
          updateMany: jest.fn()
        }
      }
    });

    let error: unknown;
    try {
      await service.refresh(refreshToken, "new-agent");
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect((error as Error).message).toContain("Oturum suresi doldu.");
    expect(authSessionUpdate).toHaveBeenCalledWith({
      where: {
        id: "expired-session"
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
  });

  it("changes the password, revokes old sessions and preserves rememberMe from the current session", async () => {
    compareMock.mockResolvedValue(true);
    hashMock.mockResolvedValue("new-password-hash" as never);

    const refreshToken = "current-session.secret";
    const tokenHash = createHash("sha256").update(refreshToken).digest("hex");
    const tx = {
      user: {
        update: jest.fn().mockResolvedValue({
          ...user,
          passwordHash: "new-password-hash"
        })
      },
      authSession: {
        create: jest.fn().mockResolvedValue({
          id: "session-1",
          rememberMe: false
        }),
        updateMany: jest.fn().mockResolvedValue(undefined)
      }
    };
    const transactionMock = jest.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx));
    const { service } = createService({
      prisma: {
        user: {
          count: jest.fn().mockResolvedValue(1),
          findUnique: jest.fn().mockResolvedValue(user),
          update: jest.fn()
        },
        authSession: {
          create: jest.fn(),
          findUnique: jest.fn().mockResolvedValue({
            id: "current-session",
            userId: user.id,
            tokenHash,
            rememberMe: false,
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            userAgent: "old-agent",
            user
          }),
          update: jest.fn(),
          updateMany: jest.fn()
        },
        $transaction: transactionMock
      },
      jwtService: {
        signAsync: jest.fn().mockResolvedValue("rotated-access-token")
      }
    });

    const result = await service.changePassword(
      {
        sub: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role
      },
      {
        currentPassword: "OldPass123!",
        newPassword: "NewPass123!"
      },
      refreshToken,
      "new-agent"
    );

    expect(hashMock).toHaveBeenCalledWith("NewPass123!", 10);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: {
        id: user.id
      },
      data: {
        passwordHash: "new-password-hash"
      },
      select: {
        id: true,
        username: true,
        displayName: true,
        role: true,
        isActive: true,
        passwordHash: true
      }
    });
    expect(tx.authSession.updateMany).toHaveBeenCalledWith({
      where: {
        userId: user.id,
        revokedAt: null
      },
      data: {
        revokedAt: expect.any(Date)
      }
    });
    expect(tx.authSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: "session-1",
        userId: user.id,
        rememberMe: false,
        userAgent: "new-agent"
      })
    });
    expect(result).toEqual({
      auth: {
        accessToken: "rotated-access-token",
        user: {
          id: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role
        }
      },
      refreshToken: "session-1.00112233445566778899aabbccddeeff",
      rememberMe: false
    });
  });

  it("rejects password changes when the new password matches the current password", async () => {
    compareMock.mockResolvedValue(true);

    const { service } = createService({
      prisma: {
        user: {
          count: jest.fn().mockResolvedValue(1),
          findUnique: jest.fn().mockResolvedValue(user),
          update: jest.fn()
        }
      }
    });

    await expect(
      service.changePassword(
        {
          sub: user.id,
          username: user.username,
          displayName: user.displayName,
          role: user.role
        },
        {
          currentPassword: "Secret123!",
          newPassword: "Secret123!"
        }
      )
    ).rejects.toThrow(BadRequestException);
  });
});
