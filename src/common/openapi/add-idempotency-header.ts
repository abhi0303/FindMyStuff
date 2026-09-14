import { OpenAPIObject } from '@nestjs/swagger';
import { OperationObject, PathItemObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const MUTATING = ['post', 'put', 'patch', 'delete'] as const;

/**
 * Idempotency-Key is a cross-cutting concern (IdempotencyInterceptor, applied
 * globally) rather than something any single controller's DTOs own, so it is
 * documented here in one place instead of an @ApiHeader() repeated on every
 * mutating route. Only added to POST/PUT/PATCH/DELETE — GET is inherently
 * idempotent and the interceptor ignores the header there regardless.
 *
 * Shared by main.ts (the live /api/docs UI) and scripts/generate-openapi.ts
 * (the committed openapi.json/.yaml), so both stay consistent with each other.
 */
export function addIdempotencyKeyHeader(document: OpenAPIObject): void {
  for (const pathItem of Object.values(document.paths) as PathItemObject[]) {
    for (const method of MUTATING) {
      const operation: OperationObject | undefined = pathItem[method];
      if (!operation) continue;

      operation.parameters ??= [];
      operation.parameters.push({
        name: 'Idempotency-Key',
        in: 'header',
        required: false,
        schema: { type: 'string', maxLength: 200 },
        description:
          'Optional. Safely retry this exact request after a dropped connection or ' +
          'timeout — a repeat with the same key and the same body returns the original ' +
          'response instead of running again. A repeat with the same key but a ' +
          'different body is rejected (422). See FRONTEND.md for the full pattern.',
      });
    }
  }
}
