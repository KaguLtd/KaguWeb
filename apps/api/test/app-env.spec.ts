import { validateAppEnv } from "../src/common/config/app-env";

describe("validateAppEnv", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/kagu?schema=public",
    JWT_SECRET: "test-secret",
    PORT: "4000",
    WEB_ORIGIN: "http://localhost:3000",
    STORAGE_ROOT: "./storage",
    UPLOAD_TEMP_ROOT: "./runtime/tmp/uploads",
    STORAGE_DRIVER: "local"
  };

  it("accepts the required API environment variables", () => {
    expect(validateAppEnv(baseEnv)).toMatchObject({
      DATABASE_URL: baseEnv.DATABASE_URL,
      JWT_SECRET: baseEnv.JWT_SECRET,
      PORT: "4000",
      WEB_ORIGIN: baseEnv.WEB_ORIGIN,
      STORAGE_ROOT: baseEnv.STORAGE_ROOT
    });
  });

  it("accepts upload temp root for disk-backed staging", () => {
    expect(validateAppEnv(baseEnv)).toMatchObject({
      STORAGE_DRIVER: "local",
      UPLOAD_TEMP_ROOT: "./runtime/tmp/uploads"
    });
  });

  it("rejects missing required values", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        JWT_SECRET: " "
      })
    ).toThrow("JWT_SECRET is required.");
  });

  it("rejects invalid ports", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        PORT: "70000"
      })
    ).toThrow("PORT must be an integer between 1 and 65535.");
  });

  it("rejects partial vapid configuration", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        VAPID_PUBLIC_KEY: "public-only"
      })
    ).toThrow("VAPID_PRIVATE_KEY is required when VAPID_PUBLIC_KEY is set.");
  });

  it("rejects missing upload temp root", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        UPLOAD_TEMP_ROOT: " "
      })
    ).toThrow("UPLOAD_TEMP_ROOT is required.");
  });
});
