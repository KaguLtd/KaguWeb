import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { LocalStorageDriver } from "./local-storage.driver";
import { ObjectStorageDriver } from "./object-storage.driver";
import { StorageController } from "./storage.controller";
import { StorageDriver } from "./storage-driver";
import { StoragePathService } from "./storage-path.service";
import {
  resolveStorageRuntimeConfig,
  STORAGE_RUNTIME_CONFIG,
  StorageRuntimeConfig
} from "./storage-runtime-config";
import { StorageService } from "./storage.service";

@Global()
@Module({
  imports: [ConfigModule, PrismaModule],
  controllers: [StorageController],
  providers: [
    StoragePathService,
    LocalStorageDriver,
    ObjectStorageDriver,
    {
      provide: STORAGE_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): StorageRuntimeConfig =>
        resolveStorageRuntimeConfig(configService)
    },
    {
      provide: StorageDriver,
      inject: [STORAGE_RUNTIME_CONFIG, LocalStorageDriver, ObjectStorageDriver],
      useFactory: (
        runtimeConfig: StorageRuntimeConfig,
        localStorageDriver: LocalStorageDriver,
        objectStorageDriver: ObjectStorageDriver
      ) => (runtimeConfig.driver === "s3-compatible" ? objectStorageDriver : localStorageDriver)
    },
    StorageService
  ],
  exports: [StorageDriver, STORAGE_RUNTIME_CONFIG, StoragePathService, StorageService]
})
export class StorageModule {}
