import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { Prisma, Role } from "@prisma/client";
import type { AuthResponse, SessionUser } from "@kagu/contracts";
import { compare, hash } from "bcryptjs";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { ChangePasswordDto } from "./dto/change-password.dto";
import { LoginDto } from "./dto/login.dto";
import { getRefreshSessionDurationMs } from "./auth-cookie";

type MutablePrismaClient = PrismaService | Prisma.TransactionClient;

type SessionUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  passwordHash: string;
};

type AuthSessionPayload = {
  auth: AuthResponse;
  refreshToken: string;
  rememberMe: boolean;
};

type RefreshSessionRecord = {
  id: string;
  userId: string;
  tokenHash: string;
  rememberMe: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  user: SessionUserRecord;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService
  ) {}

  async login(dto: LoginDto, userAgent?: string | null) {
    await this.assertSystemInitialized();

    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      select: this.authUserSelect()
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Kullanici bulunamadi.");
    }

    const valid = await compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new UnauthorizedException("Sifre hatali.");
    }

    return this.issueSession(this.prisma, user, dto.rememberMe ?? true, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string | null) {
    const session = await this.findValidRefreshSession(refreshToken);
    return this.rotateSession(this.prisma, session, userAgent);
  }

  async logout(refreshToken?: string | null) {
    const sessionId = this.extractSessionId(refreshToken);
    if (!sessionId) {
      return;
    }

    await this.prisma.authSession.updateMany({
      where: {
        id: sessionId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  async changePassword(
    actor: CurrentUserPayload,
    dto: ChangePasswordDto,
    refreshToken?: string | null,
    userAgent?: string | null
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.sub },
      select: this.authUserSelect()
    });

    if (!user || !user.isActive) {
      throw new UnauthorizedException("Kullanici bulunamadi.");
    }

    const currentPasswordValid = await compare(dto.currentPassword, user.passwordHash);
    if (!currentPasswordValid) {
      throw new BadRequestException("Mevcut sifre hatali.");
    }

    if (dto.currentPassword === dto.newPassword) {
      throw new BadRequestException("Yeni sifre mevcut sifreden farkli olmali.");
    }

    const currentSession = refreshToken
      ? await this.findValidRefreshSession(refreshToken).catch(() => null)
      : null;
    const rememberMe = currentSession?.rememberMe ?? true;
    const passwordHash = await hash(dto.newPassword, 10);

    return this.prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: actor.sub },
        data: { passwordHash },
        select: this.authUserSelect()
      });

      await this.revokeUserSessions(tx, actor.sub);
      return this.issueSession(tx, updatedUser, rememberMe, userAgent);
    });
  }

  private async issueSession(
    prisma: MutablePrismaClient,
    user: SessionUserRecord,
    rememberMe: boolean,
    userAgent?: string | null
  ): Promise<AuthSessionPayload> {
    const sessionId = randomUUID();
    const refreshTokenSecret = randomBytes(32).toString("hex");
    const refreshToken = `${sessionId}.${refreshTokenSecret}`;
    const session = await prisma.authSession.create({
      data: {
        id: sessionId,
        userId: user.id,
        tokenHash: this.hashRefreshToken(refreshToken),
        rememberMe,
        userAgent: userAgent ?? null,
        expiresAt: new Date(Date.now() + getRefreshSessionDurationMs(rememberMe))
      }
    });

    return {
      auth: await this.createAuthResponse(user),
      refreshToken,
      rememberMe: session.rememberMe
    };
  }

  private async rotateSession(
    prisma: MutablePrismaClient,
    session: RefreshSessionRecord,
    userAgent?: string | null
  ): Promise<AuthSessionPayload> {
    const refreshTokenSecret = randomBytes(32).toString("hex");
    const refreshToken = `${session.id}.${refreshTokenSecret}`;

    await prisma.authSession.update({
      where: { id: session.id },
      data: {
        tokenHash: this.hashRefreshToken(refreshToken),
        lastUsedAt: new Date(),
        expiresAt: new Date(Date.now() + getRefreshSessionDurationMs(session.rememberMe)),
        userAgent: userAgent ?? session.userAgent ?? null
      }
    });

    return {
      auth: await this.createAuthResponse(session.user),
      refreshToken,
      rememberMe: session.rememberMe
    };
  }

  private async createAuthResponse(user: SessionUserRecord): Promise<AuthResponse> {
    const sessionUser: SessionUser = {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role
    };

    return {
      accessToken: await this.jwtService.signAsync({
        sub: sessionUser.id,
        username: sessionUser.username,
        displayName: sessionUser.displayName,
        role: sessionUser.role
      }),
      user: sessionUser
    };
  }

  private async findValidRefreshSession(refreshToken: string): Promise<RefreshSessionRecord> {
    const sessionId = this.extractSessionId(refreshToken);
    if (!sessionId) {
      throw new UnauthorizedException("Oturum yenileme bilgisi gecersiz.");
    }

    const session = await this.prisma.authSession.findUnique({
      where: { id: sessionId },
      include: {
        user: {
          select: this.authUserSelect()
        }
      }
    });

    if (!session || session.revokedAt || session.tokenHash !== this.hashRefreshToken(refreshToken)) {
      throw new UnauthorizedException("Oturum yenileme bilgisi gecersiz.");
    }

    if (!session.user.isActive) {
      await this.revokeUserSessions(this.prisma, session.userId);
      throw new UnauthorizedException("Kullanici pasif durumda.");
    }

    if (session.expiresAt.getTime() <= Date.now()) {
      await this.prisma.authSession.update({
        where: { id: session.id },
        data: { revokedAt: new Date() }
      });
      throw new UnauthorizedException("Oturum suresi doldu.");
    }

    return session;
  }

  private async revokeUserSessions(prisma: MutablePrismaClient, userId: string) {
    await prisma.authSession.updateMany({
      where: {
        userId,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  private extractSessionId(refreshToken?: string | null) {
    if (!refreshToken) {
      return null;
    }

    const dotIndex = refreshToken.indexOf(".");
    if (dotIndex <= 0) {
      return null;
    }

    return refreshToken.slice(0, dotIndex);
  }

  private hashRefreshToken(value: string) {
    return createHash("sha256").update(value).digest("hex");
  }

  private authUserSelect() {
    return {
      id: true,
      username: true,
      displayName: true,
      role: true,
      isActive: true,
      passwordHash: true
    } satisfies Prisma.UserSelect;
  }

  private async assertSystemInitialized() {
    const managerCount = await this.prisma.user.count({
      where: {
        role: Role.MANAGER
      }
    });

    if (managerCount === 0) {
      throw new ServiceUnavailableException(
        "Sistem henuz initialize edilmedi. Once db:bootstrap-admin komutu ile ilk yonetici hesabini olusturun."
      );
    }
  }
}
