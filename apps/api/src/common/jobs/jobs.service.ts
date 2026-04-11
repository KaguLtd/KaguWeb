import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { createHash } from "node:crypto";
import { basename } from "node:path";
import { Role } from "@prisma/client";
import type { BackupRestorePreparationResult, JobArtifactPreview } from "@kagu/contracts";
import type { CurrentUserPayload } from "../decorators/current-user.decorator";
import { StructuredLoggerService } from "../observability/structured-logger.service";
import { PrismaService } from "../../prisma/prisma.service";
import { StorageDriver } from "../../storage/storage-driver";
import { StorageService } from "../../storage/storage.service";
import { CreateBackupExportDto } from "./dto/create-backup-export.dto";
import { CreateBackupRestorePrepareDto } from "./dto/create-backup-restore-prepare.dto";
import { ListJobExecutionsQueryDto } from "./dto/list-job-executions-query.dto";

type JobActor = CurrentUserPayload | null;

type RunJobParams<T> = {
  jobName: string;
  triggerSource: string;
  actor: JobActor;
  scope?: string;
  targetDate?: Date | null;
  summarizeResult?: (result: T) => Record<string, unknown> | null;
  action: () => Promise<T>;
};

@Injectable()
export class JobsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storageDriver: StorageDriver,
    private readonly storageService: StorageService,
    private readonly logger: StructuredLoggerService
  ) {}

  async run<T>(params: RunJobParams<T>) {
    const jobExecution = (this.prisma as any).jobExecution;
    const execution = await jobExecution.create({
      data: {
        jobName: params.jobName,
        triggerSource: params.triggerSource,
        scope: params.scope ?? null,
        actorId: params.actor?.sub ?? null,
        targetDate: params.targetDate ?? null,
        status: "RUNNING"
      }
    });

    this.logger.info("job.execution.started", {
      jobExecutionId: execution.id,
      jobName: params.jobName,
      triggerSource: params.triggerSource,
      scope: params.scope ?? null,
      actorId: params.actor?.sub ?? null,
      targetDate: params.targetDate?.toISOString().slice(0, 10) ?? null
    });

    try {
      const result = await params.action();
      const resultSummary = params.summarizeResult?.(result) ?? null;

      await jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date(),
          errorMessage: null,
          ...(resultSummary ? { resultSummary } : {})
        }
      });

      await this.storageService.appendSystemEvent({
        actor: params.actor,
        eventType: "JOB_EXECUTION_SUCCEEDED",
        payload: {
          jobExecutionId: execution.id,
          jobName: params.jobName,
          triggerSource: params.triggerSource,
          scope: params.scope ?? null,
          targetDate: params.targetDate?.toISOString().slice(0, 10) ?? null,
          resultSummary
        }
      });

      this.logger.info("job.execution.succeeded", {
        jobExecutionId: execution.id,
        jobName: params.jobName,
        triggerSource: params.triggerSource,
        scope: params.scope ?? null,
        resultSummary
      });

      return result;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Job execution failed.";

      await jobExecution.update({
        where: { id: execution.id },
        data: {
          status: "FAILED",
          finishedAt: new Date(),
          errorMessage
        }
      });

      await this.storageService.appendSystemEvent({
        actor: params.actor,
        eventType: "JOB_EXECUTION_FAILED",
        payload: {
          jobExecutionId: execution.id,
          jobName: params.jobName,
          triggerSource: params.triggerSource,
          scope: params.scope ?? null,
          targetDate: params.targetDate?.toISOString().slice(0, 10) ?? null,
          errorMessage
        }
      });

      this.logger.error("job.execution.failed", {
        jobExecutionId: execution.id,
        jobName: params.jobName,
        triggerSource: params.triggerSource,
        scope: params.scope ?? null,
        errorMessage
      });

      throw error;
    }
  }

  async listExecutions(actor: CurrentUserPayload, query: ListJobExecutionsQueryDto) {
    this.assertManager(actor);

    const jobExecution = (this.prisma as any).jobExecution;
    const executions = await jobExecution.findMany({
      where: {
        jobName: query.jobName ? { contains: query.jobName, mode: "insensitive" } : undefined,
        status: query.status
      },
      include: {
        actor: {
          select: {
            id: true,
            username: true,
            displayName: true,
            role: true
          }
        }
      },
      orderBy: [{ startedAt: "desc" }],
      take: Math.min(100, Math.max(1, query.limit ?? 25))
    });

    return executions.map((execution: any) => ({
      id: execution.id,
      jobName: execution.jobName,
      triggerSource: execution.triggerSource,
      scope: execution.scope,
      status: execution.status,
      targetDate: execution.targetDate?.toISOString().slice(0, 10) ?? null,
      startedAt: execution.startedAt.toISOString(),
      finishedAt: execution.finishedAt?.toISOString() ?? null,
      errorMessage: execution.errorMessage,
      resultSummary: execution.resultSummary,
      actor: execution.actor
        ? {
            id: execution.actor.id,
            username: execution.actor.username,
            displayName: execution.actor.displayName,
            role: execution.actor.role
          }
        : null
    }));
  }

  async createBackupExport(actor: CurrentUserPayload, dto: CreateBackupExportDto) {
    this.assertManager(actor);

    return this.run({
      jobName: "system.backup-export",
      triggerSource: "api",
      actor,
      scope: "backup-export",
      summarizeResult: (result) => ({
        relativePath: result.relativePath,
        exportedAt: result.exportedAt,
        label: result.label,
        integrity: result.integrity,
        counts: result.counts
      }),
      action: async () => {
        const snapshot = await this.storageService.exportOperationalSnapshot({
          actor,
          label: dto.label
        });

        await this.storageService.appendSystemEvent({
          actor,
          eventType: "BACKUP_EXPORT_CREATED",
          payload: {
            relativePath: snapshot.relativePath,
            exportedAt: snapshot.exportedAt,
            label: snapshot.label,
            metadata: snapshot.metadata,
            inventory: snapshot.inventory,
            integrity: snapshot.integrity,
            counts: snapshot.counts
          }
        });

        return snapshot;
      }
    });
  }

  async prepareBackupRestore(actor: CurrentUserPayload, dto: CreateBackupRestorePrepareDto) {
    this.assertManager(actor);
    const manifestArtifact = this.resolveAllowedArtifact(actor, dto.manifestPath);
    if (!manifestArtifact.normalizedPath.startsWith("backups/exports/")) {
      throw new BadRequestException("Restore hazirligi yalnizca export manifest dosyalari icin calisabilir.");
    }

    return this.run({
      jobName: "system.backup-restore-prepare",
      triggerSource: "api",
      actor,
      scope: `backup-restore-prepare:${manifestArtifact.normalizedPath}`,
      summarizeResult: (result: BackupRestorePreparationResult) => ({
        manifestPath: result.manifestPath,
        integrityVerified: result.integrityVerified,
        inventoryVerified: result.inventoryVerified,
        missingArtifacts: result.missingArtifacts,
        artifactCount: result.artifactCount,
        integrity: result.integrity
      }),
      action: async () => {
        const result = await this.verifyBackupManifest(manifestArtifact.normalizedPath);

        await this.storageService.appendSystemEvent({
          actor,
          eventType: "BACKUP_RESTORE_PREPARE_COMPLETED",
          payload: {
            ...result
          }
        });

        return result;
      }
    });
  }

  async resolveArtifactDownload(actor: CurrentUserPayload, relativePath: string) {
    const artifact = this.resolveAllowedArtifact(actor, relativePath);

    this.logger.info("job.artifact.download_requested", {
      actorId: actor.sub,
      path: artifact.normalizedPath
    });

    return {
      access: await this.storageDriver.resolveAccess(artifact.normalizedPath, {
        disposition: "attachment",
        filename: artifact.filename,
        contentType: artifact.contentType
      }),
      filename: artifact.filename,
      contentType: artifact.contentType
    };
  }

  async previewArtifact(actor: CurrentUserPayload, relativePath: string): Promise<JobArtifactPreview> {
    const artifact = this.resolveAllowedArtifact(actor, relativePath);
    if (!["application/json", "application/x-ndjson", "text/plain"].includes(artifact.contentType)) {
      throw new BadRequestException("Bu artifact tipi preview icin desteklenmiyor.");
    }

    const rawPreview = await this.storageDriver.readText(artifact.normalizedPath, {
      maxBytes: 12_288
    });
    const previewMode = artifact.contentType === "application/json"
      ? "json"
      : artifact.contentType === "application/x-ndjson"
        ? "ndjson"
        : "text";
    const formattedPreview = this.formatArtifactPreview(previewMode, rawPreview.contents);

    this.logger.info("job.artifact.preview_requested", {
      actorId: actor.sub,
      path: artifact.normalizedPath,
      previewMode,
      truncated: rawPreview.truncated
    });

    return {
      path: artifact.normalizedPath,
      filename: artifact.filename,
      contentType: artifact.contentType,
      preview: formattedPreview.preview,
      truncated: rawPreview.truncated || formattedPreview.truncated,
      previewMode
    };
  }

  private resolveAllowedArtifact(actor: CurrentUserPayload, relativePath: string) {
    this.assertManager(actor);

    const normalizedPath = relativePath.trim().replaceAll("\\", "/");
    if (!normalizedPath) {
      throw new BadRequestException("Artifact path gereklidir.");
    }

    const allowedPath =
      normalizedPath.startsWith("backups/exports/") || normalizedPath === "system/events.ndjson";
    if (!allowedPath || normalizedPath.includes("..")) {
      throw new BadRequestException("Artifact path izinli degil.");
    }

    const filename = basename(normalizedPath);
    const contentType = filename.endsWith(".json")
      ? "application/json"
      : filename.endsWith(".ndjson")
        ? "application/x-ndjson"
        : filename.endsWith(".log") || filename.endsWith(".txt")
          ? "text/plain"
          : "application/octet-stream";

    return {
      normalizedPath,
      filename,
      contentType
    };
  }

  private formatArtifactPreview(previewMode: JobArtifactPreview["previewMode"], contents: string) {
    if (previewMode === "json") {
      try {
        return {
          preview: JSON.stringify(JSON.parse(contents), null, 2),
          truncated: false
        };
      } catch {
        return {
          preview: contents,
          truncated: false
        };
      }
    }

    if (previewMode === "ndjson") {
      const lines = contents
        .split(/\r?\n/)
        .filter((line) => line.trim().length > 0)
        .slice(0, 20);
      return {
        preview: lines.join("\n"),
        truncated: lines.length >= 20
      };
    }

    return {
      preview: contents,
      truncated: false
    };
  }

  private async verifyBackupManifest(manifestPath: string): Promise<BackupRestorePreparationResult> {
    const manifestText = await this.storageDriver.readText(manifestPath);
    let manifest: Record<string, unknown>;

    try {
      manifest = JSON.parse(manifestText.contents) as Record<string, unknown>;
    } catch {
      throw new BadRequestException("Export manifest JSON olarak parse edilemedi.");
    }

    if (typeof manifest.exportType !== "string" || typeof manifest.exportedAt !== "string") {
      throw new BadRequestException("Export manifest zorunlu alanlari icermiyor.");
    }

    const inventoryValue =
      manifest.inventory && typeof manifest.inventory === "object"
        ? (manifest.inventory as Record<string, unknown>)
        : null;
    const artifacts = Array.isArray(inventoryValue?.artifacts)
      ? inventoryValue?.artifacts
          .map((item) => {
            if (!item || typeof item !== "object") {
              return null;
            }
            const artifact = item as Record<string, unknown>;
            const type = typeof artifact.type === "string" ? artifact.type : "unknown";
            const relativePath =
              typeof artifact.relativePath === "string" ? artifact.relativePath : null;
            return relativePath
              ? {
                  type,
                  relativePath
                }
              : null;
          })
          .filter((value): value is { type: string; relativePath: string } => Boolean(value))
      : [];

    const artifactChecks = await Promise.all(
      artifacts.map(async (artifact) => ({
        ...artifact,
        exists: await this.storageDriver.pathExists(artifact.relativePath)
      }))
    );
    const missingArtifacts = artifactChecks
      .filter((artifact) => !artifact.exists)
      .map((artifact) => artifact.relativePath);

    const integrityValue =
      manifest.integrity && typeof manifest.integrity === "object"
        ? (manifest.integrity as Record<string, unknown>)
        : null;
    const expectedSha =
      typeof integrityValue?.payloadSha256 === "string" ? integrityValue.payloadSha256 : null;
    const expectedBytes =
      typeof integrityValue?.payloadBytes === "number" ? integrityValue.payloadBytes : null;

    const manifestWithoutIntegrity = { ...manifest };
    delete manifestWithoutIntegrity.integrity;
    const canonicalPayload = JSON.stringify(manifestWithoutIntegrity, null, 2);
    const calculatedSha = createHash("sha256").update(canonicalPayload).digest("hex");
    const calculatedBytes = Buffer.byteLength(canonicalPayload, "utf8");
    const integrityVerified =
      expectedSha !== null &&
      expectedBytes !== null &&
      expectedSha === calculatedSha &&
      expectedBytes === calculatedBytes;

    const countsValue =
      manifest.counts && typeof manifest.counts === "object"
        ? (manifest.counts as Record<string, unknown>)
        : null;
    const counts = countsValue
      ? Object.fromEntries(
          Object.entries(countsValue).filter((entry): entry is [string, number] => {
            const [, value] = entry;
            return typeof value === "number";
          })
        )
      : null;

    return {
      manifestPath,
      exportType: manifest.exportType,
      exportedAt: manifest.exportedAt,
      label: typeof manifest.label === "string" ? manifest.label : null,
      integrityVerified,
      inventoryVerified: missingArtifacts.length === 0,
      missingArtifacts,
      artifactCount: artifactChecks.length,
      counts: counts && Object.keys(counts).length ? counts : null
      ,
      integrity: {
        expectedSha256: expectedSha,
        calculatedSha256: calculatedSha,
        expectedBytes,
        calculatedBytes
      },
      artifacts: artifactChecks
    };
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }
}
