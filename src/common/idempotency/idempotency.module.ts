import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { IdempotencyCleanupService } from './idempotency-cleanup.service';
import { IdempotencyInterceptor } from './idempotency.interceptor';

@Global()
@Module({
  providers: [
    IdempotencyCleanupService,
    { provide: APP_INTERCEPTOR, useClass: IdempotencyInterceptor },
  ],
})
export class IdempotencyModule {}
