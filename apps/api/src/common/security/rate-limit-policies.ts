import { RateLimitRule } from "./rate-limit.decorator";

function minutes(value: number) {
  return value * 60 * 1000;
}

export const AUTH_LOGIN_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "auth.login.ip",
    key: "ip",
    limit: 10,
    windowMs: minutes(15),
    blockDurationMs: minutes(15)
  },
  {
    bucket: "auth.login.username",
    key: "username",
    limit: 5,
    windowMs: minutes(15),
    blockDurationMs: minutes(15)
  }
];

export const AUTH_REFRESH_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "auth.refresh.ip",
    key: "ip",
    limit: 30,
    windowMs: minutes(15),
    blockDurationMs: minutes(5)
  }
];

export const AUTH_LOGOUT_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "auth.logout.ip",
    key: "ip",
    limit: 30,
    windowMs: minutes(15),
    blockDurationMs: minutes(5)
  }
];

export const AUTH_PASSWORD_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "auth.password.user",
    key: "userId",
    limit: 5,
    windowMs: minutes(15),
    blockDurationMs: minutes(15)
  },
  {
    bucket: "auth.password.ip",
    key: "ip",
    limit: 10,
    windowMs: minutes(15),
    blockDurationMs: minutes(15)
  }
];

export const MAIN_FILE_UPLOAD_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "files.main-upload.user",
    key: "userId",
    limit: 20,
    windowMs: minutes(15),
    blockDurationMs: minutes(10)
  }
];

export const TIMELINE_ENTRY_UPLOAD_RATE_LIMITS: RateLimitRule[] = [
  {
    bucket: "files.timeline-entry.user",
    key: "userId",
    limit: 20,
    windowMs: minutes(15),
    blockDurationMs: minutes(10)
  }
];
