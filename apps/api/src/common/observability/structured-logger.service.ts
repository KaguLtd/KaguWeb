import { Injectable } from "@nestjs/common";
import { RequestContextService } from "./request-context.service";

type StructuredLogPayload = Record<string, unknown>;

@Injectable()
export class StructuredLoggerService {
  constructor(private readonly requestContext: RequestContextService) {}

  info(event: string, payload: StructuredLogPayload = {}) {
    this.write("info", event, payload);
  }

  warn(event: string, payload: StructuredLogPayload = {}) {
    this.write("warn", event, payload);
  }

  error(event: string, payload: StructuredLogPayload = {}) {
    this.write("error", event, payload);
  }

  private write(level: "info" | "warn" | "error", event: string, payload: StructuredLogPayload) {
    const fallbackRequestId = this.requestContext.getRequestId();
    const entry: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      event,
      ...payload
    };

    if (entry.requestId === undefined && fallbackRequestId) {
      entry.requestId = fallbackRequestId;
    }

    const line = JSON.stringify(entry);
    if (level === "error") {
      console.error(line);
      return;
    }

    if (level === "warn") {
      console.warn(line);
      return;
    }

    console.log(line);
  }
}
