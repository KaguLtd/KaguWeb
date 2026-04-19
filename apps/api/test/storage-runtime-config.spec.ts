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
});
