import {
  BadRequestException,
  ConflictException,
  Injectable
} from "@nestjs/common";
import { IdempotencyStatus, Prisma } from "@prisma/client";
import { StructuredLoggerService } from "../observability/structured-logger.service";
import { PrismaService } from "../../prisma/prisma.service";

type ExecuteParams<TResult> = {
  actorId: string;
  scope: string;
  key?: string;
  action: () => Promise<TResult>;
};

type ReservationResult<TResult> =
  | {
      kind: "reserved";
    }
  | {
      kind: "completed";
      response: TResult;
    };

@Injectable()
export class IdempotencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly logger: StructuredLoggerService
  ) {}

  async execute<TResult>({ actorId, scope, key, action }: ExecuteParams<TResult>) {
    const normalizedKey = this.normalizeKey(key);
    if (!normalizedKey) {
      return action();
    }

    const existing = await this.prisma.idempotencyKey.findUnique({
      where: {
        actorId_scope_key: {
          actorId,
          scope,
          key: normalizedKey
        }
      }
    });

    if (existing?.status === IdempotencyStatus.COMPLETED) {
      this.logger.info("idempotency.replay.completed", {
        actorId,
        scope,
        key: normalizedKey
      });
      return existing.response as TResult;
    }

    if (existing?.status === IdempotencyStatus.IN_PROGRESS) {
      this.logger.warn("idempotency.replay.conflict", {
        actorId,
        scope,
        key: normalizedKey
      });
      throw new ConflictException("Bu istek anahtari halen isleniyor.");
    }

    const reservation = await this.reserve<TResult>(actorId, scope, normalizedKey);
    if (reservation.kind === "completed") {
      return reservation.response;
    }

    try {
      const result = await action();
      await this.prisma.idempotencyKey.update({
        where: {
          actorId_scope_key: {
            actorId,
            scope,
            key: normalizedKey
          }
        },
        data: {
          status: IdempotencyStatus.COMPLETED,
          response: this.serialize(result) as Prisma.InputJsonValue
        }
      });
      return result;
    } catch (error) {
      await this.prisma.idempotencyKey.deleteMany({
        where: {
          actorId,
          scope,
          key: normalizedKey,
          status: IdempotencyStatus.IN_PROGRESS
        }
      });
      throw error;
    }
  }

  private async reserve<TResult>(
    actorId: string,
    scope: string,
    key: string
  ): Promise<ReservationResult<TResult>> {
    try {
      await this.prisma.idempotencyKey.create({
        data: {
          actorId,
          scope,
          key
        }
      });
      return {
        kind: "reserved"
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        const existing = await this.prisma.idempotencyKey.findUnique({
          where: {
            actorId_scope_key: {
              actorId,
              scope,
              key
            }
          }
        });

        if (existing?.status === IdempotencyStatus.COMPLETED) {
          this.logger.info("idempotency.replay.completed", {
            actorId,
            scope,
            key
          });
          return {
            kind: "completed",
            response: existing.response as TResult
          };
        }

        this.logger.warn("idempotency.replay.conflict", {
          actorId,
          scope,
          key
        });
        throw new ConflictException("Bu istek anahtari halen isleniyor.");
      }

      throw error;
    }
  }

  private normalizeKey(key?: string) {
    if (!key) {
      return undefined;
    }

    const trimmedKey = key.trim();
    if (!trimmedKey) {
      return undefined;
    }

    if (!/^[A-Za-z0-9._:-]{8,128}$/u.test(trimmedKey)) {
      throw new BadRequestException("Idempotency key gecersiz.");
    }

    return trimmedKey;
  }

  private serialize(value: unknown): unknown {
    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.serialize(item));
    }

    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value).map(([key, entryValue]) => [key, this.serialize(entryValue)])
      );
    }

    return value;
  }
}
