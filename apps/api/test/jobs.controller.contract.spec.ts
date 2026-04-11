import { ValidationPipe } from "@nestjs/common";
import type { CanActivate, ExecutionContext, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ROLES_KEY } from "../src/common/decorators/roles.decorator";
import { JwtAuthGuard } from "../src/common/guards/jwt-auth.guard";
import { RolesGuard } from "../src/common/guards/roles.guard";
import { JobsController } from "../src/common/jobs/jobs.controller";
import { JobsService } from "../src/common/jobs/jobs.service";

describe("JobsController contract", () => {
  const jobsService = {
    listExecutions: jest.fn(),
    createBackupExport: jest.fn(),
    prepareBackupRestore: jest.fn(),
    resolveArtifactDownload: jest.fn(),
    previewArtifact: jest.fn()
  };

  const jwtAuthGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const request = context.switchToHttp().getRequest();
      const roleHeader = readHeader(request.headers["x-test-role"]);
      const userId = readHeader(request.headers["x-test-user-id"]) ?? "manager-1";
      const role = roleHeader === "FIELD" ? "FIELD" : "MANAGER";

      request.user = {
        sub: userId,
        username: role === "FIELD" ? "saha" : "yonetici",
        displayName: role === "FIELD" ? "Saha Personeli" : "Ana Yonetici",
        role
      };

      return true;
    }
  };

  const rolesGuard: CanActivate = {
    canActivate(context: ExecutionContext) {
      const handlerRoles = Reflect.getMetadata(ROLES_KEY, context.getHandler()) as
        | string[]
        | undefined;
      const classRoles = Reflect.getMetadata(ROLES_KEY, context.getClass()) as string[] | undefined;
      const roles = handlerRoles ?? classRoles;

      if (!roles?.length) {
        return true;
      }

      const request = context.switchToHttp().getRequest();
      return roles.includes(request.user.role);
    }
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        {
          provide: JobsService,
          useValue: jobsService
        }
      ]
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(jwtAuthGuard)
      .overrideGuard(RolesGuard)
      .useValue(rolesGuard)
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true
      })
    );
    await app.init();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  it("GET /api/jobs/executions forwards filters to the service", async () => {
    jobsService.listExecutions.mockResolvedValue([
      {
        id: "job-1",
        jobName: "program-templates.materialize",
        status: "SUCCEEDED"
      }
    ]);

    const response = await request(app.getHttpServer())
      .get("/api/jobs/executions?jobName=materialize&status=SUCCEEDED&limit=5")
      .expect(200);

    expect(response.body).toEqual([
      {
        id: "job-1",
        jobName: "program-templates.materialize",
        status: "SUCCEEDED"
      }
    ]);
    expect(jobsService.listExecutions).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        jobName: "materialize",
        status: "SUCCEEDED",
        limit: 5
      }
    );
  });

  it("blocks field users from job execution history", async () => {
    await request(app.getHttpServer())
      .get("/api/jobs/executions")
      .set("x-test-role", "FIELD")
      .set("x-test-user-id", "field-1")
      .expect(403);

    expect(jobsService.listExecutions).not.toHaveBeenCalled();
  });

  it("POST /api/jobs/backup-export forwards the export request", async () => {
    jobsService.createBackupExport.mockResolvedValue({
      relativePath: "backups/exports/2026-04-10/export.json",
      exportedAt: "2026-04-10T10:00:00.000Z"
    });

    const response = await request(app.getHttpServer())
      .post("/api/jobs/backup-export")
      .send({ label: "Nisan Export" })
      .expect(201);

    expect(response.body).toEqual({
      relativePath: "backups/exports/2026-04-10/export.json",
      exportedAt: "2026-04-10T10:00:00.000Z"
    });
    expect(jobsService.createBackupExport).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        label: "Nisan Export"
      }
    );
  });

  it("POST /api/jobs/backup-restore-prepare forwards the manifest path", async () => {
    jobsService.prepareBackupRestore.mockResolvedValue({
      manifestPath: "backups/exports/2026-04-10/export.json",
      exportType: "operational-snapshot",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      integrityVerified: true,
      inventoryVerified: true,
      missingArtifacts: [],
      artifactCount: 3,
      counts: {
        projects: 12
      },
      integrity: {
        expectedSha256: "abc123",
        calculatedSha256: "abc123",
        expectedBytes: 512,
        calculatedBytes: 512
      },
      artifacts: [
        {
          type: "manifest",
          relativePath: "backups/exports/2026-04-10/export.json",
          exists: true
        }
      ]
    });

    const response = await request(app.getHttpServer())
      .post("/api/jobs/backup-restore-prepare")
      .send({ manifestPath: "backups/exports/2026-04-10/export.json" })
      .expect(201);

    expect(response.body).toEqual({
      manifestPath: "backups/exports/2026-04-10/export.json",
      exportType: "operational-snapshot",
      exportedAt: "2026-04-10T10:00:00.000Z",
      label: "Nisan",
      integrityVerified: true,
      inventoryVerified: true,
      missingArtifacts: [],
      artifactCount: 3,
      counts: {
        projects: 12
      },
      integrity: {
        expectedSha256: "abc123",
        calculatedSha256: "abc123",
        expectedBytes: 512,
        calculatedBytes: 512
      },
      artifacts: [
        {
          type: "manifest",
          relativePath: "backups/exports/2026-04-10/export.json",
          exists: true
        }
      ]
    });
    expect(jobsService.prepareBackupRestore).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      {
        manifestPath: "backups/exports/2026-04-10/export.json"
      }
    );
  });

  it("GET /api/jobs/artifacts/download forwards the artifact path", async () => {
    jobsService.resolveArtifactDownload.mockResolvedValue({
      access: {
        kind: "redirect",
        url: "/api/storage/object-proxy?path=backups%2Fexports%2F2026-04-10%2Fexport.summary.json"
      },
      filename: "export.summary.json",
      contentType: "application/json"
    });

    const response = await request(app.getHttpServer())
      .get("/api/jobs/artifacts/download?path=backups/exports/2026-04-10/export.summary.json")
      .expect(302);

    expect(response.headers.location).toBe(
      "/api/storage/object-proxy?path=backups%2Fexports%2F2026-04-10%2Fexport.summary.json"
    );
    expect(jobsService.resolveArtifactDownload).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      "backups/exports/2026-04-10/export.summary.json"
    );
  });

  it("GET /api/jobs/artifacts/preview forwards the artifact path", async () => {
    jobsService.previewArtifact.mockResolvedValue({
      path: "backups/exports/2026-04-10/export.summary.json",
      filename: "export.summary.json",
      contentType: "application/json",
      preview: "{\n  \"ok\": true\n}",
      truncated: false,
      previewMode: "json"
    });

    const response = await request(app.getHttpServer())
      .get("/api/jobs/artifacts/preview?path=backups/exports/2026-04-10/export.summary.json")
      .expect(200);

    expect(response.body).toEqual({
      path: "backups/exports/2026-04-10/export.summary.json",
      filename: "export.summary.json",
      contentType: "application/json",
      preview: "{\n  \"ok\": true\n}",
      truncated: false,
      previewMode: "json"
    });
    expect(jobsService.previewArtifact).toHaveBeenCalledWith(
      {
        sub: "manager-1",
        username: "yonetici",
        displayName: "Ana Yonetici",
        role: "MANAGER"
      },
      "backups/exports/2026-04-10/export.summary.json"
    );
  });
});

function readHeader(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
