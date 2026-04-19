import { Global, Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ConfigService } from "@nestjs/config";
import { PrismaModule } from "../prisma/prisma.module";
import { LocalStorageDriver } from "./local-storage.driver";
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
  providers: [
    StoragePathService,
    LocalStorageDriver,
    {
      provide: STORAGE_RUNTIME_CONFIG,
      inject: [ConfigService],
      useFactory: (configService: ConfigService): StorageRuntimeConfig =>
        resolveStorageRuntimeConfig(configService)
    },
    {
      provide: StorageDriver,
      inject: [LocalStorageDriver],
      useFactory: (localStorageDriver: LocalStorageDriver) => localStorageDriver
    },
    StorageService
  ],
  exports: [StorageDriver, STORAGE_RUNTIME_CONFIG, StoragePathService, StorageService]
})
export class StorageModule {}
