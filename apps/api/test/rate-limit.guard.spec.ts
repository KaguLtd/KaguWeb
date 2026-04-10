import { HttpException, HttpStatus } from "@nestjs/common";
import { RateLimitGuard } from "../src/common/security/rate-limit.guard";
import { RateLimitRule } from "../src/common/security/rate-limit.decorator";
import { RateLimitService } from "../src/common/security/rate-limit.service";

describe("RateLimitGuard", () => {
  function createGuard(rules: RateLimitRule[]) {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(rules)
    };
    const service = new RateLimitService();
    const guard = new RateLimitGuard(reflector as never, service);

    return { guard, service };
  }

  function createContext(overrides?: {
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
    ip?: string;
    user?: { sub?: string };
  }) {
    const request = {
      body: overrides?.body ?? {},
      headers: overrides?.headers ?? {},
      ip: overrides?.ip ?? "127.0.0.1",
      user: overrides?.user,
      socket: {
        remoteAddress: "127.0.0.1"
      }
    };
    const response = {
      setHeader: jest.fn()
    };
    const context = {
      getType: jest.fn().mockReturnValue("http"),
      getHandler: jest.fn(),
      getClass: jest.fn(),
      switchToHttp: jest.fn().mockReturnValue({
        getRequest: () => request,
        getResponse: () => response
      })
    };

    return { context, response };
  }

  it("allows a request when the subject is still under the limit", () => {
    const { guard } = createGuard([
      {
        bucket: "auth.login.ip",
        key: "ip",
        limit: 1,
        windowMs: 60_000
      }
    ]);
    const { context } = createContext();

    expect(guard.canActivate(context as never)).toBe(true);
  });

  it("blocks repeated requests and returns rate limit headers", () => {
    const { guard } = createGuard([
      {
        bucket: "auth.login.username",
        key: "username",
        limit: 1,
        windowMs: 60_000,
        blockDurationMs: 120_000
      }
    ]);
    const firstContext = createContext({
      body: {
        username: " Saha.1 "
      }
    });
    const secondContext = createContext({
      body: {
        username: "saha.1"
      }
    });

    expect(guard.canActivate(firstContext.context as never)).toBe(true);
    let error: unknown;
    try {
      guard.canActivate(secondContext.context as never);
    } catch (caughtError) {
      error = caughtError;
    }

    expect(error).toBeInstanceOf(HttpException);
    expect((error as HttpException).getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
    expect(secondContext.response.setHeader).toHaveBeenCalledWith("Retry-After", "120");
    expect(secondContext.response.setHeader).toHaveBeenCalledWith(
      "X-RateLimit-Policy",
      "auth.login.username"
    );
  });

  it("uses the authenticated user id for protected actions", () => {
    const { guard } = createGuard([
      {
        bucket: "files.main-upload.user",
        key: "userId",
        limit: 1,
        windowMs: 60_000
      }
    ]);
    const firstContext = createContext({
      user: {
        sub: "manager-1"
      }
    });
    const secondContext = createContext({
      user: {
        sub: "manager-1"
      }
    });

    expect(guard.canActivate(firstContext.context as never)).toBe(true);
    expect(() => guard.canActivate(secondContext.context as never)).toThrow(HttpException);
  });
});
