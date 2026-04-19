export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "/api";

export const AUTH_UNAUTHORIZED_EVENT = "kagu:auth-unauthorized";

type ApiRequestInit = RequestInit & {
  skipAuthRetry?: boolean;
};

type RefreshHandler = () => Promise<string | null>;

let refreshHandler: RefreshHandler | null = null;
let refreshInFlight: Promise<string | null> | null = null;

export class ApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

const SERVICE_UNAVAILABLE_MESSAGE = "Sunucuya gecici olarak ulasilamiyor. Biraz sonra tekrar deneyin.";

function isServiceUnavailableResponse(response: Response, raw: string) {
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  const normalized = raw.trim().toLowerCase();

  if (response.status !== 500 && response.status !== 502 && response.status !== 503 && response.status !== 504) {
    return false;
  }

  return (
    contentType.includes("text/html") ||
    normalized === "internal server error" ||
    normalized.includes("econnrefused") ||
    normalized.includes("failed to proxy") ||
    normalized.includes("proxy error")
  );
}

function toNetworkApiError(error: unknown) {
  const message =
    error instanceof Error && error.message.trim()
      ? SERVICE_UNAVAILABLE_MESSAGE
      : SERVICE_UNAVAILABLE_MESSAGE;

  return new ApiError(message, 503, {
    cause: error instanceof Error ? error.message : String(error)
  });
}

export function registerApiAuthRefresh(handler: RefreshHandler | null) {
  refreshHandler = handler;
}

async function runRefreshHandler() {
  if (!refreshHandler) {
    return null;
  }

  if (!refreshInFlight) {
    refreshInFlight = Promise.resolve(refreshHandler()).finally(() => {
      refreshInFlight = null;
    });
  }

  return refreshInFlight;
}

function shouldTryAuthRefresh(path: string, options: ApiRequestInit) {
  if (options.skipAuthRetry) {
    return false;
  }

  return !path.startsWith("/auth/");
}

async function requestOnce(path: string, options: ApiRequestInit, token?: string | null) {
  const { skipAuthRetry: _skipAuthRetry, ...fetchOptions } = options;
  const headers = new Headers(fetchOptions.headers);

  if (!headers.has("Content-Type") && !(fetchOptions.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(resolveApiUrl(path), {
    ...fetchOptions,
    headers,
    cache: fetchOptions.cache ?? "no-store",
    credentials: fetchOptions.credentials ?? "include"
  });
}

function resolveApiUrl(path: string) {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }

  if (path.startsWith("/api/") || path === "/api") {
    return path;
  }

  return `${API_BASE_URL}${path}`;
}

async function parseApiError(response: Response) {
  const raw = await response.text();

  if (isServiceUnavailableResponse(response, raw)) {
    return new ApiError(SERVICE_UNAVAILABLE_MESSAGE, 503, {
      status: response.status,
      body: raw
    });
  }

  let message = raw || "Istek basarisiz oldu.";
  let details: unknown = null;

  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    details = parsed;
    if (Array.isArray(parsed.message)) {
      message = parsed.message.join(", ");
    } else if (typeof parsed.message === "string") {
      message = parsed.message;
    }
  } catch {
    // Keep raw text when the response body is not JSON.
  }

  return new ApiError(message, response.status, details);
}

export async function apiFetch<T>(
  path: string,
  options: ApiRequestInit = {},
  token?: string | null
): Promise<T> {
  let response: Response;
  try {
    response = await requestOnce(path, options, token);
  } catch (error) {
    throw toNetworkApiError(error);
  }

  if (
    response.status === 401 &&
    shouldTryAuthRefresh(path, options) &&
    typeof window !== "undefined"
  ) {
    const refreshedToken = await runRefreshHandler();
    if (refreshedToken) {
      try {
        response = await requestOnce(path, { ...options, skipAuthRetry: true }, refreshedToken);
      } catch (error) {
        throw toNetworkApiError(error);
      }
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    }

    throw await parseApiError(response);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

export function buildApiUrl(path: string) {
  return resolveApiUrl(path);
}

export async function fetchAuthorizedBlob(path: string, token: string) {
  let response: Response;
  try {
    response = await requestOnce(path, { method: "GET" }, token);
  } catch (error) {
    throw toNetworkApiError(error);
  }

  if (
    response.status === 401 &&
    shouldTryAuthRefresh(path, {}) &&
    typeof window !== "undefined"
  ) {
    const refreshedToken = await runRefreshHandler();
    if (refreshedToken) {
      try {
        response = await requestOnce(path, { method: "GET", skipAuthRetry: true }, refreshedToken);
      } catch (error) {
        throw toNetworkApiError(error);
      }
    }
  }

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(AUTH_UNAUTHORIZED_EVENT));
    }
    throw await parseApiError(response);
  }

  const blob = await response.blob();
  const disposition = response.headers.get("Content-Disposition");
  const filenameMatch = disposition?.match(/filename=\"?([^\"]+)\"?/);

  return {
    blob,
    filename: filenameMatch?.[1] ?? "dosya",
    objectUrl: URL.createObjectURL(blob)
  };
}

export function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
