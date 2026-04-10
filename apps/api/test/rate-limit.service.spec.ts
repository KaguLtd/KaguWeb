import { RateLimitService } from "../src/common/security/rate-limit.service";

describe("RateLimitService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-04-09T09:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("allows requests until the configured limit and blocks the next one", () => {
    const service = new RateLimitService();

    expect(
      service.consume({
        bucket: "auth.login.ip",
        subject: "127.0.0.1",
        limit: 2,
        windowMs: 60_000
      })
    ).toMatchObject({ allowed: true, remaining: 1 });

    expect(
      service.consume({
        bucket: "auth.login.ip",
        subject: "127.0.0.1",
        limit: 2,
        windowMs: 60_000
      })
    ).toMatchObject({ allowed: true, remaining: 0 });

    expect(
      service.consume({
        bucket: "auth.login.ip",
        subject: "127.0.0.1",
        limit: 2,
        windowMs: 60_000,
        blockDurationMs: 120_000
      })
    ).toMatchObject({ allowed: false, remaining: 0, retryAfterMs: 120_000 });
  });

  it("allows the subject again after the block duration expires", () => {
    const service = new RateLimitService();

    service.consume({
      bucket: "auth.login.username",
      subject: "saha.1",
      limit: 1,
      windowMs: 60_000,
      blockDurationMs: 60_000
    });
    service.consume({
      bucket: "auth.login.username",
      subject: "saha.1",
      limit: 1,
      windowMs: 60_000,
      blockDurationMs: 60_000
    });

    jest.advanceTimersByTime(60_001);

    expect(
      service.consume({
        bucket: "auth.login.username",
        subject: "saha.1",
        limit: 1,
        windowMs: 60_000,
        blockDurationMs: 60_000
      })
    ).toMatchObject({ allowed: true, remaining: 0 });
  });
});
