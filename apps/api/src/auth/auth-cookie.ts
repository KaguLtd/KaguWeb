const ACCESS_COOKIE_NAME = "kagu_at";
const REFRESH_COOKIE_NAME = "kagu_rt";
const ACCESS_TOKEN_TTL_MS = 1000 * 60 * 30;
const PERSISTENT_REFRESH_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const SESSION_REFRESH_TTL_MS = 1000 * 60 * 60 * 12;

function serializeCookie(options: {
  name: string;
  value: string;
  path: string;
  maxAgeMs?: number;
  secure?: boolean;
}) {
  const parts = [
    `${options.name}=${encodeURIComponent(options.value)}`,
    `Path=${options.path}`,
    "HttpOnly",
    "SameSite=Lax"
  ];

  if (options.secure) {
    parts.push("Secure");
  }

  if (typeof options.maxAgeMs === "number") {
    parts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAgeMs / 1000))}`);
    parts.push(`Expires=${new Date(Date.now() + options.maxAgeMs).toUTCString()}`);
  }

  return parts.join("; ");
}

export function buildRefreshCookie(refreshToken: string, rememberMe: boolean, secure: boolean) {
  return serializeCookie({
    name: REFRESH_COOKIE_NAME,
    value: refreshToken,
    path: "/api/auth",
    maxAgeMs: rememberMe ? PERSISTENT_REFRESH_TTL_MS : undefined,
    secure
  });
}

export function buildAccessCookie(accessToken: string, secure: boolean) {
  return serializeCookie({
    name: ACCESS_COOKIE_NAME,
    value: accessToken,
    path: "/api",
    maxAgeMs: ACCESS_TOKEN_TTL_MS,
    secure
  });
}

export function buildClearedRefreshCookie(secure: boolean) {
  return [
    `${REFRESH_COOKIE_NAME}=`,
    "Path=/api/auth",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ]
    .filter(Boolean)
    .join("; ");
}

export function buildClearedAccessCookie(secure: boolean) {
  return [
    `${ACCESS_COOKIE_NAME}=`,
    "Path=/api",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : null,
    "Max-Age=0",
    "Expires=Thu, 01 Jan 1970 00:00:00 GMT"
  ]
    .filter(Boolean)
    .join("; ");
}

export function getRefreshSessionDurationMs(rememberMe: boolean) {
  return rememberMe ? PERSISTENT_REFRESH_TTL_MS : SESSION_REFRESH_TTL_MS;
}

export function extractRefreshToken(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [name, ...valueParts] = segment.trim().split("=");
    if (name === REFRESH_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}

export function extractAccessToken(cookieHeader?: string | null) {
  if (!cookieHeader) {
    return null;
  }

  const segments = cookieHeader.split(";");
  for (const segment of segments) {
    const [name, ...valueParts] = segment.trim().split("=");
    if (name === ACCESS_COOKIE_NAME) {
      return decodeURIComponent(valueParts.join("="));
    }
  }

  return null;
}
