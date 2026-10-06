import 'reflect-metadata';

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { buildOpenApiDocument } from './openapi';

async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // Every endpoint is prefixed `/api/v1` — `FRD/Y1a-api-shared.md`:
  // "All endpoints are prefixed `/api/v1`".
  app.setGlobalPrefix('api/v1');

  // ---- OpenAPI contract surface (non-production only) --------------------
  //
  // Serve the generated OpenAPI 3.1 document at `GET /api/v1/openapi.json`,
  // gated on NODE_ENV !== 'production' so the API surface is never published in
  // a court deployment (the committed `openapi/openapi.json` remains the source
  // of truth for the generated client either way).
  //
  // THE GUARD CONSTRAINT (01-13 plan): this route must be reachable without a
  // session, but NO global guard may acquire a path-based exemption list —
  // that list is exactly where a future authenticated route quietly lands and
  // ships unguarded. So the document is served from a RAW EXPRESS route
  // registered here, which is mounted on the underlying HTTP adapter and never
  // enters the Nest controller pipeline at all. SessionAuthGuard and AbacGuard
  // are untouched; the Swagger interactive UI is deliberately NOT shipped
  // (only the JSON document), because mounting it would reintroduce exactly the
  // guard-exemption problem the constraint forbids.
  if (process.env.NODE_ENV !== 'production') {
    const document = buildOpenApiDocument(app);
    const httpAdapter = app.getHttpAdapter();
    httpAdapter.get(
      '/api/v1/openapi.json',
      (_req: unknown, res: { json: (body: unknown) => void }) => {
        res.json(document);
      },
    );
    logger.log('OpenAPI 3.1 document served at /api/v1/openapi.json (non-production)');
  }

  // Transport-security posture per `TechArch/04-security.md` §7.5. TLS is
  // actually TERMINATED at the reverse proxy that arrives with the Compose
  // stack in plan 01-04; HSTS here declares the policy the proxy enforces.
  //
  // Two helmet defaults are deliberately overridden because they break the
  // cross-origin preview iframe without adding security for this service:
  //   - `crossOriginResourcePolicy` is relaxed to 'cross-origin'
  //   - `crossOriginEmbedderPolicy` is disabled
  // `frameguard` is likewise disabled rather than left at DENY. These are
  // presentation-layer controls; the authoritative access control is the
  // global guard chain registered in `app.module.ts`.
  app.use(
    helmet({
      hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      crossOriginEmbedderPolicy: false,
      frameguard: false,
      contentSecurityPolicy: false,
    }),
  );

  // The last thing between a thrown error and the client. Guarantees every
  // failure leaves as an `ApiErrorBody` and never as a stack trace
  // (FRD/Y2-errors.md principle 4).
  app.useGlobalFilters(new ApiExceptionFilter());

  const port = Number(process.env.PORT ?? 3000);

  // Bind 0.0.0.0, never localhost: `localhost` can resolve to IPv6 ::1 and
  // refuse an IPv4 connection from a proxy or health probe.
  await app.listen(port, '0.0.0.0');

  logger.log(`Platform Core listening on 0.0.0.0:${port} (prefix /api/v1)`);
}

void bootstrap();
