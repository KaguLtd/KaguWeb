import { validateAppEnv } from "../src/common/config/app-env";

describe("validateAppEnv", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/kagu?schema=public",
    JWT_SECRET: "test-secret",
    PORT: "4000",
    WEB_ORIGIN: "http://localhost:3000",
    STORAGE_ROOT: "./storage",
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

  it("accepts s3-compatible storage configuration", () => {
    expect(
      validateAppEnv({
        ...baseEnv,
        STORAGE_DRIVER: "s3-compatible",
        STORAGE_PUBLIC_BASE_URL: "https://cdn.kagu.local",
        OBJECT_STORAGE_ACCESS_MODE: "public",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key"
      })
    ).toMatchObject({
      STORAGE_DRIVER: "s3-compatible",
      STORAGE_PUBLIC_BASE_URL: "https://cdn.kagu.local",
      OBJECT_STORAGE_ACCESS_MODE: "public",
      OBJECT_STORAGE_BUCKET: "kagu-assets"
    });
  });

  it("accepts signed object storage access mode with ttl", () => {
    expect(
      validateAppEnv({
        ...baseEnv,
        STORAGE_DRIVER: "s3-compatible",
        OBJECT_STORAGE_ACCESS_MODE: "signed",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
        OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: "900"
      })
    ).toMatchObject({
      OBJECT_STORAGE_ACCESS_MODE: "signed",
      OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: "900"
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

  it("rejects missing object storage secrets when object driver is selected", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        STORAGE_DRIVER: "s3-compatible",
        OBJECT_STORAGE_ACCESS_MODE: "public",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets"
      })
    ).toThrow("OBJECT_STORAGE_ACCESS_KEY_ID is required when STORAGE_DRIVER is s3-compatible.");
  });

  it("rejects public object storage mode without a public base url", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        STORAGE_DRIVER: "s3-compatible",
        OBJECT_STORAGE_ACCESS_MODE: "public",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key"
      })
    ).toThrow("STORAGE_PUBLIC_BASE_URL is required when OBJECT_STORAGE_ACCESS_MODE is public.");
  });

  it("rejects signed object storage mode without a valid ttl", () => {
    expect(() =>
      validateAppEnv({
        ...baseEnv,
        STORAGE_DRIVER: "s3-compatible",
        OBJECT_STORAGE_ACCESS_MODE: "signed",
        OBJECT_STORAGE_ENDPOINT: "https://s3.kagu.local",
        OBJECT_STORAGE_REGION: "eu-central-1",
        OBJECT_STORAGE_BUCKET: "kagu-assets",
        OBJECT_STORAGE_ACCESS_KEY_ID: "access-key",
        OBJECT_STORAGE_SECRET_ACCESS_KEY: "secret-key",
        OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS: "30"
      })
    ).toThrow(
      "OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS must be an integer of at least 60 when OBJECT_STORAGE_ACCESS_MODE is signed."
    );
  });
});
