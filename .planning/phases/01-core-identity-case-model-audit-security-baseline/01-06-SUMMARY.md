---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 06
subsystem: auth
tags: [oidc, openid-client, keycloak, mfa, totp, jwt, jose, redis, sessions, rbac, abac, entitlements]

requires:
  - phase: 01-01
    provides: SessionAuthGuard registration as APP_GUARD, @Public()/@SelfScoped() decorators, Principal types, ApiException envelope, openid-client/ioredis/otplib dependencies
  - phase: 01-03
    provides: platform.sessions / users / user_roles / scope_assignments / entitlement_grants tables, append-only grants, PrismaService
  - phase: 01-04
    provides: Keycloak realm with unbypassable TOTP, seeded users + TOTP secrets, seeded entitlement_grants, system:unattributed actor, rule_package_versions.config_snapshot.session
  - phase: 01-05
    provides: AuditService.record, withAudit/recordStandaloneAudit transactional outbox
provides:
  - Real OIDC Authorization Code + PKCE exchange against the court IdP behind a protocol-agnostic IdpProvider seam
  - MFA enforcement derived solely from signed acr/amr claims, with no override of any kind
  - Session issuance, rotating hashed refresh tokens, reuse detection, and per-request revocation checking
  - A working SessionAuthGuard that attaches the resolved Principal, replacing plan 01-01's deny-all stub
  - EntitlementResolverService producing roles + scopes + grant-only entitlements, Redis-cached for the configured window
  - /api/v1/auth/{authorize-url,login,mfa-challenge,refresh,logout,entitlements}
affects: [01-07, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13, 01-14]

tech-stack:
  added: [jose@^4.15.9]
  patterns:
    - "IdpProvider seam: protocol is a binding choice in identity.module.ts, never a caller concern"
    - "Per-request revocation read in SessionService.validate — a signed token is never self-sufficient evidence"
    - "Entitlements read from entitlement_grants exclusively; no role-to-entitlement mapping exists anywhere"
    - "invalidate() + revokeAllForUser() are a documented pair; either alone leaves a window"
    - "Integration tests drive the real Keycloak with real TOTP; a mocked IdP would confirm the implementation's own assumptions"

key-files:
  created:
    - apps/api/src/modules/identity/idp/idp-provider.interface.ts
    - apps/api/src/modules/identity/idp/oidc.provider.ts
    - apps/api/src/modules/identity/session.service.ts
    - apps/api/src/modules/identity/session-config.service.ts
    - apps/api/src/modules/identity/entitlement-resolver.service.ts
    - apps/api/src/modules/identity/auth.service.ts
    - apps/api/src/modules/identity/auth.controller.ts
    - apps/api/src/modules/identity/dto/auth.dto.ts
    - apps/api/src/modules/identity/redis.provider.ts
    - apps/api/test/auth-login.e2e-spec.ts
    - apps/api/test/auth-session.e2e-spec.ts
    - apps/api/test/auth-entitlements.e2e-spec.ts
    - apps/api/test/auth-harness.ts
    - apps/api/test/auth-setup.ts
    - apps/api/test/auth-trust-ca.ts
    - apps/api/jest.auth.config.js
    - docs/IDP-INTEGRATION.md
  modified:
    - apps/api/src/common/guards/session-auth.guard.ts
    - apps/api/src/modules/identity/identity.module.ts
    - apps/api/test/guards-fail-closed.e2e-spec.ts
    - apps/api/jest.config.js
    - apps/api/package.json

key-decisions:
  - "ACR aliases are resolved through acr.loa.map, not parsed as numbers: the realm emits acr:'otp' with no amr, so the planned Number(acr)>=2 formula rejected every genuine MFA login"
  - "An ACR value naming an RFC 8176 second factor is itself evidence of MFA, because acr.loa.map is not published in discovery metadata — scoped narrowly so unknown aliases still deny"
  - "All redirect query parameters are forwarded to the token exchange: Keycloak advertises authorization_response_iss_parameter_supported, so RFC 9207 iss validation is mandatory"
  - "IdentityModule is @Global() so the APP_GUARD in app.module.ts resolves SessionService without editing that single-owner file"
  - "ioredis enableOfflineQueue stays true: false rejected commands issued before socket-ready, failing the first login after every boot and then working forever after"
  - "Auth integration suites run under their own jest.auth.config.js with a worker-level CA install, because NODE_EXTRA_CA_CERTS is read only at process start"
  - "/auth/mfa-challenge returns 422 AUTH_MFA_NOT_REQUIRED_AT_THIS_STEP rather than implementing an application-side OTP verifier, which would be the second authentication path CONTEXT rejected"

patterns-established:
  - "Fail closed on IdP outage: discovery retries in the background and every provider method throws 503 until it succeeds"
  - "Undifferentiated 401 AUTH_SESSION_EXPIRED for every authentication failure mode, so the error channel is not a reconnaissance oracle"
  - "Refresh token reuse revokes all sessions for the user and emits an access_attempt audit event"
  - "Unattributable authentication failures are audited against the seeded system:unattributed actor, never dropped"

duration: 97 min
completed: 2026-10-05
---

# Phase 01 Plan 06: Identity, Sessions and Entitlement Resolution Summary

**Real OIDC Authorization Code + PKCE against the Keycloak court IdP with TOTP MFA derived from signed `acr`/`amr` claims, rotating hashed refresh tokens with per-request revocation, and a `Principal` whose entitlements come from `entitlement_grants` alone.**

## Performance

- **Duration:** 97 min
- **Tasks:** 3
- **Files created/modified:** 23
- **Tests:** 134 hermetic (unchanged, all green) + 38 new integration tests against the live stack

## Accomplishments

- **One way to obtain a session.** `OidcProvider` performs a genuine Authorization Code + PKCE (`S256`) exchange with full ID-token validation, `state`/`nonce` held in Redis and consumed atomically via `GETDEL`. There is no second login route, no stub, and no bypass flag.
- **MFA that cannot be switched off.** `mfa_satisfied` is computed only from signed authentication-context claims. A test sets `DISABLE_MFA`, `MFA_ENABLED=false`, `AUTH_RELAXED` and `NODE_ENV=development` and asserts the verdict does not move.
- **Revocation that takes effect on the next request.** `SessionService.validate` re-reads `platform.sessions` every time. Logout and `revokeAllForUser` are proven to kill the *same, still-unexpired* access token immediately.
- **Refresh rotation with compromise handling.** Tokens are stored SHA-256 hashed, compared with `timingSafeEqual`, and replay of a spent token revokes every session for that user plus writes an audit event.
- **The hard constraint is now falsifiable.** `jury_admin` holds a role and zero entitlements, proven at both the service and API level — plus a stronger companion test asserting that for *every* seeded user the resolved set equals their grant rows exactly, so a bundle attached to any role fails the suite.

## Task Commits

1. **Task 1: IdP abstraction and real OIDC exchange** — `fc0bd7e` (feat)
2. **Task 2: Sessions, rotation, revocation, real guard** — `d69c443` (feat)
3. **Task 3: Entitlement resolution from grants only** — `98a6165` (feat)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] The planned MFA formula rejects every genuine MFA login**
- **Found during:** Task 1, by probing the running realm before writing the derivation
- **Issue:** The plan specifies `mfa_satisfied = Number(claims.acr) >= 2 || amr.includes('otp')`. The real browser flow emits `acr: "otp"` — the realm's LoA **alias** — and **no `amr` claim at all**. `Number("otp")` is `NaN`, so `NaN >= 2` is `false` and every correct password+TOTP sign-in would have been rejected with `AUTH_MFA_FAILED`.
- **Fix:** `acr` is resolved through the realm's `acr.loa.map` (`{"otp": 2}`) rather than parsed as a number.
- **Why care, given it fails closed:** the bug denies real users rather than admitting forged assertions — loud, and survivable. The danger is the obvious repair under deadline pressure ("treat any non-empty `acr` as MFA"), which inverts that and silently accepts the `acr: "1"` direct-grant token. Nine cases pin both ends, including one asserting the naive formula's `false`.
- **Commit:** `fc0bd7e`

**2. [Rule 1 - Bug] RFC 9207 `iss` parameter dropped, failing every exchange**
- **Found during:** Task 2, first real end-to-end login
- **Issue:** The realm advertises `authorization_response_iss_parameter_supported: true`, so `openid-client` requires the `iss` callback parameter. Passing only `{code, state}` produced `RPError: iss missing from the response` — surfacing as a 401 that reads exactly like a bad credential.
- **Fix:** all redirect query parameters are forwarded to `client.callback()`, spread first so `code`/`state` stay authoritative.
- **Commit:** `d69c443`

**3. [Rule 1 - Bug] `acr.loa.map` is not published in discovery**
- **Found during:** Task 2, after the `iss` fix exposed the next layer
- **Issue:** Discovery publishes `acr_values_supported: ["otp","0","2"]` — aliases and levels with nothing linking them. The `acr.loa.map` is absent, so a deployment supplying no explicit `OIDC_ACR_LOA_MAP` cannot score the alias and rejects every MFA login.
- **Fix:** an alias that scores to no level but names a recognised RFC 8176 second factor is read as evidence of that method. Deliberately narrow — numerics are scored first, and an unrecognised alias like `"gold"` still denies.
- **Commit:** `d69c443`

**4. [Rule 1 - Bug] `enableOfflineQueue: false` broke the first login after every boot**
- **Found during:** Task 2
- **Issue:** ioredis rejected commands issued before the socket reached `ready`, so `beginAuthorization` could not persist its state and the callback found none. The first login after each boot failed, then worked forever after — the shape of bug that gets dismissed as a flake.
- **Fix:** `enableOfflineQueue: true`, with `maxRetriesPerRequest` still bounding a genuinely dead Redis so the fail-closed posture is unchanged.
- **Commit:** `d69c443`

**5. [Rule 3 - Blocking] All 14 auth tests skipped while reporting green**
- **Found during:** Task 2
- **Issue:** `globalSetup` set `NODE_EXTRA_CA_CERTS`, but Node reads it only at process start, so worker processes never trusted the Caddy CA. Every TLS call failed, `requireStack()` concluded the stack was down, and the suite passed in 1 ms having tested nothing.
- **Fix:** a `setupFiles` entry installs the CA into each worker's trust store; `requireStack()` always states its reason for skipping.
- **Why it mattered most:** a security suite that silently tests nothing is worse than one that fails, because nothing downstream distinguishes it from a real pass.
- **Commit:** `d69c443`

**6. [Rule 1 - Bug] Suites passed alone, failed together (TOTP reuse)**
- **Found during:** Task 3
- **Issue:** Keycloak enforces one-time use of a TOTP code (verified directly: first use 200, second `invalid_grant`). Jest resets module state per test file while the shared IdP does not, so four logins were rejected for presenting a code a sibling suite had spent.
- **Fix:** dedup state moved to `globalThis` (worker scope, matching the shared IdP) plus one bounded retry when Keycloak re-renders the OTP form.
- **Commit:** `98a6165`

**7. [Rule 3 - Blocking] Cache-TTL test denied by the configuration grant posture**
- **Found during:** Task 3
- **Issue:** The test wrote `rule_package_versions` as `app_rw` and got `permission denied` — plan 01-03's posture working correctly (the application reads configuration and must not author it).
- **Fix:** the test uses the `app_dba` administrative connection for that write, exactly as `prisma/seed.ts` does.
- **Commit:** `98a6165`

**8. [Rule 3 - Blocking] `guards-fail-closed.e2e-spec.ts` could not resolve the new dependency**
- **Found during:** Task 2
- **Issue:** Its minimal test module has no `SessionService`, which `SessionAuthGuard` now requires.
- **Fix:** a **rejecting** test double was added. Deliberately rejecting rather than permissive — a permissive double would make every assertion in that file pass for the wrong reason, and the file's entire purpose is to fail loudly if the chain stops denying. All 10 of its tests still pass.
- **Commit:** `d69c443`

### Documented, not silently accepted

Two of the plan's `<verify>` greps cannot pass as written and were **not** worked around by weakening the code:

- `! grep -rni 'saml' apps/api/src/modules/identity/` conflicts with the plan's own `<action>`, which asks for a comment reading *"'saml' is deliberately absent"*. The explanation moved to `docs/IDP-INTEGRATION.md` §6; no SAML code exists.
- `! grep -rniE 'mfa.?bypass|dev.?login' apps/api/src/` **already fails at HEAD** — it matches explanatory prose in plan 01-01's `self-scoped.decorator.ts` and `identity.module.ts`, written before this plan. My own files are clean of those phrases. The real standing gate is CI's case-sensitive identifier grep (`BYPASS|DEV_LOGIN|SKIP_AUTH|DISABLE_MFA`), which passes.

---

**Total deviations:** 8 auto-fixed (5 bugs, 3 blocking). **Impact:** five were latent defects in the authentication path that only a real-IdP test could surface; none widened scope.

## Issues Encountered

The plan's `<verify>` blocks run `docker compose down` at the end of each task. That was not executed — the stack was already healthy and is shared with the orchestrator; tearing it down between tasks would have cost ~10 minutes per cycle for no verification value. All suites were run against the live stack instead.

## Known Stubs

**None.** One comment in `entitlement-resolver.service.ts` describes `session_id` as a placeholder; that is a documented design note (the cache is per-user, so `SessionService.validate` overwrites it with the real session id), not unimplemented behaviour.

`/auth/mfa-challenge` returning 422 is specified behaviour, not a stub: Keycloak owns the OTP form, and implementing an application-side verifier would create the second authentication path CONTEXT rejected. Documented in `docs/IDP-INTEGRATION.md` §5.

## Verification

| Gate | Result |
|---|---|
| `npx tsc --noEmit -p apps/api/tsconfig.json` | PASS |
| `npm run build` | PASS |
| `npm test` (hermetic, 7 suites) | 134/134 PASS |
| `npm run test:auth` (live stack, 3 suites) | 38/38 PASS |
| `npx eslint` over `src/` and `test/` | 0 problems |
| CI `no-auth-bypass` grep | PASS |
| No TLS verification bypass anywhere in `apps/api/src/` | PASS |
| All 5 plan integration contracts | CONTRACT_OK |

## Next Phase Readiness

- **Plan 01-07 (PDP guard)** can consume `request.principal`; `AbacGuard` and `modules/policy/**` were untouched as required.
- **Plan 01-08 (grant workflow)** must call `EntitlementResolverService.invalidate(userId)` **and** `SessionService.revokeAllForUser(userId)` on every grant, revoke, role assignment and scope change. `revokeAllForUser` already calls `invalidate` internally, so the safe path is the short one. `AuthService.revokeAllForUser(userId, actorId, reason)` wraps both with an audit event.
- **Plan 01-13 (frontend)** starts the flow at `GET /api/v1/auth/authorize-url` and must POST back `identity_assertion`, `state` **and** `callback_params` — the last is required for RFC 9207 `iss` validation.
- **New concern for later plans:** `SESSION_TOKEN_SECRET` is not in `.env.example` (owned by 01-01, unmodifiable here). Unset, each process generates an ephemeral signing key, so sessions do not survive a restart or span instances. Logged loudly at boot. Recorded below as ASM-10.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-05*

## Self-Check: PASSED

- All 8 key files verified present on disk.
- All 3 task commits verified in git history (`fc0bd7e`, `d69c443`, `98a6165`).
- Build check: `npm run build` → exit 0.
- `## Known Stubs` section present; no blocking stubs.
