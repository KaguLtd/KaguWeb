import { RequestContextMiddleware } from "../src/common/observability/request-context.middleware";
import { RequestContextService } from "../src/common/observability/request-context.service";

type MiddlewareRequest = {
  headers: Record<string, string>;
  requestId?: string;
};

describe("RequestContextMiddleware", () => {
  it("creates a request id when the client does not provide one", () => {
    const requestContext = new RequestContextService();
    const middleware = new RequestContextMiddleware(requestContext);
    const request: MiddlewareRequest = {
      headers: {}
    };
    const response = {
      setHeader: jest.fn()
    };
    let seenRequestId: string | null = null;

    middleware.use(request as never, response as never, () => {
      seenRequestId = requestContext.getRequestId();
    });

    expect(typeof request.requestId).toBe("string");
    expect(request.requestId).toHaveLength(36);
    expect(seenRequestId).toBe(request.requestId);
    expect(response.setHeader).toHaveBeenCalledWith("x-request-id", request.requestId);
  });

  it("preserves a valid incoming request id", () => {
    const requestContext = new RequestContextService();
    const middleware = new RequestContextMiddleware(requestContext);
    const request: MiddlewareRequest = {
      headers: {
        "x-request-id": "client-trace-1234"
      }
    };
    const response = {
      setHeader: jest.fn()
    };

    middleware.use(request as never, response as never, jest.fn());

    expect(request.requestId).toBe("client-trace-1234");
    expect(response.setHeader).toHaveBeenCalledWith("x-request-id", "client-trace-1234");
  });
});
