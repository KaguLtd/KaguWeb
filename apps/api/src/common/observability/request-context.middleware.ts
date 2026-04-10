import { Injectable, NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { RequestContextService } from "./request-context.service";

type HttpRequest = Request & {
  requestId?: string;
};

@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly requestContext: RequestContextService) {}

  use(request: HttpRequest, response: Response, next: NextFunction) {
    const requestId = this.resolveRequestId(request.headers["x-request-id"]);
    request.requestId = requestId;
    response.setHeader("x-request-id", requestId);

    this.requestContext.run({ requestId }, next);
  }

  private resolveRequestId(header: string | string[] | undefined) {
    const rawValue = Array.isArray(header) ? header[0] : header;
    const trimmedValue = rawValue?.trim();

    if (trimmedValue && /^[A-Za-z0-9._:-]{8,128}$/u.test(trimmedValue)) {
      return trimmedValue;
    }

    return randomUUID();
  }
}
