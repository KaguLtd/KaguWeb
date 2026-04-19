import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { createHash } from "crypto";
import { Customer, Project, Role } from "@prisma/client";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import { formatDateOnly } from "../common/utils/date";
import { sanitizeFilename } from "../common/utils/file-policy";
import { PrismaService } from "../prisma/prisma.service";
import { StorageDriver } from "./storage-driver";
import { StoragePathService } from "./storage-path.service";

type ProjectWithCustomer = Project & {
  customer: Customer | null;
};

type AuditActor = Pick<CurrentUserPayload, "sub" | "username" | "displayName" | "role"> | null;

type ProjectNoteSource = "PROJECT" | "GUNLUK_SAHA";

type ProjectNoteRecord = {
  timestamp: string;
  projectId: string;
  projectStorageRoot: string;
  source: ProjectNoteSource;
  displayText: string;
  note: string;
  actor: AuditActor;
  context?: Record<string, unknown>;
};

type ProjectEventRecord = {
  timestamp: string;
  eventType: string;
  projectId?: string;
  projectStorageRoot?: string;
  actor: AuditActor;
  payload?: Record<string, unknown>;
};

@Injectable()
export class StorageService implements OnApplicationBootstrap {
  private readonly logger = new Logger(StorageService.name);
  private migrationPromise: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageDriver: StorageDriver,
    private readonly storagePaths: StoragePathService
  ) {}

  async onApplicationBootstrap() {
    await this.migrateLegacyProjectStorage();
  }

  async ensureProjectScaffold(project: ProjectWithCustomer) {
    await Promise.all(
      this.storagePaths
        .projectScaffoldDirectories(project.storageRoot)
        .map((relativePath) => this.storageDriver.ensureDirectory(relativePath))
    );

    await Promise.all([
      this.ensureStorageFile(this.storagePaths.projectNotesLogFile(project.storageRoot)),
      this.ensureStorageFile(this.storagePaths.projectEventsLogFile(project.storageRoot)),
      this.writeProjectMetadata(project)
    ]);
  }

  async writeProjectMetadata(project: ProjectWithCustomer) {
    await this.storageDriver.writeText(
      this.storagePaths.projectMetadataFile(project.storageRoot),
      `${JSON.stringify(
        {
          id: project.id,
          storageRoot: project.storageRoot,
          name: project.name,
          code: project.code,
          customer: project.customer
            ? {
                id: project.customer.id,
                name: project.customer.name
              }
            : null,
          createdAt: project.createdAt.toISOString(),
          updatedAt: project.updatedAt.toISOString()
        },
        null,
        2
      )}\n`
    );
  }

  async appendProjectNote(params: {
    project: ProjectWithCustomer | Pick<Project, "id" | "storageRoot">;
    actor: AuditActor;
    note: string;
    source?: ProjectNoteSource;
    timestamp?: Date;
    context?: Record<string, unknown>;
  }) {
    const trimmedNote = params.note.trim();
    if (!trimmedNote) {
      return;
    }

    const source = params.source ?? "PROJECT";
    const timestamp = (params.timestamp ?? new Date()).toISOString();
    const displayText = source === "GUNLUK_SAHA" ? `GunlukSaha: ${trimmedNote}` : trimmedNote;

    const record: ProjectNoteRecord = {
      timestamp,
      projectId: params.project.id,
      projectStorageRoot: params.project.storageRoot,
      source,
      displayText,
      note: trimmedNote,
      actor: params.actor,
      context: params.context
    };

    await this.storageDriver.appendJsonLine(this.storagePaths.projectNotesLogFile(params.project.storageRoot), record);
  }

  async appendProjectEvent(params: {
    project: Pick<Project, "id" | "storageRoot">;
    actor: AuditActor;
    eventType: string;
    payload?: Record<string, unknown>;
    timestamp?: Date;
  }) {
    const record: ProjectEventRecord = {
      timestamp: (params.timestamp ?? new Date()).toISOString(),
      eventType: params.eventType,
      projectId: params.project.id,
      projectStorageRoot: params.project.storageRoot,
      actor: params.actor,
      payload: params.payload
    };

    await this.storageDriver.appendJsonLine(this.storagePaths.projectEventsLogFile(params.project.storageRoot), record);
  }

  async appendProgramEvent(params: {
    programDate: Date;
    actor: AuditActor;
    eventType: string;
    payload?: Record<string, unknown>;
    timestamp?: Date;
  }) {
    const record: ProjectEventRecord = {
      timestamp: (params.timestamp ?? new Date()).toISOString(),
      eventType: params.eventType,
      actor: params.actor,
      payload: params.payload
    };

    await this.storageDriver.appendJsonLine(this.storagePaths.programEventsLogFile(params.programDate), record);
  }

  async appendSystemEvent(params: {
    actor: AuditActor;
    eventType: string;
    payload?: Record<string, unknown>;
    timestamp?: Date;
  }) {
    const record: ProjectEventRecord = {
      timestamp: (params.timestamp ?? new Date()).toISOString(),
      eventType: params.eventType,
      actor: params.actor,
      payload: params.payload
    };

    await this.storageDriver.appendJsonLine(this.storagePaths.systemEventsLogFile(), record);
  }

  async exportOperationalSnapshot(params: {
    actor: AuditActor;
    label?: string;
    timestamp?: Date;
  }) {
    const timestamp = params.timestamp ?? new Date();
    const labelSegment = params.label?.trim() ? `-${this.toStorageSegment(params.label)}` : "";
    const actorSegment = params.actor?.username ? this.toStorageSegment(params.actor.username) : "system";
    const dateSegment = formatDateOnly(timestamp);
    const timeSegment = timestamp.toISOString().replaceAll(":", "-");
    const relativePath = `backups/exports/${dateSegment}/${timeSegment}-${actorSegment}${labelSegment}.json`;
    const summaryRelativePath = `backups/exports/${dateSegment}/${timeSegment}-${actorSegment}${labelSegment}.summary.json`;

    const [
      projectCount,
      archivedProjectCount,
      customerCount,
      totalUserCount,
      activeUserCount,
      activeManagerCount,
      activeFieldCount,
      dailyProgramCount,
      notificationCampaignCount,
      fieldFormResponseCount,
      programTemplateCount,
      jobExecutionCount
    ] = await Promise.all([
      this.prisma.project.count(),
      this.prisma.project.count({ where: { isArchived: true } }),
      this.prisma.customer.count(),
      this.prisma.user.count(),
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.user.count({ where: { isActive: true, role: Role.MANAGER } }),
      this.prisma.user.count({ where: { isActive: true, role: Role.FIELD } }),
      this.prisma.dailyProgram.count(),
      this.prisma.notificationCampaign.count(),
      this.prisma.fieldFormResponse.count(),
      this.prisma.programTemplate.count(),
      (this.prisma as any).jobExecution.count()
    ]);

    const activeProjectCount = Math.max(0, projectCount - archivedProjectCount);
    const inactiveUserCount = Math.max(0, totalUserCount - activeUserCount);
    const systemEventsLogPath = this.storagePaths.systemEventsLogFile();
    const inventory = {
      artifactCount: 3,
      artifacts: [
        {
          type: "manifest",
          relativePath
        },
        {
          type: "summary",
          relativePath: summaryRelativePath
        },
        {
          type: "system-event-log",
          relativePath: systemEventsLogPath
        }
      ],
      relatedLogs: [systemEventsLogPath]
    };
    const payloadSnapshot = {
      manifestVersion: 2,
      exportType: "operational-snapshot",
      exportedAt: timestamp.toISOString(),
      actor: params.actor,
      label: params.label?.trim() || null,
      metadata: {
        relativePath,
        date: dateSegment,
        actorUsername: params.actor?.username ?? null,
        actorRole: params.actor?.role ?? null
      },
      inventory,
      counts: {
        projects: projectCount,
        activeProjects: activeProjectCount,
        archivedProjects: archivedProjectCount,
        customers: customerCount,
        totalUsers: totalUserCount,
        activeUsers: activeUserCount,
        inactiveUsers: inactiveUserCount,
        activeManagers: activeManagerCount,
        activeFieldUsers: activeFieldCount,
        dailyPrograms: dailyProgramCount,
        notificationCampaigns: notificationCampaignCount,
        fieldFormResponses: fieldFormResponseCount,
        programTemplates: programTemplateCount,
        jobExecutions: jobExecutionCount
      }
    };
    const payloadText = JSON.stringify(payloadSnapshot, null, 2);
    const integrity = {
      algorithm: "sha256",
      payloadSha256: createHash("sha256").update(payloadText).digest("hex"),
      payloadBytes: Buffer.byteLength(payloadText, "utf8")
    };
    const snapshot = {
      ...payloadSnapshot,
      integrity
    };
    const snapshotText = `${JSON.stringify(snapshot, null, 2)}\n`;
    const summaryArtifact = {
      exportType: "operational-snapshot-summary",
      exportedAt: snapshot.exportedAt,
      label: snapshot.label,
      metadata: snapshot.metadata,
      integrity: snapshot.integrity,
      counts: snapshot.counts
    };
    const summaryText = `${JSON.stringify(summaryArtifact, null, 2)}\n`;

    const [writeResult] = await Promise.all([
      this.storageDriver.writeText(relativePath, snapshotText),
      this.storageDriver.writeText(summaryRelativePath, summaryText)
    ]);

    return {
      relativePath: writeResult.relativePath,
      absolutePath: writeResult.absolutePath,
      exportedAt: snapshot.exportedAt,
      label: snapshot.label,
      metadata: snapshot.metadata,
      inventory: snapshot.inventory,
      integrity: snapshot.integrity,
      counts: snapshot.counts
    };
  }

  buildProjectStorageRoot(project: Pick<Project, "id" | "name" | "createdAt">, customer?: Customer | null) {
    const projectSlug = this.toStorageSegment(project.name);
    const customerSlug = customer ? this.toStorageSegment(customer.name) : "carisiz";
    const dateSlug = formatDateOnly(project.createdAt);
    return `projects/${projectSlug}__${customerSlug}__${dateSlug}`;
  }

  async resolveUniqueProjectStorageRoot(
    project: Pick<Project, "id" | "name" | "createdAt">,
    customer: Customer | null,
    excludeProjectId?: string
  ) {
    const baseRoot = this.buildProjectStorageRoot(project, customer);
    let candidate = baseRoot;
    let suffix = 2;

    while (
      await this.prisma.project.findFirst({
        where: {
          storageRoot: candidate,
          id: excludeProjectId ? { not: excludeProjectId } : undefined
        },
        select: { id: true }
      })
    ) {
      candidate = `${baseRoot}__p-${suffix}`;
      suffix += 1;
    }

    return candidate;
  }

  async migrateLegacyProjectStorage() {
    if (!this.migrationPromise) {
      this.migrationPromise = this.runStorageMigration();
    }

    return this.migrationPromise;
  }

  private async runStorageMigration() {
    const projects = await this.prisma.project.findMany({
      include: { customer: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });

    const reservations = new Set<string>();
    for (const project of projects) {
      reservations.add(project.storageRoot);
    }

    for (const project of projects) {
      const targetRoot = this.computeReservedStorageRoot(project, reservations);
      reservations.add(targetRoot);

      if (project.storageRoot === targetRoot) {
        await this.ensureProjectScaffold(project);
        continue;
      }

      const sourceExists = await this.storageDriver.pathExists(project.storageRoot);
      const targetExists = await this.storageDriver.pathExists(targetRoot);

      if (targetExists && sourceExists) {
        this.logger.warn(
          `Storage migration skipped due to existing target path for project ${project.id}: ${targetRoot}`
        );
        continue;
      }

      if (sourceExists && !targetExists) {
        await this.storageDriver.moveTree(project.storageRoot, targetRoot);
      }

      try {
        const versions = await this.prisma.projectFileVersion.findMany({
          where: {
            storagePath: {
              startsWith: `${project.storageRoot}/`
            }
          },
          select: {
            id: true,
            storagePath: true
          }
        });

        await this.prisma.$transaction([
          this.prisma.project.update({
            where: { id: project.id },
            data: { storageRoot: targetRoot }
          }),
          ...versions.map((version) =>
            this.prisma.projectFileVersion.update({
              where: { id: version.id },
              data: {
                storagePath: `${targetRoot}${version.storagePath.slice(project.storageRoot.length)}`
              }
            })
          )
        ]);

        await this.ensureProjectScaffold({ ...project, storageRoot: targetRoot });
      } catch (error) {
        if (sourceExists && !targetExists && (await this.storageDriver.pathExists(targetRoot))) {
          await this.storageDriver.moveTree(targetRoot, project.storageRoot).catch(() => undefined);
        }
        throw error;
      }
    }
  }

  private computeReservedStorageRoot(project: ProjectWithCustomer, reservations: Set<string>) {
    const baseRoot = this.buildProjectStorageRoot(project, project.customer);
    if (!reservations.has(baseRoot) || project.storageRoot === baseRoot) {
      return baseRoot;
    }

    let suffix = 2;
    let candidate = `${baseRoot}__p-${suffix}`;
    while (reservations.has(candidate) && candidate !== project.storageRoot) {
      suffix += 1;
      candidate = `${baseRoot}__p-${suffix}`;
    }

    return candidate;
  }

  private toStorageSegment(value: string) {
    const normalized = sanitizeFilename(value);
    return normalized || "kayitsiz";
  }

  private async ensureStorageFile(relativePath: string) {
    if (await this.storageDriver.pathExists(relativePath)) {
      return;
    }

    await this.storageDriver.writeText(relativePath, "");
  }
}
