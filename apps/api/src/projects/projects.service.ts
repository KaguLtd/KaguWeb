import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException
} from "@nestjs/common";
import { FileCategory, FileScope, Prisma, Role } from "@prisma/client";
import { randomUUID } from "crypto";
import { readFile } from "node:fs/promises";
import { cleanupUploadedTempFiles } from "../common/utils/upload-temp-storage";
import { CurrentUserPayload } from "../common/decorators/current-user.decorator";
import {
  ensureFileAllowed,
  fileExtension,
  fileTitleFromName,
  isImage,
  isInlinePreviewable,
  sanitizeFilename
} from "../common/utils/file-policy";
import { PrismaService } from "../prisma/prisma.service";
import { StorageDriver } from "../storage/storage-driver";
import { StoragePathService } from "../storage/storage-path.service";
import { CreateCustomerDto } from "./dto/create-customer.dto";
import { CreateProjectDto } from "./dto/create-project.dto";
import { ProjectFiltersDto } from "./dto/project-filters.dto";
import { UpdateProjectDto } from "./dto/update-project.dto";
import { UploadMainFileDto } from "./dto/upload-main-file.dto";
import { StorageService } from "../storage/storage.service";

type StagedProjectFile = {
  title: string;
  category: FileCategory;
  extension: string;
  mimeType: string;
  originalName: string;
  relativeDirectory: string;
  relativePath: string;
  size: number;
};

@Injectable()
export class ProjectsService {
  private readonly logger = new Logger(ProjectsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storageService: StorageService,
    private readonly storageDriver: StorageDriver,
    private readonly storagePaths: StoragePathService
  ) {}

  async createCustomer(dto: CreateCustomerDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const name = dto.name.trim();
    const existing = await this.prisma.customer.findFirst({
      where: { name: { equals: name, mode: "insensitive" } }
    });
    if (existing) {
      throw new ConflictException("Bu cari zaten mevcut.");
    }

    const customer = await this.prisma.customer.create({
      data: {
        name,
        note: dto.note?.trim() || null
      },
      include: {
        _count: {
          select: { projects: true }
        }
      }
    });

    return this.mapCustomer(customer);
  }

  async listCustomers(actor: CurrentUserPayload, query?: string, includeArchived = false) {
    this.assertManager(actor);
    const customers = await this.prisma.customer.findMany({
      where: {
        isArchived: includeArchived ? undefined : false,
        name: query?.trim()
          ? {
              contains: query.trim(),
              mode: "insensitive"
            }
          : undefined
      },
      include: {
        _count: {
          select: { projects: true }
        }
      },
      orderBy: [{ isArchived: "asc" }, { name: "asc" }]
    });

    return customers.map((customer) => this.mapCustomer(customer));
  }

  async create(dto: CreateProjectDto, actor: CurrentUserPayload) {
    this.assertManager(actor);

    const customer = await this.resolveCustomer(dto.customerId);
    const createdAt = new Date();
    const code = await this.generateProjectCode(customer?.name ?? null, createdAt);
    const storageRoot = await this.storageService.resolveUniqueProjectStorageRoot(
      {
        id: randomUUID(),
        name: dto.name.trim(),
        createdAt
      },
      customer ?? null
    );

    try {
      await Promise.all([
        this.storageDriver.ensureDirectory(this.storagePaths.projectMainRoot(storageRoot)),
        this.storageDriver.ensureDirectory(this.storagePaths.projectTimelineRoot(storageRoot))
      ]);
    } catch (error) {
      await this.cleanupStorageTree(storageRoot, "Proje storage iskeleti hazirlanamadi.");
      throw error;
    }

    try {
      const project = await this.prisma.project.create({
        data: {
          customerId: customer?.id ?? null,
          name: dto.name.trim(),
          code,
          description: dto.description?.trim() || null,
          locationLabel: dto.locationLabel?.trim() || null,
          latitude: dto.latitude,
          longitude: dto.longitude,
          storageRoot,
          createdById: actor.sub,
          createdAt
        },
        include: this.projectDetailInclude()
      });

      await this.storageService.ensureProjectScaffold(project);
      await this.storageService.appendProjectEvent({
        project,
        actor,
        eventType: "PROJECT_CREATED",
        payload: {
          name: project.name,
          customerName: project.customer?.name ?? null
        },
        timestamp: project.createdAt
      });

      return this.mapProjectSummary(project);
    } catch (error) {
      await this.cleanupStorageTree(storageRoot, "Proje olusturma sonrasinda storage geri alinmadi.");
      this.handleProjectWriteError(error);
    }
  }

  async findAll(user: CurrentUserPayload, filters: ProjectFiltersDto = {}) {
    const projects = await this.prisma.project.findMany({
      where: this.buildProjectWhere(user, filters),
      include: this.projectListInclude(),
      orderBy: [{ isArchived: "asc" }, { updatedAt: "desc" }]
    });

    return projects.map((project) => this.mapProjectSummary(project));
  }

  async findOne(projectId: string, user: CurrentUserPayload) {
    await this.assertProjectAccess(projectId, user);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: this.projectListInclude()
    });
    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    return this.mapProjectSummary(project);
  }

  async update(projectId: string, dto: UpdateProjectDto, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const existing = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!existing) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    const customer =
      dto.customerId === undefined ? undefined : await this.resolveCustomer(dto.customerId ?? null);
    const customerId = customer === undefined ? undefined : customer?.id ?? null;

    try {
      const project = await this.prisma.project.update({
        where: { id: projectId },
        data: {
          customerId,
          name: dto.name?.trim(),
          description:
            dto.description === undefined ? undefined : dto.description?.trim() || null,
          locationLabel:
            dto.locationLabel === undefined ? undefined : dto.locationLabel?.trim() || null,
          latitude: dto.latitude === undefined ? undefined : dto.latitude,
          longitude: dto.longitude === undefined ? undefined : dto.longitude,
          isArchived: dto.isArchived
        },
        include: this.projectDetailInclude()
      });

      await this.storageService.writeProjectMetadata(project);
      await this.storageService.appendProjectEvent({
        project,
        actor,
        eventType: "PROJECT_UPDATED",
        payload: {
          name: project.name,
          customerName: project.customer?.name ?? null,
          isArchived: project.isArchived
        }
      });

      return this.mapProjectSummary(project);
    } catch (error) {
      this.handleProjectWriteError(error);
    }
  }

  async setArchived(projectId: string, isArchived: boolean, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const project = await this.prisma.project.update({
      where: { id: projectId },
      data: { isArchived },
      include: this.projectDetailInclude()
    });
    await this.storageService.writeProjectMetadata(project);
    await this.storageService.appendProjectEvent({
      project,
      actor,
      eventType: isArchived ? "PROJECT_ARCHIVED" : "PROJECT_RESTORED",
      payload: { isArchived }
    });
    return this.mapProjectSummary(project);
  }

  async remove(projectId: string, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const project = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            programProjects: true,
            files: true,
            entries: true,
            locationPings: true
          }
        }
      }
    });

    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    const hasHistory =
      project._count.programProjects > 0 ||
      project._count.files > 0 ||
      project._count.entries > 0 ||
      project._count.locationPings > 0;

    if (hasHistory) {
      throw new BadRequestException(
        "Bu proje silinemez. Gunluk program, timeline veya dosya gecmisi var; arsivleyin."
      );
    }

    await this.prisma.project.delete({ where: { id: projectId } });
    await this.cleanupStorageTree(project.storageRoot, "Silinen proje storage'tan kaldirilamadi.");

    return { success: true };
  }

  async deleteMainFile(projectId: string, fileId: string, actor: CurrentUserPayload) {
    this.assertManager(actor);
    const file = await this.prisma.projectFile.findFirst({
      where: {
        id: fileId,
        projectId,
        scope: FileScope.MAIN
      },
      include: {
        versions: true,
        project: {
          select: {
            storageRoot: true
          }
        }
      }
    });

    if (!file) {
      throw new NotFoundException("Ana dosya bulunamadi.");
    }

    const storagePaths = file.versions.map((version) => version.storagePath);
    await this.prisma.$transaction([
      this.prisma.projectFileVersion.deleteMany({ where: { fileId } }),
      this.prisma.projectFile.delete({ where: { id: fileId } })
    ]);
    await this.storageService.appendProjectEvent({
      project: { id: projectId, storageRoot: file.project.storageRoot },
      actor,
      eventType: "MAIN_FILE_DELETED",
      payload: {
        fileId,
        storagePaths
      }
    });
    await this.cleanupStoredFiles(
      storagePaths,
      file.versions.map((version) => this.directoryNameFromStoragePath(version.storagePath)),
      `${file.project.storageRoot}/main`,
      `Main dosya silindikten sonra fiziksel temizleme tamamlanamadi: ${fileId}`
    );

    return this.listMainFiles(projectId, actor);
  }

  async uploadMainFiles(
    projectId: string,
    dto: UploadMainFileDto,
    files: Express.Multer.File[],
    actor: CurrentUserPayload
  ) {
    this.assertManager(actor);

    const project = await this.prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }
    if (project.isArchived) {
      throw new BadRequestException("Arsivlenmis projeye ana dosya eklenemez.");
    }
    if (!files?.length) {
      throw new BadRequestException("En az bir dosya yukleyin.");
    }

    const projectWithContext = await this.prisma.project.findUnique({
      where: { id: projectId },
      include: { customer: true }
    });

    if (!projectWithContext) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    let stagedFiles: StagedProjectFile[] = [];
    try {
      stagedFiles = await this.stageMainFiles(project.storageRoot, dto, files);
    } finally {
      await cleanupUploadedTempFiles(files);
    }

    try {
      await this.prisma.$transaction(async (tx) => {
        const logicalFiles = new Map<string, { id: string; nextVersionNumber: number }>();

        for (const stagedFile of stagedFiles) {
          let logicalFile = logicalFiles.get(stagedFile.title);
          if (!logicalFile) {
            const existing = await tx.projectFile.findFirst({
              where: {
                projectId,
                scope: FileScope.MAIN,
                title: stagedFile.title
              },
              include: {
                versions: {
                  orderBy: { versionNumber: "desc" },
                  take: 1
                }
              }
            });

            if (existing) {
              logicalFile = {
                id: existing.id,
                nextVersionNumber: (existing.versions[0]?.versionNumber ?? 0) + 1
              };
            } else {
              const createdFile = await tx.projectFile.create({
                data: {
                  projectId,
                  scope: FileScope.MAIN,
                  category: stagedFile.category,
                  title: stagedFile.title,
                  createdById: actor.sub
                }
              });
              logicalFile = { id: createdFile.id, nextVersionNumber: 1 };
            }
            logicalFiles.set(stagedFile.title, logicalFile);
          }

          const versionNumber = logicalFile.nextVersionNumber;
          logicalFile.nextVersionNumber += 1;

          await tx.projectFileVersion.create({
            data: {
              fileId: logicalFile.id,
              versionNumber,
              originalName: stagedFile.originalName,
              storagePath: stagedFile.relativePath,
              mimeType: stagedFile.mimeType,
              extension: stagedFile.extension,
              size: stagedFile.size,
              uploadedById: actor.sub
            }
          });
        }
      });
    } catch (error) {
      await this.cleanupStoredFiles(
        stagedFiles.map((file) => file.relativePath),
        stagedFiles.map((file) => file.relativeDirectory),
        `${project.storageRoot}/main`,
        `Main dosya upload rollback temizligi tamamlanamadi: ${projectId}`
      );
      throw error;
    }

    await this.storageService.appendProjectEvent({
      project: projectWithContext,
      actor,
      eventType: "MAIN_FILES_UPLOADED",
      payload: {
        files: stagedFiles.map((file) => ({
          title: file.title,
          originalName: file.originalName,
          path: file.relativePath
        }))
      }
    });

    return this.listMainFiles(projectId, actor);
  }

  async listMainFiles(projectId: string, user: CurrentUserPayload) {
    await this.assertProjectAccess(projectId, user);

    const files = await this.prisma.projectFile.findMany({
      where: { projectId, scope: FileScope.MAIN },
      include: {
        versions: {
          orderBy: { versionNumber: "desc" },
          take: 1
        },
        _count: {
          select: {
            versions: true
          }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    return files
      .filter((file) => file.versions.length > 0)
      .map((file) => ({
        id: file.id,
        title: file.title,
        scope: file.scope,
        versionCount: file._count.versions,
        latestVersion: this.mapFileVersion(file.versions[0])
      }));
  }

  async downloadVersion(versionId: string, user: CurrentUserPayload, inline = false) {
    const version = await this.prisma.projectFileVersion.findUnique({
      where: { id: versionId },
      include: { file: true }
    });

    if (!version) {
      throw new NotFoundException("Dosya bulunamadi.");
    }

    await this.assertProjectAccess(version.file.projectId, user);

    return {
      access: await this.storageDriver.resolveAccess(version.storagePath, {
        disposition: inline && isInlinePreviewable(version.originalName) ? "inline" : "attachment",
        filename: version.originalName,
        contentType: version.mimeType
      }),
      version,
      inline: inline && isInlinePreviewable(version.originalName)
    };
  }

  async getTimeline(projectId: string, user: CurrentUserPayload) {
    await this.assertProjectAccess(projectId, user);

    const [entries, fieldFormResponses] = await Promise.all([
      this.prisma.projectEntry.findMany({
        where: { projectId },
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              role: true
            }
          },
          files: {
            include: {
              versions: {
                orderBy: { versionNumber: "desc" },
                take: 1
              }
            }
          }
        },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }]
      }),
      this.prisma.fieldFormResponse.findMany({
        where: { projectId },
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
      })
    ]);

    const timeline = [
      ...entries.map((entry) => ({
        id: entry.id,
        projectId: entry.projectId,
        entryType: entry.entryType,
        note: entry.note,
        entryDate: entry.entryDate.toISOString(),
        createdAt: entry.createdAt.toISOString(),
        actor: entry.actor,
        files: entry.files
          .map((file) => file.versions[0])
          .filter(Boolean)
          .map((version) => this.mapFileVersion(version!)),
        formResponse: undefined
      })),
      ...fieldFormResponses.map((response) => ({
        id: response.id,
        projectId: response.projectId,
        entryType: "FIELD_FORM_RESPONSE",
        note: null,
        entryDate: response.createdAt.toISOString(),
        createdAt: response.createdAt.toISOString(),
        actor: response.actor,
        files: [],
        formResponse: {
          id: response.id,
          templateId: response.template.id,
          templateName: response.template.name,
          templateVersionId: response.templateVersion.id,
          templateVersionNumber: response.templateVersion.versionNumber,
          templateVersionTitle: response.templateVersion.title,
          dailyProgramProjectId: response.dailyProgramProjectId,
          projectEntryId: response.projectEntryId,
          payload: response.payload
        }
      }))
    ];

    return timeline.sort((left, right) => {
      if (left.entryDate !== right.entryDate) {
        return right.entryDate.localeCompare(left.entryDate);
      }

      return right.createdAt.localeCompare(left.createdAt);
    });
  }

  async getLocationFeed(projectId: string, user: CurrentUserPayload) {
    if (user.role !== "MANAGER") {
      throw new ForbiddenException("Konum feed yalnizca yoneticiye aciktir.");
    }

    return this.prisma.locationPing.findMany({
      where: { projectId },
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
      orderBy: { capturedAt: "desc" },
      take: 200
    });
  }

  async stageTimelineFiles(
    project: { storageRoot: string },
    entryDate: Date,
    files: Express.Multer.File[]
  ) {
    const stagedFiles: StagedProjectFile[] = [];

    try {
      for (const file of files) {
        try {
          ensureFileAllowed(file.originalname);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }
        const staged = await this.persistUploadedFile(
          this.storagePaths.projectTimelineUploadDirectory(project.storageRoot, entryDate),
          sanitizeFilename(file.originalname),
          file.path
        );

        stagedFiles.push({
          title: file.originalname,
          category: isImage(file.originalname) ? FileCategory.IMAGE : FileCategory.DOCUMENT,
          extension: fileExtension(file.originalname),
          mimeType: file.mimetype || "application/octet-stream",
          originalName: file.originalname,
          relativeDirectory: staged.relativeDirectory,
          relativePath: staged.relativePath,
          size: file.size
        });
      }
    } catch (error) {
      await this.cleanupStoredFiles(
        stagedFiles.map((file) => file.relativePath),
        stagedFiles.map((file) => file.relativeDirectory),
        `${project.storageRoot}/timeline`,
        `Timeline staging temizligi tamamlanamadi: ${project.storageRoot}`
      );
      throw error;
    }

    return stagedFiles;
  }

  async createTimelineFiles(
    tx: PrismaService,
    entryId: string,
    project: { id: string; storageRoot: string },
    actorId: string,
    files: StagedProjectFile[]
  ) {
    for (const file of files) {
      const logicalFile = await tx.projectFile.create({
        data: {
          projectId: project.id,
          entryId,
          scope: FileScope.TIMELINE,
          category: file.category,
          title: file.title,
          createdById: actorId
        }
      });

      await tx.projectFileVersion.create({
        data: {
          fileId: logicalFile.id,
          versionNumber: 1,
          originalName: file.originalName,
          storagePath: file.relativePath,
          mimeType: file.mimeType,
          extension: file.extension,
          size: file.size,
          uploadedById: actorId
        }
      });
    }
  }

  async cleanupStagedTimelineFiles(files: StagedProjectFile[], stopAt: string) {
    await this.cleanupStoredFiles(
      files.map((file) => file.relativePath),
      files.map((file) => file.relativeDirectory),
      stopAt,
      `Timeline rollback temizligi tamamlanamadi: ${stopAt}`
    );
  }

  async cleanupUploadedTempFiles(files: Express.Multer.File[] | undefined) {
    await cleanupUploadedTempFiles(files);
  }

  async assertProjectAccess(projectId: string, user: CurrentUserPayload) {
    const project = await this.prisma.project.findUnique({ where: { id: projectId } });

    if (!project) {
      throw new NotFoundException("Proje bulunamadi.");
    }

    if (user.role === "MANAGER") {
      return project;
    }

    const assignment = await this.prisma.projectAssignment.findFirst({
      where: {
        userId: user.sub,
        isActive: true,
        dailyProgramProject: { projectId }
      }
    });

    if (!assignment) {
      throw new ForbiddenException("Bu projeye erisim yetkiniz yok.");
    }

    return project;
  }

  private assertManager(actor: CurrentUserPayload) {
    if (actor.role !== Role.MANAGER) {
      throw new ForbiddenException("Bu islem icin yonetici yetkisi gerekli.");
    }
  }

  private async resolveCustomer(customerId?: string | null) {
    if (customerId === undefined) {
      return undefined;
    }

    if (customerId === null || customerId.trim() === "") {
      return null;
    }

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) {
      throw new NotFoundException("Cari bulunamadi.");
    }

    return customer;
  }

  private async stageMainFiles(
    storageRoot: string,
    dto: UploadMainFileDto,
    files: Express.Multer.File[]
  ) {
    const stagedFiles: StagedProjectFile[] = [];

    try {
      for (const file of files) {
        try {
          ensureFileAllowed(file.originalname);
        } catch (error) {
          throw new BadRequestException((error as Error).message);
        }

        const title = dto.title && files.length === 1 ? dto.title : fileTitleFromName(file.originalname);
        const staged = await this.persistUploadedFile(
          this.storagePaths.projectMainUploadDirectory(storageRoot, title, new Date()),
          sanitizeFilename(file.originalname),
          file.path
        );

        stagedFiles.push({
          title,
          category: isImage(file.originalname) ? FileCategory.IMAGE : FileCategory.DOCUMENT,
          extension: fileExtension(file.originalname),
          mimeType: file.mimetype || "application/octet-stream",
          originalName: file.originalname,
          relativeDirectory: staged.relativeDirectory,
          relativePath: staged.relativePath,
          size: file.size
        });
      }
    } catch (error) {
      await this.cleanupStoredFiles(
        stagedFiles.map((file) => file.relativePath),
        stagedFiles.map((file) => file.relativeDirectory),
        `${storageRoot}/main`,
        `Main dosya staging temizligi tamamlanamadi: ${storageRoot}`
      );
      throw error;
    }

    return stagedFiles;
  }

  private async generateProjectCode(customerName: string | null, createdAt: Date) {
    const prefix = this.buildProjectCodePrefix(customerName, createdAt);
    const matchingProjects = await this.prisma.project.findMany({
      where: {
        code: {
          startsWith: prefix
        }
      },
      select: {
        code: true
      }
    });

    const nextCounter =
      matchingProjects
        .filter((project) => project.code?.startsWith(prefix))
        .reduce((highest, project) => {
        const current = this.parseProjectCodeCounter(project.code);
        return current > highest ? current : highest;
      }, 0) + 1;

    return `${prefix}${String(nextCounter).padStart(4, "0")}`;
  }

  private buildProjectCodePrefix(customerName: string | null, createdAt: Date) {
    const customerSegment = this.normalizeProjectCodeSegment(customerName || "CariYok");
    const day = String(createdAt.getDate()).padStart(2, "0");
    const month = String(createdAt.getMonth() + 1).padStart(2, "0");
    const year = String(createdAt.getFullYear());

    return `${customerSegment}_${day}_${month}_${year}_00 `;
  }

  private normalizeProjectCodeSegment(value: string) {
    const normalized = value
      .trim()
      .normalize("NFKC")
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");

    return normalized || "CariYok";
  }

  private parseProjectCodeCounter(code: string | null) {
    if (!code) {
      return 0;
    }

    const match = code.match(/00\s(\d{4})$/);
    return match ? Number(match[1]) : 0;
  }

  private async cleanupStoredFiles(
    storagePaths: string[],
    directoryPaths: string[],
    stopAt: string,
    message: string
  ) {
    try {
      await this.storageDriver.removeFiles(storagePaths);
      await this.storageDriver.removeEmptyDirectories(directoryPaths, stopAt);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`${message} (${detail})`);
    }
  }

  private async cleanupStorageTree(relativePath: string, message: string) {
    try {
      await this.storageDriver.removeTree(relativePath);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.error(`${message} (${detail})`);
    }
  }

  private directoryNameFromStoragePath(storagePath: string) {
    return this.storagePaths.relativeDirectory(storagePath);
  }

  private async persistUploadedFile(relativeDirectory: string, filename: string, sourcePath: string) {
    if (typeof this.storageDriver.writeFile === "function") {
      return this.storageDriver.writeFile(relativeDirectory, filename, sourcePath);
    }

    return this.storageDriver.writeBuffer(relativeDirectory, filename, await readFile(sourcePath));
  }

  private projectListInclude() {
    return {
      customer: true,
      files: {
        where: { scope: FileScope.MAIN },
        select: { id: true }
      },
      programProjects: {
        select: { id: true }
      },
      _count: {
        select: { entries: true, fieldFormResponses: true }
      }
    } satisfies Prisma.ProjectInclude;
  }

  private projectDetailInclude() {
    return {
      ...this.projectListInclude(),
      customer: true
    } satisfies Prisma.ProjectInclude;
  }

  private buildProjectWhere(user: CurrentUserPayload, filters: ProjectFiltersDto): Prisma.ProjectWhereInput {
    const conditions: Prisma.ProjectWhereInput[] = [];

    if (filters.status === "archived") {
      conditions.push({ isArchived: true });
    } else if (filters.status !== "all") {
      conditions.push({ isArchived: false });
    }

    if (filters.query?.trim()) {
      const query = filters.query.trim();
      conditions.push({
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { code: { contains: query, mode: "insensitive" } },
          { description: { contains: query, mode: "insensitive" } },
          { locationLabel: { contains: query, mode: "insensitive" } },
          { customer: { is: { name: { contains: query, mode: "insensitive" } } } }
        ]
      });
    }

    if (user.role === Role.FIELD) {
      conditions.push({
        programProjects: {
          some: {
            assignments: {
              some: {
                userId: user.sub,
                isActive: true
              }
            }
          }
        }
      });
    }

    return conditions.length ? { AND: conditions } : {};
  }

  private mapProjectSummary(project: {
    id: string;
    code: string | null;
    name: string;
    description: string | null;
    locationLabel: string | null;
    latitude: number | null;
    longitude: number | null;
    isArchived: boolean;
    storageRoot: string;
    createdAt: Date;
    updatedAt: Date;
    customer: {
      id: string;
      name: string;
      note: string | null;
      isArchived: boolean;
    } | null;
    files: Array<{ id: string }>;
    programProjects: Array<{ id: string }>;
    _count: { entries: number; fieldFormResponses: number };
  }) {
    return {
      id: project.id,
      code: project.code,
      name: project.name,
      description: project.description,
      locationLabel: project.locationLabel,
      latitude: project.latitude,
      longitude: project.longitude,
      isArchived: project.isArchived,
      storageRoot: project.storageRoot,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      customer: project.customer ? this.mapCustomer(project.customer) : null,
      mainFileCount: project.files.length,
      programUsageCount: project.programProjects.length,
      timelineEntryCount: project._count.entries,
      fieldFormResponseCount: project._count.fieldFormResponses
    };
  }

  private mapCustomer(customer: {
    id: string;
    name: string;
    note: string | null;
    isArchived: boolean;
    createdAt?: Date;
    _count?: { projects: number };
  }) {
    return {
      id: customer.id,
      name: customer.name,
      note: customer.note ?? null,
      isArchived: customer.isArchived,
      projectCount: customer._count?.projects ?? 0,
      createdAt: customer.createdAt?.toISOString()
    };
  }

  private mapFileVersion(version: {
    id: string;
    versionNumber: number;
    originalName: string;
    mimeType: string;
    extension: string;
    size: number;
    createdAt: Date;
  }) {
    return {
      id: version.id,
      versionNumber: version.versionNumber,
      originalName: version.originalName,
      mimeType: version.mimeType,
      extension: version.extension,
      size: version.size,
      createdAt: version.createdAt.toISOString(),
      downloadUrl: `/api/project-files/${version.id}/download`,
      inlineUrl: isInlinePreviewable(version.originalName)
        ? `/api/project-files/${version.id}/download?inline=1`
        : undefined
    };
  }

  private handleProjectWriteError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new ConflictException("Proje kodu veya ilgili benzersiz alan zaten kullaniliyor.");
    }

    throw error;
  }
}
