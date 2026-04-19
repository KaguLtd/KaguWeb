import { ConfigService } from "@nestjs/config";

export const storageDriverModes = ["local", "s3-compatible"] as const;
export const objectStorageAccessModes = ["public", "signed"] as const;

export type StorageDriverMode = (typeof storageDriverModes)[number];
export type ObjectStorageAccessMode = (typeof objectStorageAccessModes)[number];

export type StorageRuntimeConfig = {
  driver: StorageDriverMode;
  root: string;
  publicBaseUrl: string | null;
  objectStorage:
    | {
        endpoint: string;
        region: string;
        bucket: string;
        accessKeyId: string;
        secretAccessKey: string;
        accessMode: ObjectStorageAccessMode;
        signedUrlTtlSeconds: number | null;
      }
    | null;
};

export const STORAGE_RUNTIME_CONFIG = Symbol("STORAGE_RUNTIME_CONFIG");

export function resolveStorageRuntimeConfig(configService: ConfigService): StorageRuntimeConfig {
  const driver = configService.get<StorageDriverMode>("STORAGE_DRIVER") ?? "local";

  if (driver === "s3-compatible") {
    return {
      driver,
      root: configService.getOrThrow<string>("STORAGE_ROOT"),
      publicBaseUrl: configService.get<string>("STORAGE_PUBLIC_BASE_URL") ?? null,
      objectStorage: {
        endpoint: configService.getOrThrow<string>("OBJECT_STORAGE_ENDPOINT"),
        region: configService.getOrThrow<string>("OBJECT_STORAGE_REGION"),
        bucket: configService.getOrThrow<string>("OBJECT_STORAGE_BUCKET"),
        accessKeyId: configService.getOrThrow<string>("OBJECT_STORAGE_ACCESS_KEY_ID"),
        secretAccessKey: configService.getOrThrow<string>("OBJECT_STORAGE_SECRET_ACCESS_KEY"),
        accessMode:
          (configService.get<ObjectStorageAccessMode>("OBJECT_STORAGE_ACCESS_MODE") ?? "public"),
        signedUrlTtlSeconds: configService.get<string>("OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS")
          ? Number(configService.getOrThrow<string>("OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS"))
          : null
      }
    };
  }

  return {
    driver: "local",
    root: configService.getOrThrow<string>("STORAGE_ROOT"),
    publicBaseUrl: configService.get<string>("STORAGE_PUBLIC_BASE_URL") ?? null,
    objectStorage: null
  };
}
