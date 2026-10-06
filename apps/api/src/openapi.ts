import { INestApplication } from '@nestjs/common';
import {
  DocumentBuilder,
  OpenAPIObject,
  SwaggerModule,
} from '@nestjs/swagger';

/**
 * ============================================================================
 * OpenAPI 3.1 contract — CODE-FIRST, the running code is the single source.
 * ============================================================================
 *
 * CONTEXT leaves the contract direction to Claude's discretion. This is
 * **code-first**: the controllers and `zod` schemas already exist and are the
 * thing that actually runs, so the document is generated FROM them.
 * `SwaggerModule.createDocument` walks the live Nest route table — every
 * `@Controller`/`@Get`/`@Post` that boots is discovered automatically — so a
 * route that ships is in the contract by construction, and a route that is
 * renamed changes the contract on the next emit. `TechArch/03a-api-shared.md`
 * §6 asks for "one source of truth"; with code-first the source of truth is
 * the code that serves the request.
 *
 * `git diff --exit-code openapi/openapi.json` in CI (`.github/workflows/e2e.yml`)
 * is what keeps that honest rather than aspirational: a controller change that
 * is not reflected in the committed contract fails the build.
 *
 * TWO POST-PROCESSING STEPS the `DocumentBuilder` cannot do on its own:
 *
 *   1. `@nestjs/swagger@7` emits `openapi: "3.0.0"`. §8.1 and §6 both specify
 *      **3.1**, so {@link buildOpenApiDocument} rewrites the version field.
 *   2. The shared `ApiErrorBody` envelope (`FRD/Y2-errors.md`) is registered
 *      once as a component schema and attached as the response body for every
 *      error status every operation can return (401/403/404/409/422/500/503),
 *      so the generated client has a single typed error shape to branch on.
 */

/** Error statuses every JudicialSync operation may return as an `ApiErrorBody`. */
const SHARED_ERROR_STATUSES = ['401', '403', '404', '409', '422', '500', '503'] as const;

/** The FRD Y2 shared error envelope, as an OpenAPI component schema. */
const API_ERROR_BODY_SCHEMA = {
  type: 'object',
  required: ['error_code', 'message'],
  properties: {
    error_code: {
      type: 'string',
      description:
        'Stable, machine-readable code. Clients branch on this, never on message text.',
    },
    message: {
      type: 'string',
      description: 'Human-readable, display-safe message — never a raw stack trace.',
    },
    detail: {
      type: 'object',
      additionalProperties: true,
      description: 'Optional structured context. Never carries internal exception detail.',
    },
  },
} as const;

/**
 * Response schemas for the operations the thin shell actually consumes.
 *
 * The controllers return plain TypeScript interfaces (not `@nestjs/swagger`
 * model classes), so the explorer cannot derive their shapes on its own and the
 * generated client would otherwise type every 200 body as `unknown`. The plan's
 * must-have is that "request and response shapes are compile-time checked", so
 * the success bodies for the three UI-consumed reads are registered here, from
 * the same source files the handlers return (`dto/auth.dto.ts`,
 * `case-context/dto/case.dto.ts`, `audit/...`). They are a code-first
 * AUGMENTATION of the generated paths, keyed by the operationId the explorer
 * assigns, so a renamed handler drops its typed response (visible as the client
 * reverting to `unknown`) rather than silently keeping a stale shape.
 */
const RESPONSE_SCHEMAS = {
  EntitlementsDto: {
    type: 'object',
    required: ['user_id', 'display_name', 'roles', 'scopes', 'entitlements', 'mfa_satisfied'],
    properties: {
      user_id: { type: 'string' },
      display_name: {
        type: 'string',
        description: 'UI-only human-readable name; carries no authority.',
      },
      roles: {
        type: 'array',
        items: {
          type: 'object',
          required: ['role_name'],
          properties: {
            role_name: { type: 'string' },
            court_id: { type: 'string' },
            division_id: { type: 'string' },
          },
        },
      },
      scopes: {
        type: 'array',
        items: {
          type: 'object',
          required: ['scope_type'],
          properties: {
            scope_type: { type: 'string' },
            scope_value: { type: 'string' },
            scope_enum_value: { type: 'string' },
          },
        },
      },
      entitlements: {
        type: 'array',
        items: { type: 'string' },
        description: 'Separately granted entitlements; a role never contributes here.',
      },
      mfa_satisfied: { type: 'boolean' },
    },
  },
  CaseSummary: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      case_number: { type: 'string' },
      title: { type: 'string', nullable: true },
      status: { type: 'string' },
      court_id: { type: 'string' },
    },
    additionalProperties: true,
  },
  CaseListResponse: {
    type: 'object',
    required: ['cases', 'total'],
    properties: {
      cases: { type: 'array', items: { $ref: '#/components/schemas/CaseSummary' } },
      total: { type: 'integer' },
    },
  },
  AuditExplorerResponse: {
    type: 'object',
    properties: {
      events: { type: 'array', items: { type: 'object', additionalProperties: true } },
      total: { type: 'integer' },
    },
    additionalProperties: true,
  },
} as const;

/**
 * Which operationId gets which success response schema, and the status.
 * The operationId is `<ControllerName>_<methodName>` as the explorer emits it.
 */
const OPERATION_RESPONSE_BINDINGS: Array<{
  operationId: string;
  status: string;
  schema: keyof typeof RESPONSE_SCHEMAS;
}> = [
  { operationId: 'AuthController_entitlements', status: '200', schema: 'EntitlementsDto' },
  { operationId: 'CasesController_list', status: '200', schema: 'CaseListResponse' },
  { operationId: 'CasesController_get', status: '200', schema: 'CaseSummary' },
  { operationId: 'AuditExplorerController_explore', status: '200', schema: 'AuditExplorerResponse' },
];

/** Human-readable descriptions for each shared error status. */
const ERROR_STATUS_DESCRIPTIONS: Record<string, string> = {
  '401': 'Authentication required or the session has expired (ApiErrorBody).',
  '403': 'The principal is not permitted to perform this action (ApiErrorBody).',
  '404': 'The resource does not exist, or its existence is hidden (ApiErrorBody).',
  '409': 'The request conflicts with the current state of the resource (ApiErrorBody).',
  '422': 'The request failed validation (ApiErrorBody).',
  '500': 'An unexpected internal error (ApiErrorBody).',
  '503': 'A security-critical dependency is unavailable; the request fails closed (ApiErrorBody).',
};

/**
 * The `DocumentBuilder` configuration: title, version, the single TLS-origin
 * server, the bearer security scheme, and the FRD operation groupings as tags.
 */
export function openApiConfig(): Omit<OpenAPIObject, 'paths'> {
  return new DocumentBuilder()
    .setTitle('JudicialSync Platform Core')
    .setVersion('1.0.0')
    .setDescription(
      'Platform Core API — Identity & Access, the shared Case & Docket model, the ' +
        'Audit trail, the Security baseline, and Configuration. Generated code-first ' +
        'from the running NestJS application; the committed contract is drift-checked in CI.',
    )
    .addServer('https://judicialsync.localhost:8443/api/v1', 'Single TLS origin (Compose)')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'opaque session token',
        description: 'The session token returned by POST /auth/login.',
      },
      'session',
    )
    .addTag('Identity & Access', 'Authentication, sessions, entitlements and grants (F00)')
    .addTag('Case & Docket Model', 'The shared case family and docket events (F01)')
    .addTag('Audit', 'The append-only audit trail and the Audit Explorer (F02)')
    .addTag('Security Baseline', 'Retention, disposition, key access and policy evaluation (F13)')
    .addTag('Configuration', 'The court configuration read path (F13/F03)')
    .build();
}

/**
 * Build the complete OpenAPI 3.1 document from the live application.
 *
 * @param app a Nest application (created via `NestFactory.create`, need not be
 *   listening) whose routes are walked to produce the paths.
 */
export function buildOpenApiDocument(app: INestApplication): OpenAPIObject {
  const document = SwaggerModule.createDocument(app, openApiConfig());

  // 1. Force OpenAPI 3.1 — §8.1/§6 require it and @nestjs/swagger@7 emits 3.0.
  document.openapi = '3.1.0';

  // 2. Register the shared error envelope and the UI-consumed response schemas…
  document.components = document.components ?? {};
  document.components.schemas = document.components.schemas ?? {};
  const schemas = document.components.schemas as Record<string, unknown>;
  schemas.ApiErrorBody = API_ERROR_BODY_SCHEMA;
  for (const [name, schema] of Object.entries(RESPONSE_SCHEMAS)) {
    schemas[name] = schema;
  }

  // …and bind each success response to the operation that returns it, matched
  // by operationId so a renamed handler loses its typed body rather than
  // keeping a stale one.
  for (const pathItem of Object.values(document.paths)) {
    if (pathItem === undefined || pathItem === null) {
      continue;
    }
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | { operationId?: string; responses?: Record<string, unknown> }
        | undefined;
      if (operation?.operationId === undefined) {
        continue;
      }
      const binding = OPERATION_RESPONSE_BINDINGS.find(
        (b) => b.operationId === operation.operationId,
      );
      if (binding === undefined) {
        continue;
      }
      operation.responses = operation.responses ?? {};
      operation.responses[binding.status] = {
        description: 'Success',
        content: {
          'application/json': {
            schema: { $ref: `#/components/schemas/${binding.schema}` },
          },
        },
      };
    }
  }

  // …and attach it as the error response on every operation that lacks one.
  for (const pathItem of Object.values(document.paths)) {
    if (pathItem === undefined || pathItem === null) {
      continue;
    }
    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
      const operation = (pathItem as Record<string, unknown>)[method] as
        | { responses?: Record<string, unknown> }
        | undefined;
      if (operation === undefined) {
        continue;
      }
      operation.responses = operation.responses ?? {};
      for (const status of SHARED_ERROR_STATUSES) {
        if (operation.responses[status] !== undefined) {
          continue;
        }
        operation.responses[status] = {
          description: ERROR_STATUS_DESCRIPTIONS[status],
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ApiErrorBody' },
            },
          },
        };
      }
    }
  }

  return document;
}
