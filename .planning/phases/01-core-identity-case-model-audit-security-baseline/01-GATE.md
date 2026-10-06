---
phase: 01
gate_status: passed_with_warnings
build_command: "npm run build"
test_command: "npm test"
last_updated: 2026-10-06T07:32:18Z
tests_disabled_during_fixes: none
shadowed_sources: 0
ungated_waves: [5]
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
  - wave: 6
    build: pass
    tests: pass
    fix_attempts: 0
  - wave: 7
    build: pass
    tests: pass
    fix_attempts: 0
  - wave: 8
    build: pass
    tests: pass
    fix_attempts: 0
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

## Wave 6

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3 — Hermetic suite: 14 suites / 210 tests pass. Live-stack e2e suites self-skip when Compose not up (run via test:* scripts). Build: API only; apps/web lands in wave 7.

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

PASS test/audit-canonical-parity.e2e-spec.ts
(node:270909) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
[31m[Nest] 270909  - [39m10/06/2026, 4:15:07 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
(node:270908) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
[31m[Nest] 270908  - [39m10/06/2026, 4:15:08 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 270909  - [39m10/06/2026, 4:15:09 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
PASS test/context-boot.e2e-spec.ts
PASS test/seed-idempotency.e2e-spec.ts
[31m[Nest] 270908  - [39m10/06/2026, 4:15:10 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
[31m[Nest] 270908  - [39m10/06/2026, 4:15:10 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 270909  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
[31m[Nest] 270909  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
PASS test/schema-grants.e2e-spec.ts
PASS test/retention-disposition.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/retention-disposition.e2e-spec.ts:111:17)

[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 270910  - [39m10/06/2026, 4:15:11 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
PASS test/config-read-path.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/config-read-path.e2e-spec.ts:81:17)

PASS test/cases-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/cases-api.e2e-spec.ts:85:17)

[31m[Nest] 270909  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
[31m[Nest] 270909  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
[31m[Nest] 270909  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
PASS test/guards-fail-closed.e2e-spec.ts
[31m[Nest] 270910  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (timed out after 250ms). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
PASS src/modules/policy/policy-contract.spec.ts
PASS test/designations-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/designations-api.e2e-spec.ts:54:17)

[31m[Nest] 270908  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
PASS src/modules/case-context/proceedings.service.spec.ts
[31m[Nest] 270908  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 270908  - [39m10/06/2026, 4:15:12 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
PASS test/audit-write.e2e-spec.ts (7.616 s)
PASS test/case-no-delete.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/case-no-delete.e2e-spec.ts:56:17)

A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 14 passed, 14 total
Tests:       210 passed, 210 total
Snapshots:   0 total
Time:        8.376 s, estimated 9 s
Ran all test suites.
```

## Wave 7

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3 — API + web both build (vite build green; SVG asset-ref warnings are cosmetic USWDS notes). Hermetic suite 14/210 pass. Web Playwright E2E is E2E-only — deferred to verify phase per gate rule.

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> @judicialsync/web@0.1.0 build
> tsc --noEmit && vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
WARNING: mixed-decls deprecation is obsolete. If you were previously silencing it, your code may now behave in unexpected ways.


../fonts/roboto-mono/roboto-mono-v5-latin-300.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-300.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-regular.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-700.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-700.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-300italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-300italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-700italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-700italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-light-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-light-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-regular-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-regular-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-bold-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-bold-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-lightitalic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-lightitalic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-italic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-italic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-bolditalic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-bolditalic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Light.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Light.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Regular.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Bold.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Bold.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-LightItalic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-LightItalic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Italic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-BoldItalic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-BoldItalic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/launch.svg referenced in ../img/usa-icons/launch.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/launch--white.svg referenced in ../img/usa-icons-bg/launch--white.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/remove.svg referenced in ../img/usa-icons/remove.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/add.svg referenced in ../img/usa-icons/add.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/check_circle.svg referenced in ../img/usa-icons/check_circle.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/warning.svg referenced in ../img/usa-icons/warning.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/error.svg referenced in ../img/usa-icons/error.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/info.svg referenced in ../img/usa-icons/info.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/error--white.svg referenced in ../img/usa-icons-bg/error--white.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/expand_more.svg referenced in ../img/usa-icons/expand_more.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/close.svg referenced in ../img/usa-icons/close.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/expand_less.svg referenced in ../img/usa-icons/expand_less.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/arrow_back.svg referenced in ../img/usa-icons/arrow_back.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_next.svg referenced in ../img/usa-icons/navigate_next.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/check--blue-60v.svg referenced in ../img/usa-icons-bg/check--blue-60v.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/hero.jpg referenced in ../img/hero.jpg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/search.svg referenced in ../img/usa-icons/search.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/checkbox-indeterminate.svg referenced in ../img/checkbox-indeterminate.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/checkbox-indeterminate-alt.svg referenced in ../img/checkbox-indeterminate-alt.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/correct8.svg referenced in ../img/correct8.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/correct8-alt.svg referenced in ../img/correct8-alt.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/unfold_more.svg referenced in ../img/usa-icons/unfold_more.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/calendar_today.svg referenced in ../img/usa-icons/calendar_today.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_far_before.svg referenced in ../img/usa-icons/navigate_far_before.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_before.svg referenced in ../img/usa-icons/navigate_before.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_far_next.svg referenced in ../img/usa-icons/navigate_far_next.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/loader.svg referenced in ../img/loader.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-pdf.svg referenced in ../img/file-pdf.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file.svg referenced in ../img/file.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-word.svg referenced in ../img/file-word.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-excel.svg referenced in ../img/file-excel.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-video.svg referenced in ../img/file-video.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime
[32m✓[39m 105 modules transformed.
rendering chunks...
computing gzip size...
[2mdist/[22m[32mindex.html                 [39m[1m[2m  0.41 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
[2mdist/[22m[2massets/[22m[35mindex-DzkfeZ78.css  [39m[1m[2m538.52 kB[22m[1m[22m[2m │ gzip:  60.72 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-606_bR86.js   [39m[1m[2m375.99 kB[22m[1m[22m[2m │ gzip: 115.29 kB[22m
[36m[vite-plugin-static-copy][39m [32mCopied 2 items.[39m
[32m✓ built in 8.50s[39m

> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

(node:460224) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
[31m[Nest] 460224  - [39m10/06/2026, 5:19:36 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
PASS test/seed-idempotency.e2e-spec.ts
(node:460225) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
[31m[Nest] 460225  - [39m10/06/2026, 5:19:36 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
PASS test/audit-canonical-parity.e2e-spec.ts
[31m[Nest] 460224  - [39m10/06/2026, 5:19:38 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
[31m[Nest] 460224  - [39m10/06/2026, 5:19:38 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 460225  - [39m10/06/2026, 5:19:38 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
PASS test/context-boot.e2e-spec.ts (5.235 s)
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
[31m[Nest] 460224  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
[31m[Nest] 460224  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 460224  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
PASS test/audit-write.e2e-spec.ts (7.06 s)
[31m[Nest] 460226  - [39m10/06/2026, 5:19:40 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (timed out after 250ms). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
PASS src/modules/policy/policy-contract.spec.ts
PASS test/case-no-delete.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/case-no-delete.e2e-spec.ts:56:17)

PASS test/designations-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/designations-api.e2e-spec.ts:54:17)

PASS test/schema-grants.e2e-spec.ts
PASS test/cases-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/cases-api.e2e-spec.ts:85:17)

[31m[Nest] 460224  - [39m10/06/2026, 5:19:41 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
PASS test/retention-disposition.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/retention-disposition.e2e-spec.ts:111:17)

[31m[Nest] 460224  - [39m10/06/2026, 5:19:41 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
[31m[Nest] 460224  - [39m10/06/2026, 5:19:41 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
PASS test/guards-fail-closed.e2e-spec.ts
PASS test/config-read-path.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/config-read-path.e2e-spec.ts:81:17)

PASS src/modules/case-context/proceedings.service.spec.ts
A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 14 passed, 14 total
Tests:       210 passed, 210 total
Snapshots:   0 total
Time:        8.379 s
Ran all test suites.
```

## Wave 8

- Build: `npm run build` → pass
- Tests: `npm test` → pass
- Fix attempts: 0/3 — Final wave. API + web build green; hermetic suite 14/210. Web Playwright E2E (32 E2E + 9 axe green per plan) is E2E-only — deferred to verify per gate rule.

### Gate output

```
> build
> npm run build --workspaces --if-present


> @judicialsync/api@0.1.0 build
> nest build


> @judicialsync/web@0.1.0 build
> tsc --noEmit && vite build

[36mvite v5.4.21 [32mbuilding for production...[36m[39m
transforming...
WARNING: mixed-decls deprecation is obsolete. If you were previously silencing it, your code may now behave in unexpected ways.

WARNING: mixed-decls deprecation is obsolete. If you were previously silencing it, your code may now behave in unexpected ways.


../fonts/roboto-mono/roboto-mono-v5-latin-300.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-300.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-regular.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-700.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-700.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-300italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-300italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/roboto-mono/roboto-mono-v5-latin-700italic.woff2 referenced in ../fonts/roboto-mono/roboto-mono-v5-latin-700italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-light-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-light-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-regular-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-regular-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-bold-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-bold-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-lightitalic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-lightitalic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-italic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-italic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/source-sans-pro/sourcesanspro-bolditalic-webfont.woff2 referenced in ../fonts/source-sans-pro/sourcesanspro-bolditalic-webfont.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Light.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Light.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Regular.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Regular.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Bold.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Bold.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-LightItalic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-LightItalic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-Italic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-Italic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../fonts/merriweather/Latin-Merriweather-BoldItalic.woff2 referenced in ../fonts/merriweather/Latin-Merriweather-BoldItalic.woff2 didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/launch.svg referenced in ../img/usa-icons/launch.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/launch--white.svg referenced in ../img/usa-icons-bg/launch--white.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/remove.svg referenced in ../img/usa-icons/remove.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/add.svg referenced in ../img/usa-icons/add.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/check_circle.svg referenced in ../img/usa-icons/check_circle.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/warning.svg referenced in ../img/usa-icons/warning.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/error.svg referenced in ../img/usa-icons/error.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/info.svg referenced in ../img/usa-icons/info.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/error--white.svg referenced in ../img/usa-icons-bg/error--white.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/expand_more.svg referenced in ../img/usa-icons/expand_more.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/close.svg referenced in ../img/usa-icons/close.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/expand_less.svg referenced in ../img/usa-icons/expand_less.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/arrow_back.svg referenced in ../img/usa-icons/arrow_back.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_next.svg referenced in ../img/usa-icons/navigate_next.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons-bg/check--blue-60v.svg referenced in ../img/usa-icons-bg/check--blue-60v.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/hero.jpg referenced in ../img/hero.jpg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/search.svg referenced in ../img/usa-icons/search.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/checkbox-indeterminate.svg referenced in ../img/checkbox-indeterminate.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/checkbox-indeterminate-alt.svg referenced in ../img/checkbox-indeterminate-alt.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/correct8.svg referenced in ../img/correct8.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/correct8-alt.svg referenced in ../img/correct8-alt.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/unfold_more.svg referenced in ../img/usa-icons/unfold_more.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/calendar_today.svg referenced in ../img/usa-icons/calendar_today.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_far_before.svg referenced in ../img/usa-icons/navigate_far_before.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_before.svg referenced in ../img/usa-icons/navigate_before.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/usa-icons/navigate_far_next.svg referenced in ../img/usa-icons/navigate_far_next.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/loader.svg referenced in ../img/loader.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-pdf.svg referenced in ../img/file-pdf.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file.svg referenced in ../img/file.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-word.svg referenced in ../img/file-word.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-excel.svg referenced in ../img/file-excel.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime

../img/file-video.svg referenced in ../img/file-video.svg didn't resolve at build time, it will remain unchanged to be resolved at runtime
[32m✓[39m 113 modules transformed.
rendering chunks...
computing gzip size...
[2mdist/[22m[32mindex.html                 [39m[1m[2m  0.41 kB[22m[1m[22m[2m │ gzip:   0.28 kB[22m
[2mdist/[22m[2massets/[22m[35mindex-Bow7QQO0.css  [39m[1m[2m539.06 kB[22m[1m[22m[2m │ gzip:  60.91 kB[22m
[2mdist/[22m[2massets/[22m[36mindex-BAYTDist.js   [39m[1m[2m411.40 kB[22m[1m[22m[2m │ gzip: 125.45 kB[22m
[36m[vite-plugin-static-copy][39m [32mCopied 2 items.[39m
[32m✓ built in 8.45s[39m

> test
> npm run test --workspaces --if-present


> @judicialsync/api@0.1.0 test
> jest --config jest.config.js

[31m[Nest] 794499  - [39m10/06/2026, 7:32:04 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
[31m[Nest] 794499  - [39m10/06/2026, 7:32:04 AM [31m  ERROR[39m [38;5;3m[withAudit] [39m[31mAudit write failed; domain transaction rolled back: 
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
(node:794498) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
PASS test/audit-outbox.e2e-spec.ts
[31m[Nest] 794498  - [39m10/06/2026, 7:32:04 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
(node:794497) Warning: NodeVersionSupportWarning: The AWS SDK for JavaScript (v3)
versions published after the first week of January 2027
will require node >=22. You are running node v20.20.2.

To continue receiving updates to AWS services, bug fixes,
and security updates please upgrade to node >=22.

More information can be found at: https://a.co/c895JFp
(Use `node --trace-warnings ...` to show where the warning was created)
[31m[Nest] 794497  - [39m10/06/2026, 7:32:04 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
[31m[Nest] 794498  - [39m10/06/2026, 7:32:06 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
PASS test/seed-idempotency.e2e-spec.ts
[31m[Nest] 794497  - [39m10/06/2026, 7:32:06 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
PASS test/context-boot.e2e-spec.ts
[31m[Nest] 794497  - [39m10/06/2026, 7:32:06 AM [31m  ERROR[39m [38;5;3m[AuthService] [39m[31mNo user with external_idp_subject 'system:unattributed' exists. Authentication failures for unknown subjects cannot be audited. Run the seed (apps/api/prisma/seed.ts, owned by plan 01-04).[39m
PASS test/audit-canonical-parity.e2e-spec.ts
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (transport error: TypeError: fetch failed). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA returned HTTP 500). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response was not JSON: SyntaxError: Unexpected token '<', "<html>not "... is not valid JSON). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (OPA response carried no boolean result.allow (bundle not loaded, or the decision document has drifted from policy/README.md)). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[ObjectStoreService] [39m[31mCould not ensure object-store bucket 'judicialsync-files' at boot: Could not load credentials from any providers. Uploads will fail until the store is reachable.[39m
[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[ServiceTokenGuard] [39m[31mINTERNAL_SERVICE_TOKEN is not configured; denying every call to POST /audit/events. Set it from the secrets manager — an unset secret must never mean "allow anyone".[39m
PASS test/schema-grants.e2e-spec.ts
PASS test/audit-write.e2e-spec.ts (6.994 s)
[31m[Nest] 794499  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[PdpClient] [39m[31mPDP evaluation failed (timed out after 250ms). Denying GET /api/v1/cases/x [resource.type=case, action=read]. Fail closed: the request is refused, never allowed.[39m
PASS src/modules/policy/policy-contract.spec.ts
PASS test/retention-disposition.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/retention-disposition.e2e-spec.ts:111:17)

[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
[31m[Nest] 794497  - [39m10/06/2026, 7:32:08 AM [31m  ERROR[39m [38;5;3m[AbacGuard] [39m[31mDENY (fail closed): GET  reached AbacGuard with no @Resource() descriptor. Handler: GuardProbeController.unmarkedRoute. Every protected route must declare exactly one of @Public(), @SelfScoped() or @Resource({type, action}) — and the (type, action) pair needs a row in policy/judicialsync/authz/abac.rego's action_entitlement_map (plan 01-02 owns that file).[39m
PASS test/guards-fail-closed.e2e-spec.ts
PASS test/designations-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/designations-api.e2e-spec.ts:54:17)

PASS test/case-no-delete.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/case-no-delete.e2e-spec.ts:56:17)

PASS src/modules/case-context/proceedings.service.spec.ts
PASS test/config-read-path.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/config-read-path.e2e-spec.ts:81:17)

PASS test/cases-api.e2e-spec.ts
  ● Console

    console.warn
      SKIPPING: the Compose stack is not reachable at https://judicialsync.localhost:8443/auth/realms/judicialsync. Run `docker compose up -d` to exercise these tests.

    [0m [90m 219 |[39m   [36mif[39m ([36mawait[39m stackAvailable()) [36mreturn[39m [36mtrue[39m[33m;[39m
     [90m 220 |[39m   [90m// eslint-disable-next-line no-console[39m
    [31m[1m>[22m[39m[90m 221 |[39m   console[33m.[39mwarn(
     [90m     |[39m           [31m[1m^[22m[39m
     [90m 222 |[39m     [32m`SKIPPING: the Compose stack is not reachable at ${ISSUER}. `[39m [33m+[39m
     [90m 223 |[39m       [32m`Run \`docker compose up -d\` to exercise these tests.`[39m[33m,[39m
     [90m 224 |[39m   )[33m;[39m[0m

      at requireStack (test/auth-harness.ts:221:11)
      at Object.<anonymous> (test/cases-api.e2e-spec.ts:85:17)

A worker process has failed to exit gracefully and has been force exited. This is likely caused by tests leaking due to improper teardown. Try running with --detectOpenHandles to find leaks. Active timers can also cause this, ensure that .unref() was called on them.

Test Suites: 14 passed, 14 total
Tests:       210 passed, 210 total
Snapshots:   0 total
Time:        8.185 s
Ran all test suites.
```

