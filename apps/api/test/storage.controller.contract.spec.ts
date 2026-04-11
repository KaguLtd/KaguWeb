import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { ObjectStorageDriver } from "../src/storage/object-storage.driver";
import { StorageController } from "../src/storage/storage.controller";

describe("StorageController contract", () => {
  const objectStorageDriver = {
    resolveSignedProxyAccess: jest.fn()
  };

  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StorageController],
      providers: [
        {
          provide: ObjectStorageDriver,
          useValue: objectStorageDriver
        }
      ]
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
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

  it("GET /api/storage/object-proxy validates query and returns the stream", async () => {
    objectStorageDriver.resolveSignedProxyAccess.mockReturnValue({
      stream: "proxy-stream",
      disposition: "attachment",
      filename: "file.pdf",
      contentType: "application/pdf"
    });

    const response = await request(app.getHttpServer())
      .get("/api/storage/object-proxy")
      .query({
        path: "projects/demo/file.pdf",
        disposition: "attachment",
        filename: "file.pdf",
        contentType: "application/pdf",
        kaguSignatureAlgorithm: "HMAC-SHA256",
        kaguAccessKeyId: "access-key",
        kaguExpiresAt: "1775823300",
        kaguSignedHeaders: "disposition,filename,contentType",
        kaguSignature: "sig"
      })
      .expect(200);

    expect(objectStorageDriver.resolveSignedProxyAccess).toHaveBeenCalledWith({
      path: "projects/demo/file.pdf",
      disposition: "attachment",
      filename: "file.pdf",
      contentType: "application/pdf",
      signatureAlgorithm: "HMAC-SHA256",
      accessKeyId: "access-key",
      expiresAt: "1775823300",
      signedHeaders: "disposition,filename,contentType",
      signature: "sig"
    });
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain('attachment; filename="file.pdf"');
  });
});
