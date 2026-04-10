import { constants } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../prisma/prisma.service";

type CheckResult = {
  status: "ok" | "error";
  detail?: string;
  path?: string;
};

@Injectable()
export class HealthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  getHealth() {
    return {
      status: "ok" as const,
      service: "kagu-api",
      timestamp: new Date().toISOString(),
      uptimeSeconds: Math.round(process.uptime())
    };
  }

  async getReadiness() {
    const [database, storage] = await Promise.all([this.checkDatabase(), this.checkStorage()]);
    const status = database.status === "ok" && storage.status === "ok" ? "ok" : "error";

    return {
      status,
      timestamp: new Date().toISOString(),
      checks: {
        database,
        storage
      }
    };
  }

  private async checkDatabase(): Promise<CheckResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch (error) {
      return {
        status: "error",
        detail: this.toErrorMessage(error)
      };
    }
  }

  private async checkStorage(): Promise<CheckResult> {
    const configuredRoot = this.configService.getOrThrow<string>("STORAGE_ROOT");
    const storagePath = resolve(configuredRoot);

    try {
      await mkdir(storagePath, { recursive: true });
      await access(storagePath, constants.R_OK | constants.W_OK);
      return {
        status: "ok",
        path: storagePath
      };
    } catch (error) {
      return {
        status: "error",
        path: storagePath,
        detail: this.toErrorMessage(error)
      };
    }
  }

  private toErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return "Unknown readiness error.";
  }
}
