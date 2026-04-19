import { ConfigService } from "@nestjs/config";

export const storageDriverModes = ["local"] as const;

export type StorageDriverMode = (typeof storageDriverModes)[number];

export type StorageRuntimeConfig = {
  driver: StorageDriverMode;
  root: string;
  publicBaseUrl: string | null;
  objectStorage: null;
};

export const STORAGE_RUNTIME_CONFIG = Symbol("STORAGE_RUNTIME_CONFIG");

export function resolveStorageRuntimeConfig(configService: ConfigService): StorageRuntimeConfig {
  return {
    driver: "local",
    root: configService.getOrThrow<string>("STORAGE_ROOT"),
    publicBaseUrl: configService.get<string>("STORAGE_PUBLIC_BASE_URL") ?? null,
    objectStorage: null
  };
}
