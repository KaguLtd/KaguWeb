import { BadRequestException } from "@nestjs/common";
import { of, throwError } from "rxjs";
import { RequestLoggingInterceptor } from "../src/common/observability/request-logging.interceptor";
import { RequestContextService } from "../src/common/observability/request-context.service";
import { StructuredLoggerService } from "../src/common/observability/structured-logger.service";

describe("RequestLoggingInterceptor", () => {
  let consoleLogSpy: jest.SpyInstance;
  let consoleWarnSpy: jest.SpyInstance;
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  function createInterceptor() {
    const requestContext = new RequestContextService();
    const logger = new StructuredLoggerService(requestContext);
    return new RequestLoggingInterceptor(logger);
  }

  function createContext() {
    const request = {
      method: "POST",
      originalUrl: "/api/auth/login",
      headers: {
        "user-agent": "jest"
      },
      ip: "127.0.0.1",
      requestId: "req-12345678",
      user: {
        sub: "user-1"
      },
      socket: {
        remoteAddress: "127.0.0.1"
      }
    };
    const response = {
      statusCode: 200
    };

    return {
      request,
      response,
      context: {
        getType: jest.fn().mockReturnValue("http"),
        switchToHttp: jest.fn().mockReturnValue({
          getRequest: () => request,
          getResponse: () => response
        })
      }
    };
  }

  it("writes a structured info log for successful requests", async () => {
    const interceptor = createInterceptor();
    const { context } = createContext();

    await new Promise<void>((resolve, reject) => {
      interceptor.intercept(context as never, { handle: () => of({ ok: true }) }).subscribe({
        complete: resolve,
        error: reject
      });
    });

    expect(consoleLogSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleLogSpy.mock.calls[0][0]);
    expect(payload).toMatchObject({
      level: "info",
      event: "http.request.completed",
      method: "POST",
      path: "/api/auth/login",
      statusCode: 200,
      requestId: "req-12345678",
      userId: "user-1",
      userAgent: "jest"
    });
  });

  it("writes a warning log for handled client errors", async () => {
    const interceptor = createInterceptor();
    const { context } = createContext();

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(context as never, {
          handle: () => throwError(() => new BadRequestException("invalid payload"))
        })
        .subscribe({
          error: () => resolve()
        });
    });

    expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleWarnSpy.mock.calls[0][0]);
    expect(payload).toMatchObject({
      level: "warn",
      event: "http.request.completed",
      statusCode: 400,
      requestId: "req-12345678"
    });
    expect(payload.error).toMatchObject({
      name: "BadRequestException",
      message: "invalid payload"
    });
  });

  it("writes an error log for server errors", async () => {
    const interceptor = createInterceptor();
    const { context } = createContext();

    await new Promise<void>((resolve) => {
      interceptor
        .intercept(context as never, {
          handle: () => throwError(() => new Error("boom"))
        })
        .subscribe({
          error: () => resolve()
        });
    });

    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(consoleErrorSpy.mock.calls[0][0]);
    expect(payload).toMatchObject({
      level: "error",
      event: "http.request.completed",
      statusCode: 500,
      requestId: "req-12345678"
    });
    expect(payload.error).toMatchObject({
      name: "Error",
      message: "boom"
    });
    expect(typeof payload.error.stack).toBe("string");
  });
});
