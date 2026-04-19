import { createHmac } from "node:crypto";
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit
} from "@nestjs/common";
import { StructuredLoggerService } from "../common/observability/structured-logger.service";
import { LocalStorageDriver } from "./local-storage.driver";
import {
  STORAGE_RUNTIME_CONFIG,
  StorageRuntimeConfig
} from "./storage-runtime-config";
import {
  StorageAccessResult,
  StorageDriver,
  StorageFileWriteResult,
  StorageWriteResult
} from "./storage-driver";
import { normalizeStorageRelativePath } from "./storage-path.utils";

@Injectable()
export class ObjectStorageDriver extends StorageDriver implements OnModuleInit {
  private readonly logger = new Logger(ObjectStorageDriver.name);

  constructor(
    private readonly localStorageDriver: LocalStorageDriver,
    private readonly structuredLogger: StructuredLoggerService,
    @Inject(STORAGE_RUNTIME_CONFIG)
    private readonly runtimeConfig: StorageRuntimeConfig
  ) {
    super();
  }

  onModuleInit() {
    this.logger.warn(
      `STORAGE_DRIVER=${this.runtimeConfig.driver} enabled in compatibility mode; writes remain on local storage root ${this.runtimeConfig.root} until remote transport is added.`
    );
    if (this.runtimeConfig.objectStorage?.accessMode === "signed") {
      this.logger.warn(
        "OBJECT_STORAGE_ACCESS_MODE=signed enabled in compatibility mode; redirect URLs now include HMAC-based signature metadata for downstream validation, while file writes remain on local storage."
      );
    }
  }

  ensureDirectory(relativePath: string): Promise<StorageWriteResult> {
    return this.localStorageDriver.ensureDirectory(relativePath);
  }

  pathExists(relativePath: string): Promise<boolean> {
    return this.localStorageDriver.pathExists(relativePath);
  }

  writeBuffer(
    relativeDirectory: string,
    filename: string,
    buffer: Buffer
  ): Promise<StorageFileWriteResult> {
    return this.localStorageDriver.writeBuffer(relativeDirectory, filename, buffer);
  }

  writeText(relativePath: string, contents: string): Promise<StorageWriteResult> {
    return this.localStorageDriver.writeText(relativePath, contents);
  }

  appendJsonLine(relativePath: string, payload: unknown): Promise<void> {
    return this.localStorageDriver.appendJsonLine(relativePath, payload);
  }

  moveTree(fromRelativePath: string, toRelativePath: string): Promise<void> {
    return this.localStorageDriver.moveTree(fromRelativePath, toRelativePath);
  }

  removeTree(relativePath: string): Promise<void> {
    return this.localStorageDriver.removeTree(relativePath);
  }

  removeFiles(paths: string[]): Promise<void> {
    return this.localStorageDriver.removeFiles(paths);
  }

  removeEmptyDirectories(paths: string[], stopAt: string): Promise<void> {
    return this.localStorageDriver.removeEmptyDirectories(paths, stopAt);
  }

  createReadStream(relativePath: string): NodeJS.ReadableStream {
    return this.localStorageDriver.createReadStream(relativePath);
  }

  readText(relativePath: string, options?: { maxBytes?: number }) {
    return this.localStorageDriver.readText(relativePath, options);
  }

  async resolveAccess(
    relativePath: string,
    options?: {
      disposition?: "inline" | "attachment";
      filename?: string;
      contentType?: string;
    }
  ): Promise<StorageAccessResult> {
    const publicBaseUrl = this.runtimeConfig.publicBaseUrl;
    const objectStorage = this.runtimeConfig.objectStorage;
    if (!objectStorage) {
      return {
        kind: "stream",
        stream: this.localStorageDriver.createReadStream(relativePath)
      };
    }

    const normalizedPath = normalizeStorageRelativePath(relativePath);
    const url =
      objectStorage.accessMode === "public"
        ? new URL(
            normalizedPath,
            `${(publicBaseUrl ?? objectStorage.endpoint).endsWith("/") ? (publicBaseUrl ?? objectStorage.endpoint) : `${publicBaseUrl ?? objectStorage.endpoint}/`}`
          )
        : new URL("/api/storage/object-proxy", "http://kagu.local");

    if (options?.disposition) {
      url.searchParams.set("disposition", options.disposition);
    }
    if (options?.filename) {
      url.searchParams.set("filename", options.filename);
    }
    if (options?.contentType) {
      url.searchParams.set("contentType", options.contentType);
    }
    if (objectStorage.accessMode === "signed" && objectStorage.signedUrlTtlSeconds) {
      const expiresAt = Math.floor(Date.now() / 1000) + objectStorage.signedUrlTtlSeconds;
      const signature = this.signAccessPayload({
        path: normalizedPath,
        expiresAt,
        disposition: options?.disposition ?? null,
        filename: options?.filename ?? null,
        contentType: options?.contentType ?? null
      });

      url.searchParams.set("path", normalizedPath);
      url.searchParams.set("kaguSignatureAlgorithm", "HMAC-SHA256");
      url.searchParams.set("kaguAccessKeyId", objectStorage.accessKeyId);
      url.searchParams.set("kaguExpiresAt", String(expiresAt));
      url.searchParams.set("kaguSignedHeaders", "disposition,filename,contentType");
      url.searchParams.set("kaguSignature", signature);

      this.structuredLogger.info("storage.object_proxy.redirect_created", {
        bucket: objectStorage.bucket,
        path: normalizedPath,
        expiresAt,
        disposition: options?.disposition ?? null,
        filename: options?.filename ?? null,
        contentType: options?.contentType ?? null
      });
    }

    return {
      kind: "redirect",
      url: objectStorage.accessMode === "signed" ? `${url.pathname}${url.search}` : url.toString()
    };
  }

  resolveSignedProxyAccess(params: {
    path?: string;
    disposition?: string;
    filename?: string;
    contentType?: string;
    signatureAlgorithm?: string;
    accessKeyId?: string;
    expiresAt?: string;
    signedHeaders?: string;
    signature?: string;
  }) {
    const objectStorage = this.runtimeConfig.objectStorage;
    if (!objectStorage || objectStorage.accessMode !== "signed") {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "signed_mode_disabled"
      });
      throw new BadRequestException("Signed object proxy yalnizca signed object storage modunda kullanilabilir.");
    }

    const normalizedPath = normalizeStorageRelativePath(params.path ?? "");
    if (!normalizedPath) {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "missing_path"
      });
      throw new BadRequestException("Signed object proxy icin gecerli bir path gereklidir.");
    }

    if (params.signatureAlgorithm !== "HMAC-SHA256") {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "invalid_algorithm",
        path: normalizedPath
      });
      throw new ForbiddenException("Signed object proxy icin gecersiz signature algoritmasi.");
    }

    if (params.accessKeyId !== objectStorage.accessKeyId) {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "invalid_access_key",
        path: normalizedPath
      });
      throw new ForbiddenException("Signed object proxy icin gecersiz access key.");
    }

    if (params.signedHeaders !== "disposition,filename,contentType") {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "invalid_signed_headers",
        path: normalizedPath
      });
      throw new ForbiddenException("Signed object proxy icin signed header listesi gecersiz.");
    }

    const expiresAt = Number(params.expiresAt);
    if (!Number.isInteger(expiresAt)) {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "invalid_expires_at",
        path: normalizedPath
      });
      throw new BadRequestException("Signed object proxy icin gecerli bir expiresAt gereklidir.");
    }
    if (expiresAt < Math.floor(Date.now() / 1000)) {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "url_expired",
        path: normalizedPath,
        expiresAt
      });
      throw new ForbiddenException("Signed object proxy URL suresi dolmus.");
    }

    const expectedSignature = this.signAccessPayload({
      path: normalizedPath,
      expiresAt,
      disposition: params.disposition ?? null,
      filename: params.filename ?? null,
      contentType: params.contentType ?? null
    });

    if (!params.signature || params.signature !== expectedSignature) {
      this.structuredLogger.warn("storage.object_proxy.rejected", {
        reason: "signature_mismatch",
        path: normalizedPath,
        expiresAt
      });
      throw new ForbiddenException("Signed object proxy imzasi dogrulanamadi.");
    }

    this.structuredLogger.info("storage.object_proxy.resolved", {
      bucket: objectStorage.bucket,
      path: normalizedPath,
      expiresAt,
      disposition: params.disposition ?? null,
      filename: params.filename ?? null,
      contentType: params.contentType ?? null
    });

    return {
      stream: this.localStorageDriver.createReadStream(normalizedPath),
      disposition:
        params.disposition === "inline" || params.disposition === "attachment"
          ? params.disposition
          : null,
      filename: params.filename ?? null,
      contentType: params.contentType ?? null
    };
  }

  private signAccessPayload(params: {
    path: string;
    expiresAt: number;
    disposition: string | null;
    filename: string | null;
    contentType: string | null;
  }) {
    const objectStorage = this.runtimeConfig.objectStorage;
    if (!objectStorage) {
      throw new BadRequestException("Object storage runtime config bulunamadi.");
    }

    const canonicalPayload = [
      objectStorage.accessKeyId,
      objectStorage.bucket,
      params.path,
      String(params.expiresAt),
      params.disposition ?? "",
      params.filename ?? "",
      params.contentType ?? ""
    ].join("\n");

    return createHmac("sha256", objectStorage.secretAccessKey)
      .update(canonicalPayload)
      .digest("hex");
  }
}
