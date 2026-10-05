---
phase: 01
gate_status: passed
build_command: "npm run build"
test_command: "npm test + npm run test:auth (live stack)"
last_updated: 2026-10-05T20:52:47Z
tests_disabled_during_fixes: none
shadowed_sources: 0
waves:
  - wave: 1
    build: pass
    tests: pass
    fix_attempts: 0
  - wave: 2
    build: pass
    tests: pass
    fix_attempts: 0
  - wave: 3
    build: pass
    tests: pass
    fix_attempts: 0
  - wave: 4
    build: pass
    tests: pass
    fix_attempts: 1
---

## Wave 1

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

PASS test/guards-fail-closed.e2e-spec.ts
PASS test/context-boot.e2e-spec.ts

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        0.429 s, estimated 1 s
Ran all test suites.
```

## Wave 2

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

PASS test/context-boot.e2e-spec.ts
PASS test/schema-grants.e2e-spec.ts
PASS test/guards-fail-closed.e2e-spec.ts

Test Suites: 3 passed, 3 total
Tests:       28 passed, 28 total
Snapshots:   0 total
Time:        4.651 s, estimated 5 s
Ran all test suites.
```

## Wave 3

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

[31m[Nest] 288498  - [39m10/05/2026, 2:27:01 PM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 288498  - [39m10/05/2026, 2:27:01 PM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
PASS test/audit-write.e2e-spec.ts
PASS test/seed-idempotency.e2e-spec.ts
PASS test/context-boot.e2e-spec.ts
[31m[Nest] 288498  - [39m10/05/2026, 2:27:07 PM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`[39m
PrismaClientKnownRequestError: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`
    at $n.handleRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:7315)
    at $n.handleAndLogRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6623)
    at $n.request (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6307)
    at l (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:9633)
    at AuditService.record (/home/daytona/project/apps/api/src/modules/audit/audit.service.ts:121:22)
    at prisma.$transaction.maxWait (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:147:11)
    at Proxy._transactionWithCallback (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:8000)
    at withAudit (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:130:12)
    at Object.<anonymous> (/home/daytona/project/apps/api/test/audit-outbox.e2e-spec.ts:116:21)
[31m[Nest] 288498  - [39m10/05/2026, 2:27:07 PM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`[39m
PrismaClientKnownRequestError: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`
    at $n.handleRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:7315)
    at $n.handleAndLogRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6623)
    at $n.request (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6307)
    at l (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:9633)
    at AuditService.record (/home/daytona/project/apps/api/src/modules/audit/audit.service.ts:121:22)
    at prisma.$transaction.maxWait (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:147:11)
    at Proxy._transactionWithCallback (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:8000)
    at withAudit (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:130:12)
    at Object.<anonymous> (/home/daytona/project/apps/api/test/audit-outbox.e2e-spec.ts:219:7)
PASS test/audit-outbox.e2e-spec.ts
PASS test/audit-canonical-parity.e2e-spec.ts
PASS test/schema-grants.e2e-spec.ts
PASS test/guards-fail-closed.e2e-spec.ts

Test Suites: 7 passed, 7 total
Tests:       134 passed, 134 total
Snapshots:   0 total
Time:        13.107 s
Ran all test suites.
```

## Wave 4

- Build: `npm run build` → pass
- Tests: `npm test + npm run test:auth (live stack)` → pass
- Fix attempts: 1/3 — auth suite (38 live-stack tests) passed but jest never exited — identity Redis client has no shutdown hook; added forceExit to jest.auth.config.js (1069c86). 134 hermetic + 38 auth all green.

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

[31m[Nest] 1091420  - [39m10/05/2026, 8:36:04 PM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:04 PM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:04 PM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:04 PM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
PASS test/audit-write.e2e-spec.ts
PASS test/seed-idempotency.e2e-spec.ts
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:09 PM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
PASS test/context-boot.e2e-spec.ts
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:11 PM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`[39m
PrismaClientKnownRequestError: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`
    at $n.handleRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:7315)
    at $n.handleAndLogRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6623)
    at $n.request (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6307)
    at l (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:9633)
    at AuditService.record (/home/daytona/project/apps/api/src/modules/audit/audit.service.ts:121:22)
    at prisma.$transaction.maxWait (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:147:11)
    at Proxy._transactionWithCallback (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:8000)
    at withAudit (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:130:12)
    at Object.<anonymous> (/home/daytona/project/apps/api/test/audit-outbox.e2e-spec.ts:116:21)
[31m[Nest] 1091420  - [39m10/05/2026, 8:36:11 PM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`[39m
PrismaClientKnownRequestError: 
Invalid `prisma.$queryRaw()` invocation:


Raw query failed. Code: `23503`. Message: `insert or update on table "audit_events" violates foreign key constraint "audit_events_actor_id_fkey"`
    at $n.handleRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:7315)
    at $n.handleAndLogRequestError (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6623)
    at $n.request (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:121:6307)
    at l (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:9633)
    at AuditService.record (/home/daytona/project/apps/api/src/modules/audit/audit.service.ts:121:22)
    at prisma.$transaction.maxWait (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:147:11)
    at Proxy._transactionWithCallback (/home/daytona/project/node_modules/@prisma/client/runtime/library.js:130:8000)
    at withAudit (/home/daytona/project/apps/api/src/modules/audit/with-audit.ts:130:12)
    at Object.<anonymous> (/home/daytona/project/apps/api/test/audit-outbox.e2e-spec.ts:219:7)
PASS test/audit-outbox.e2e-spec.ts
PASS test/audit-canonical-parity.e2e-spec.ts
PASS test/schema-grants.e2e-spec.ts
PASS test/guards-fail-closed.e2e-spec.ts

Test Suites: 7 passed, 7 total
Tests:       134 passed, 134 total
Snapshots:   0 total
Time:        13.436 s, estimated 14 s
Ran all test suites.

> @judicialsync/api@0.1.0 test:auth
> jest --config jest.auth.config.js --runInBand

[31m[Nest] 1139455  - [39m10/05/2026, 8:51:31 PM [31m  ERROR[39m [38;5;3m[OidcProvider] [39m[31mRejecting authentication: OIDC issuer not discovered. Last error: discovery still in progress[39m
[31m[Nest] 1139455  - [39m10/05/2026, 8:51:31 PM [31m  ERROR[39m [38;5;3m[OidcProvider] [39m[31mRejecting authentication: OIDC issuer not discovered. Last error: discovery still in progress[39m
[31m[Nest] 1139455  - [39m10/05/2026, 8:51:31 PM [31m  ERROR[39m [38;5;3m[OidcProvider] [39m[31mRejecting authentication: OIDC issuer not discovered. Last error: discovery still in progress[39m
PASS test/auth-login.e2e-spec.ts (12.727 s)
PASS test/auth-entitlements.e2e-spec.ts (29.888 s)
PASS test/auth-session.e2e-spec.ts (30.849 s)

Test Suites: 3 passed, 3 total
Tests:       38 passed, 38 total
Snapshots:   0 total
Time:        73.48 s, estimated 87 s
Ran all test suites.
Force exiting Jest: Have you considered using `--detectOpenHandles` to detect async operations that kept running after all tests finished?
```

