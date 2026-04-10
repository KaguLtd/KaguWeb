import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request, Response } from "express";
import { RATE_LIMIT_RULES_KEY, RateLimitKeySource, RateLimitRule } from "./rate-limit.decorator";
import { RateLimitService } from "./rate-limit.service";

type HttpRequest = Request & {
  user?: {
    sub?: string;
  };
  body?: {
    username?: string;
  };
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService
  ) {}

  canActivate(context: ExecutionContext) {
    if (context.getType() !== "http") {
      return true;
    }

    const rules =
      this.reflector.getAllAndOverride<RateLimitRule[]>(RATE_LIMIT_RULES_KEY, [
        context.getHandler(),
        context.getClass()
      ]) ?? [];

    if (!rules.length) {
      return true;
    }

    const request = context.switchToHttp().getRequest<HttpRequest>();
    const response = context.switchToHttp().getResponse<Response>();

    for (const rule of rules) {
      const subject = this.resolveSubject(rule.key, request);
      if (!subject) {
        continue;
      }

      const result = this.rateLimitService.consume({
        bucket: rule.bucket,
        subject,
        limit: rule.limit,
        windowMs: rule.windowMs,
        blockDurationMs: rule.blockDurationMs
      });

      if (!result.allowed) {
        const retryAfterSeconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
        response.setHeader("Retry-After", String(retryAfterSeconds));
        response.setHeader("X-RateLimit-Limit", String(rule.limit));
        response.setHeader("X-RateLimit-Remaining", "0");
        response.setHeader("X-RateLimit-Reset", new Date(result.resetAt).toISOString());
        response.setHeader("X-RateLimit-Policy", rule.bucket);
        throw new HttpException(
          "Cok fazla istek gonderildi. Lutfen daha sonra tekrar deneyin.",
          HttpStatus.TOO_MANY_REQUESTS
        );
      }
    }

    return true;
  }

  private resolveSubject(key: RateLimitKeySource, request: HttpRequest) {
    if (key === "userId") {
      return request.user?.sub ?? null;
    }

    if (key === "username") {
      const username = request.body?.username?.trim().toLowerCase();
      return username ? username : null;
    }

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
