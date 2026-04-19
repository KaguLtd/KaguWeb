import { BadRequestException, Controller, Get, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { ObjectStorageDriver } from "./object-storage.driver";

@Controller("storage")
export class StorageController {
  constructor(private readonly objectStorageDriver: ObjectStorageDriver) {}

  @Get("object-proxy")
  proxyObjectAccess(
    @Query("path") path: string | undefined,
    @Query("disposition") disposition: string | undefined,
    @Query("filename") filename: string | undefined,
    @Query("contentType") contentType: string | undefined,
    @Query("kaguSignatureAlgorithm") signatureAlgorithm: string | undefined,
    @Query("kaguAccessKeyId") accessKeyId: string | undefined,
    @Query("kaguExpiresAt") expiresAt: string | undefined,
    @Query("kaguSignedHeaders") signedHeaders: string | undefined,
    @Query("kaguSignature") signature: string | undefined,
    @Res({ passthrough: true }) response: Response
  ) {
    const payload = this.objectStorageDriver.resolveSignedProxyAccess({
      path,
      disposition,
      filename,
      contentType,
      signatureAlgorithm,
      accessKeyId,
      expiresAt,
      signedHeaders,
      signature
    });

    if (payload.contentType) {
      response.setHeader("Content-Type", payload.contentType);
    }

    if (payload.disposition && payload.filename) {
      response.setHeader(
        "Content-Disposition",
        `${payload.disposition}; filename="${encodeURIComponent(payload.filename)}"`
      );
    } else if (payload.disposition) {
      response.setHeader("Content-Disposition", payload.disposition);
    }

    return payload.stream;
  }
}
