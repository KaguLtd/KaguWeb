import { validateAppEnv } from "../src/common/config/app-env";

describe("validateAppEnv", () => {
  const baseEnv = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/kagu?schema=public",
    JWT_SECRET: "test-secret",
    PORT: "4000",
    WEB_ORIGIN: "http://localhost:3000",
    STORAGE_ROOT: "./storage"
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
});
