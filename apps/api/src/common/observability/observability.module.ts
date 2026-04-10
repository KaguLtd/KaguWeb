import { Global, Module } from "@nestjs/common";
import { RequestContextMiddleware } from "./request-context.middleware";
import { RequestContextService } from "./request-context.service";
import { StructuredLoggerService } from "./structured-logger.service";

@Global()
@Module({
  providers: [RequestContextService, RequestContextMiddleware, StructuredLoggerService],
  exports: [RequestContextService, RequestContextMiddleware, StructuredLoggerService]
})
export class ObservabilityModule {}
