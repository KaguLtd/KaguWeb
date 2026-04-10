import {
  CallHandler,
  ExecutionContext,
  HttpException,
  Injectable,
  NestInterceptor
} from "@nestjs/common";
import type { Request, Response } from "express";
import { Observable, throwError } from "rxjs";
import { catchError, finalize } from "rxjs/operators";
import { StructuredLoggerService } from "./structured-logger.service";

type HttpRequest = Request & {
  requestId?: string;
  user?: {
    sub?: string;
  };
};

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  constructor(private readonly logger: StructuredLoggerService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") {
      return next.handle();
    }

    const http = context.switchToHttp();
    const request = http.getRequest<HttpRequest>();
    const response = http.getResponse<Response>();
    const startedAt = process.hrtime.bigint();
    let capturedError: unknown;

    return next.handle().pipe(
      catchError((error) => {
        capturedError = error;
        return throwError(() => error);
      }),
      finalize(() => {
        const statusCode = this.resolveStatusCode(capturedError, response.statusCode);
        const payload = {
          method: request.method,
          path: request.originalUrl ?? request.url,
          statusCode,
          durationMs: this.toDurationMs(startedAt),
          ip: this.resolveIpAddress(request),
          userAgent: this.headerValue(request.headers["user-agent"]),
          userId: request.user?.sub ?? null,
          requestId: request.requestId
        };

        if (!capturedError) {
          this.logger.info("http.request.completed", payload);
          return;
        }

        const errorPayload = {
          ...payload,
          error: this.serializeError(capturedError, statusCode)
        };

        if (statusCode >= 500) {
          this.logger.error("http.request.completed", errorPayload);
          return;
        }

        this.logger.warn("http.request.completed", errorPayload);
      })
    );
  }

  private resolveStatusCode(error: unknown, currentStatusCode?: number) {
    if (error instanceof HttpException) {
      return error.getStatus();
    }

    if (typeof currentStatusCode === "number" && currentStatusCode >= 400) {
      return currentStatusCode;
    }

    return error ? 500 : (currentStatusCode ?? 200);
  }

  private serializeError(error: unknown, statusCode: number) {
    if (error instanceof Error) {
      return {
        name: error.name,
        message: error.message,
        ...(statusCode >= 500 && error.stack ? { stack: error.stack } : {})
      };
    }

    return {
      name: "UnknownError",
      message: String(error)
    };
  }

  private toDurationMs(startedAt: bigint) {
    return Number(((process.hrtime.bigint() - startedAt) / BigInt(100000)) / BigInt(10));
  }

  private resolveIpAddress(request: HttpRequest) {
    const forwardedFor = this.headerValue(request.headers["x-forwarded-for"]);
    if (forwardedFor) {
      return forwardedFor.split(",")[0]?.trim() ?? null;
    }

    return request.ip ?? request.socket.remoteAddress ?? null;
  }

  private headerValue(value: string | string[] | undefined) {
    return Array.isArray(value) ? value[0] ?? null : value ?? null;
  }
}
