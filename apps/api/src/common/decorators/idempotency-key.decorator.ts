import { createParamDecorator, ExecutionContext } from "@nestjs/common";

function headerValue(header: string | string[] | undefined) {
  return Array.isArray(header) ? header[0] : header;
}

export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx.switchToHttp().getRequest();
    const value = headerValue(request.headers["x-idempotency-key"])?.trim();
    return value || undefined;
  }
);
