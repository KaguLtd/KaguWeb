import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { Prisma, Role } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";
import { UserFiltersDto } from "./dto/user-filters.dto";

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto) {
    await this.ensureUsernameAvailable(dto.username);

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username.trim(),
        displayName: dto.displayName.trim(),
        passwordHash,
        role: dto.role
      },
      include: this.userListInclude()
    });

    return this.mapUserSummary(user);
  }

  async findAll(filters: UserFiltersDto = {}) {
    const users = await this.prisma.user.findMany({
      where: {
        role: filters.role,
        isActive:
          filters.status === "all" || filters.status === undefined
            ? undefined
            : filters.status === "active",
        OR: filters.query?.trim()
          ? [
              { username: { contains: filters.query.trim(), mode: "insensitive" } },
              { displayName: { contains: filters.query.trim(), mode: "insensitive" } }
            ]
          : undefined
      },
      include: this.userListInclude(),
      orderBy: [{ isActive: "desc" }, { displayName: "asc" }]
    });

    return users.map((user) => this.mapUserSummary(user));
  }

  async update(userId: string, dto: UpdateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!existing) {
      throw new NotFoundException("Kullanici bulunamadi.");
    }

    if (dto.username && dto.username.trim() !== existing.username) {
      await this.ensureUsernameAvailable(dto.username, userId);
    }

    if ((dto.isActive === false || dto.role === Role.FIELD) && existing.role === Role.MANAGER) {
      await this.assertAnotherActiveManagerExists(userId);
    }

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: dto.username?.trim(),
        displayName: dto.displayName?.trim(),
        role: dto.role,
        isActive: dto.isActive,
        passwordHash: dto.password ? await bcrypt.hash(dto.password, 10) : undefined
      },
      include: this.userListInclude()
    });

    if (
      dto.password ||
      dto.isActive === false ||
      (dto.role !== undefined && dto.role !== existing.role)
    ) {
      await this.prisma.authSession.updateMany({
        where: {
          userId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
    }

    return this.mapUserSummary(user);
  }

  async remove(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            assignments: true,
            workSessions: true,
            locationPings: true,
            notificationSubscriptions: true,
            sentNotificationCampaigns: true,
            receivedNotificationDeliveries: true,
            createdProjects: true,
            createdPrograms: true
          }
        }
      }
    });

    if (!user) {
      throw new NotFoundException("Kullanici bulunamadi.");
    }

    if (user.role === Role.MANAGER) {
      await this.assertAnotherActiveManagerExists(userId);
    }

    const hasHistory =
      user._count.assignments > 0 ||
      user._count.workSessions > 0 ||
      user._count.locationPings > 0 ||
      user._count.notificationSubscriptions > 0 ||
      user._count.sentNotificationCampaigns > 0 ||
      user._count.receivedNotificationDeliveries > 0 ||
      user._count.createdProjects > 0 ||
      user._count.createdPrograms > 0;

    if (hasHistory) {
      const updated = await this.prisma.user.update({
        where: { id: userId },
        data: { isActive: false },
        include: this.userListInclude()
      });
      await this.prisma.authSession.updateMany({
        where: {
          userId,
          revokedAt: null
        },
        data: {
          revokedAt: new Date()
        }
      });
      return {
        mode: "deactivated" as const,
        user: this.mapUserSummary(updated)
      };
    }

    await this.prisma.user.delete({ where: { id: userId } });
    return { mode: "deleted" as const };
  }

  private userListInclude() {
    return {
      assignments: {
        where: { isActive: true },
        select: { id: true }
      },
      workSessions: {
        where: { endedAt: null },
        select: { id: true }
      },
      notificationSubscriptions: {
        where: { isActive: true },
        select: { id: true }
      }
    } satisfies Prisma.UserInclude;
  }

  private mapUserSummary(user: {
    id: string;
    username: string;
    displayName: string;
    role: Role;
    isActive: boolean;
    createdAt: Date;
    assignments: Array<{ id: string }>;
    workSessions: Array<{ id: string }>;
    notificationSubscriptions: Array<{ id: string }>;
  }) {
    return {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      isActive: user.isActive,
      createdAt: user.createdAt.toISOString(),
      assignmentCount: user.assignments.length,
      openSessionCount: user.workSessions.length,
      subscriptionCount: user.notificationSubscriptions.length
    };
  }

  private async ensureUsernameAvailable(username: string, currentUserId?: string) {
    const existing = await this.prisma.user.findFirst({
      where: {
        username: { equals: username.trim(), mode: "insensitive" },
        id: currentUserId ? { not: currentUserId } : undefined
      }
    });

    if (existing) {
      throw new ConflictException("Bu kullanici adi zaten mevcut.");
    }
  }

  private async assertAnotherActiveManagerExists(currentManagerId: string) {
    const remainingManagers = await this.prisma.user.count({
      where: {
        role: Role.MANAGER,
        isActive: true,
        id: { not: currentManagerId }
      }
    });

    if (remainingManagers === 0) {
      throw new BadRequestException("Sistemde en az bir aktif yonetici kalmalidir.");
    }
  }
}
