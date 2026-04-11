import { ObjectStorageDriver } from "../src/storage/object-storage.driver";

describe("ObjectStorageDriver", () => {
  const localStorageDriver = {
    ensureDirectory: jest.fn(),
    pathExists: jest.fn(),
    writeBuffer: jest.fn(),
    writeText: jest.fn(),
    appendJsonLine: jest.fn(),
    moveTree: jest.fn(),
    removeTree: jest.fn(),
    removeFiles: jest.fn(),
    removeEmptyDirectories: jest.fn(),
    createReadStream: jest.fn().mockReturnValue("stream"),
    readText: jest.fn(),
    resolveAccess: jest.fn()
  };
  const structuredLogger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it("returns public redirect urls in public mode", async () => {
    const driver = new ObjectStorageDriver(localStorageDriver as never, structuredLogger as never, {
      driver: "s3-compatible",
      root: "./storage",
      publicBaseUrl: "https://cdn.kagu.local/assets",
      objectStorage: {
        endpoint: "https://s3.kagu.local",
        region: "eu-central-1",
        bucket: "kagu-assets",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        accessMode: "public",
        signedUrlTtlSeconds: null
      }
    });

    await expect(
      driver.resolveAccess("projects/demo/file.pdf", {
        disposition: "attachment",
        filename: "file.pdf",
        contentType: "application/pdf"
      })
    ).resolves.toEqual({
      kind: "redirect",
      url: "https://cdn.kagu.local/assets/projects/demo/file.pdf?disposition=attachment&filename=file.pdf&contentType=application%2Fpdf"
    });
  });

  it("returns cryptographically signed redirect urls in signed mode", async () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-04-10T12:00:00.000Z").getTime());

    const driver = new ObjectStorageDriver(localStorageDriver as never, structuredLogger as never, {
      driver: "s3-compatible",
      root: "./storage",
      publicBaseUrl: null,
      objectStorage: {
        endpoint: "https://s3.kagu.local",
        region: "eu-central-1",
        bucket: "kagu-assets",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        accessMode: "signed",
        signedUrlTtlSeconds: 900
      }
    });

    const result = await driver.resolveAccess("projects/demo/file.pdf", {
      disposition: "attachment",
      filename: "file.pdf",
      contentType: "application/pdf"
    });

    expect(result.kind).toBe("redirect");
    if (result.kind !== "redirect") {
      throw new Error("expected redirect access");
    }

    const url = new URL(result.url, "http://kagu.local");
    expect(url.pathname).toBe("/api/storage/object-proxy");
    expect(url.searchParams.get("path")).toBe("projects/demo/file.pdf");
    expect(url.searchParams.get("disposition")).toBe("attachment");
    expect(url.searchParams.get("filename")).toBe("file.pdf");
    expect(url.searchParams.get("contentType")).toBe("application/pdf");
    expect(url.searchParams.get("kaguSignatureAlgorithm")).toBe("HMAC-SHA256");
    expect(url.searchParams.get("kaguAccessKeyId")).toBe("access-key");
    expect(url.searchParams.get("kaguExpiresAt")).toBe("1775823300");
    expect(url.searchParams.get("kaguSignedHeaders")).toBe("disposition,filename,contentType");
    expect(url.searchParams.get("kaguSignature")).toBe(
      "970a663a4e7226ce1a6ae7c426c8f62b7e8052d72632894b6738a25d4a79bb73"
    );
    expect(structuredLogger.info).toHaveBeenCalledWith(
      "storage.object_proxy.redirect_created",
      expect.objectContaining({
        bucket: "kagu-assets",
        path: "projects/demo/file.pdf",
        expiresAt: 1775823300
      })
    );
  });

  it("verifies signed proxy requests and returns the local stream", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-04-10T12:00:00.000Z").getTime());

    const driver = new ObjectStorageDriver(localStorageDriver as never, structuredLogger as never, {
      driver: "s3-compatible",
      root: "./storage",
      publicBaseUrl: null,
      objectStorage: {
        endpoint: "https://s3.kagu.local",
        region: "eu-central-1",
        bucket: "kagu-assets",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        accessMode: "signed",
        signedUrlTtlSeconds: 900
      }
    });

    const result = driver.resolveSignedProxyAccess({
      path: "projects/demo/file.pdf",
      disposition: "attachment",
      filename: "file.pdf",
      contentType: "application/pdf",
      signatureAlgorithm: "HMAC-SHA256",
      accessKeyId: "access-key",
      expiresAt: "1775823300",
      signedHeaders: "disposition,filename,contentType",
      signature: "970a663a4e7226ce1a6ae7c426c8f62b7e8052d72632894b6738a25d4a79bb73"
    });

    expect(result).toEqual({
      stream: "stream",
      disposition: "attachment",
      filename: "file.pdf",
      contentType: "application/pdf"
    });
    expect(localStorageDriver.createReadStream).toHaveBeenCalledWith("projects/demo/file.pdf");
    expect(structuredLogger.info).toHaveBeenCalledWith(
      "storage.object_proxy.resolved",
      expect.objectContaining({
        bucket: "kagu-assets",
        path: "projects/demo/file.pdf",
        expiresAt: 1775823300
      })
    );
  });

  it("logs signed proxy rejection reasons", () => {
    jest.spyOn(Date, "now").mockReturnValue(new Date("2026-04-10T12:00:00.000Z").getTime());

    const driver = new ObjectStorageDriver(localStorageDriver as never, structuredLogger as never, {
      driver: "s3-compatible",
      root: "./storage",
      publicBaseUrl: null,
      objectStorage: {
        endpoint: "https://s3.kagu.local",
        region: "eu-central-1",
        bucket: "kagu-assets",
        accessKeyId: "access-key",
        secretAccessKey: "secret-key",
        accessMode: "signed",
        signedUrlTtlSeconds: 900
      }
    });

    expect(() =>
      driver.resolveSignedProxyAccess({
        path: "projects/demo/file.pdf",
        disposition: "attachment",
        filename: "file.pdf",
        contentType: "application/pdf",
        signatureAlgorithm: "HMAC-SHA256",
        accessKeyId: "access-key",
        expiresAt: "1775823300",
        signedHeaders: "disposition,filename,contentType",
        signature: "wrong-signature"
      })
    ).toThrow("Signed object proxy imzasi dogrulanamadi.");

    expect(structuredLogger.warn).toHaveBeenCalledWith(
      "storage.object_proxy.rejected",
      expect.objectContaining({
        reason: "signature_mismatch",
        path: "projects/demo/file.pdf",
        expiresAt: 1775823300
      })
    );
  });
});
