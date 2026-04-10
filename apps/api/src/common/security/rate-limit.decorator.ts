import { SetMetadata } from "@nestjs/common";

export type RateLimitKeySource = "ip" | "username" | "userId";

export type RateLimitRule = {
  bucket: string;
  key: RateLimitKeySource;
  limit: number;
  windowMs: number;
  blockDurationMs?: number;
};

export const RATE_LIMIT_RULES_KEY = "rate-limit-rules";

export const RateLimit = (...rules: RateLimitRule[]) => SetMetadata(RATE_LIMIT_RULES_KEY, rules);
