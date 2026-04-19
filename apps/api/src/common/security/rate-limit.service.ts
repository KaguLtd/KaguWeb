import { Injectable } from "@nestjs/common";

type RateLimitEntry = {
  blockedUntil: number | null;
  timestamps: number[];
};

type ConsumeRateLimitParams = {
  bucket: string;
  subject: string;
  limit: number;
  windowMs: number;
  blockDurationMs?: number;
};

type ConsumeRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  retryAfterMs: number;
};

@Injectable()
export class RateLimitService {
  // Single-instance in-memory limiter. Suitable for the planned single Ubuntu API process
  // behind Caddy. Horizontal scaling would require a shared store such as Redis.
  private readonly entries = new Map<string, RateLimitEntry>();

  consume(params: ConsumeRateLimitParams): ConsumeRateLimitResult {
    const now = Date.now();
    const storageKey = `${params.bucket}:${params.subject}`;
    const entry = this.entries.get(storageKey) ?? {
      blockedUntil: null,
      timestamps: []
    };

    entry.timestamps = entry.timestamps.filter((timestamp) => timestamp > now - params.windowMs);

    if (entry.blockedUntil && entry.blockedUntil > now) {
      this.entries.set(storageKey, entry);
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfterMs: entry.blockedUntil - now
      };
    }

    entry.blockedUntil = null;

    if (entry.timestamps.length >= params.limit) {
      const blockDurationMs = params.blockDurationMs ?? params.windowMs;
      entry.blockedUntil = now + blockDurationMs;
      this.entries.set(storageKey, entry);
      return {
        allowed: false,
        remaining: 0,
        resetAt: entry.blockedUntil,
        retryAfterMs: blockDurationMs
      };
    }

    entry.timestamps.push(now);
    this.entries.set(storageKey, entry);

    const oldestTimestamp = entry.timestamps[0] ?? now;
    return {
      allowed: true,
      remaining: Math.max(0, params.limit - entry.timestamps.length),
      resetAt: oldestTimestamp + params.windowMs,
      retryAfterMs: 0
    };
  }
}
