import { ConfigService } from "@nestjs/config";
import {
  resolveStorageRuntimeConfig
} from "../src/storage/storage-runtime-config";

describe("resolveStorageRuntimeConfig", () => {
  it("defaults to local storage mode", () => {
    const config = resolveStorageRuntimeConfig(
      new ConfigService({
        STORAGE_ROOT: "./storage"
      })
    );

    expect(config).toEqual({
      driver: "local",
      root: "./storage",
      publicBaseUrl: null,
      objectStorage: null
    });
  });

  it("returns object storage settings for s3-compatible mode", () => {
    const config = resolveStorageRuntimeConfig(
      new ConfigService({
        STORAGE_DRIVER: "s3-compatible",
        STORAGE_ROOT: "./storage",
        STORAGE_PUBLIC_BASE_URL: "https://cdn.kagu.local",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
        OBJECT_STORAGE_ACCESS_MODE: "signed",
        OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: "900"
      })
    );

    expect(config).toEqual({
      driver: "s3-compatible",
      root: "./storage",
      publicBaseUrl: "https://cdn.kagu.local",
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
  });
});
