import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  HttpStatus,
  Injectable,
  Logger,
  NestInterceptor,
  UnprocessableEntityException,
} from '@nestjs/common';
import { HTTP_CODE_METADATA } from '@nestjs/common/constants';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { IdempotencyKeyStatus, Prisma } from '@prisma/client';
import { Request, Response } from 'express';
import { Observable, catchError, from, of, switchMap, throwError } from 'rxjs';
// NOTE: `reserveAndRun`/`replayOrReject` are async functions that resolve to
// an Observable (they need to `await` a Prisma call before deciding which
// Observable to return). `from(aPromiseThatResolvesToAnObservable)` does NOT
// auto-flatten that — it emits the Observable itself as a single value,
// which is not what any caller wants. Every place below that wraps one of
// these calls MUST pipe it through `switchMap((obs) => obs)` to actually
// subscribe to and flatten the inner Observable's emissions.
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedRequest } from '../types';
import { stableStringify } from '../utils/stable-stringify.util';

const HEADER = 'idempotency-key';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
/** Above this, treat the header as misuse rather than a real key. */
const MAX_KEY_LENGTH = 200;

/**
 * Lets a client safely retry a create/update/delete after a dropped
 * connection or timeout, via a client-supplied `Idempotency-Key` header.
 *
 * A first request with a given key runs normally and its response is stored.
 * A repeat with the SAME key and the SAME body returns the stored response
 * without re-running the handler. A repeat with the same key but a DIFFERENT
 * body is treated as a client bug (422) — a key must represent one logical
 * operation. Two concurrent requests racing on the same key get a 409 on the
 * loser, rather than both executing.
 *
 * Entirely opt-in: requests without the header pass straight through with no
 * behaviour change, and GET/HEAD/OPTIONS are never intercepted.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  private readonly logger = new Logger(IdempotencyInterceptor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    private readonly config: ConfigService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const httpContext = context.switchToHttp();
    const request = httpContext.getRequest<AuthenticatedRequest>();
    const response = httpContext.getResponse<Response>();

    const key = request.headers[HEADER];
    const userId = request.user?.id;

    if (
      typeof key !== 'string' ||
      key.length === 0 ||
      key.length > MAX_KEY_LENGTH ||
      !MUTATING_METHODS.has(request.method) ||
      !userId
    ) {
      return next.handle();
    }

    return from(this.reserveAndRun(context, next, request, response, userId, key)).pipe(
      switchMap((inner) => inner),
    );
  }

  /** Tries to claim the key. Runs the real handler on success, replays or rejects on conflict. */
  private async reserveAndRun(
    context: ExecutionContext,
    next: CallHandler,
    request: Request,
    response: Response,
    userId: string,
    key: string,
  ): Promise<Observable<unknown>> {
    const method = request.method;
    const path = request.route?.path ?? request.path;
    const requestBodyHash = stableStringify(request.body ?? {});
    const ttlHours = this.config.getOrThrow<number>('idempotency.ttlHours');
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    try {
      await this.prisma.idempotencyKey.create({
        data: { userId, key, method, path, requestBodyHash, expiresAt },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return this.replayOrReject(context, next, request, response, userId, key, method, path, requestBodyHash);
      }
      throw error;
    }

    return this.runAndStore(context, next, response, userId, key);
  }

  private async replayOrReject(
    context: ExecutionContext,
    next: CallHandler,
    request: Request,
    response: Response,
    userId: string,
    key: string,
    method: string,
    path: string,
    requestBodyHash: string,
  ): Promise<Observable<unknown>> {
    const existing = await this.prisma.idempotencyKey.findUnique({
      where: { userId_key: { userId, key } },
    });

    // Vanishingly unlikely (deleted between the failed create and this read),
    // but if it happens the key is free again — reserve fresh.
    if (!existing) {
      return this.reserveAndRun(context, next, request, response, userId, key);
    }

    if (existing.expiresAt.getTime() < Date.now()) {
      // Stale — the key is reusable. Clear it and reserve fresh. A unique
      // violation here (a genuine concurrent racer) falls into the PENDING
      // branch below on that attempt's own retry.
      await this.prisma.idempotencyKey.deleteMany({
        where: { id: existing.id, expiresAt: existing.expiresAt },
      });
      return this.reserveAndRun(context, next, request, response, userId, key);
    }

    if (
      existing.method !== method ||
      existing.path !== path ||
      existing.requestBodyHash !== requestBodyHash
    ) {
      throw new UnprocessableEntityException(
        'This Idempotency-Key was already used for a different request. ' +
          'Use a new key for each distinct operation.',
      );
    }

    if (existing.status === IdempotencyKeyStatus.PENDING) {
      throw new ConflictException(
        'A request with this Idempotency-Key is already being processed. Retry shortly.',
      );
    }

    this.logger.debug(`Replaying stored response for idempotency key ${key}`);
    response.status(existing.responseStatus ?? HttpStatus.OK);
    return of(existing.responseBody);
  }

  private runAndStore(
    context: ExecutionContext,
    next: CallHandler,
    response: Response,
    userId: string,
    key: string,
  ): Observable<unknown> {
    // The metadata Nest itself uses to decide the status code — reading it
    // the same way keeps what we STORE consistent with what the client
    // actually receives on the original call, without depending on
    // response.statusCode, which is not reliably finalised at this point in
    // the interceptor pipeline.
    const statusOverride = this.reflector.get<number | undefined>(
      HTTP_CODE_METADATA,
      context.getHandler(),
    );
    const status = statusOverride ?? inferDefaultStatus(context);

    return next.handle().pipe(
      switchMap((body: unknown) => {
        // Round-trip through JSON so what is stored (and later replayed) is
        // exactly what a real response serializes to — Date objects become
        // the same ISO strings a client would otherwise receive.
        const storable = JSON.parse(JSON.stringify(body ?? null)) as Prisma.InputJsonValue;

        return from(
          this.prisma.idempotencyKey.update({
            where: { userId_key: { userId, key } },
            data: { status: IdempotencyKeyStatus.COMPLETED, responseStatus: status, responseBody: storable },
          }),
        ).pipe(switchMap(() => of(body)));
      }),
      catchError((error: unknown) => {
        const errorStatus = (error as { status?: number })?.status;

        if (typeof errorStatus === 'number' && errorStatus < 500) {
          // A real, deterministic client error — cache it too, so a naive
          // retry gets the same answer immediately instead of hammering the
          // server with a request that will only ever fail the same way.
          const storable = JSON.parse(
            JSON.stringify((error as { response?: unknown })?.response ?? { message: String(error) }),
          ) as Prisma.InputJsonValue;

          return from(
            this.prisma.idempotencyKey.update({
              where: { userId_key: { userId, key } },
              data: {
                status: IdempotencyKeyStatus.COMPLETED,
                responseStatus: errorStatus,
                responseBody: storable,
              },
            }),
          ).pipe(switchMap(() => throwError(() => error)));
        }

        // A transient/server failure: release the key entirely so a retry
        // can actually attempt the operation again, rather than being stuck
        // replaying a 5xx forever.
        return from(this.prisma.idempotencyKey.deleteMany({ where: { userId, key } })).pipe(
          switchMap(() => throwError(() => error)),
        );
      }),
    );
  }
}

/** POST defaults to 201 Created; every other mutating verb defaults to 200. */
function inferDefaultStatus(context: ExecutionContext): number {
  const method = context.switchToHttp().getRequest<Request>().method;
  return method === 'POST' ? HttpStatus.CREATED : HttpStatus.OK;
}
