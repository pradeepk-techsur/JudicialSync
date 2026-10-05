---
phase: 01-core-identity-case-model-audit-security-baseline
plan: 04
subsystem: infra
tags: [docker-compose, caddy, tls, keycloak, oidc, totp, mfa, prisma, seed, minio, clamav, opa, postgres]

requires:
  - phase: 01-01
    provides: npm-workspaces monorepo, NestJS API at apps/api, /api/v1/health, .env.example contract, db:migrate and db:seed scripts
  - phase: 01-02
    provides: OPA Rego policy bundle at policy/judicialsync/authz and its action_entitlement_map
  - phase: 01-03
    provides: platform schema (28 tables), the three migrations, app_rw/app_dba roles in infra/db/init/01-roles.sql, append-only grant posture, startPlatformDb() test harness
provides:
  - A runnable eight-service stack reachable from a clean clone with `docker compose up` — every service health-checked, every image pinned
  - One TLS origin (`https://judicialsync.localhost:8443`) that makes the OIDC issuer byte-identical for the browser and for the API container, verified with certificate validation ON inside the container
  - A Keycloak realm acting as the court IdP with one user per role and genuinely unbypassable TOTP MFA
  - An idempotent, re-runnable seed producing a scenario-complete starting state every later phase inherits
  - SEED_IDS — stable, exported identifiers for every seeded row, so later phases reference fixtures instead of querying for them
  - infra/db/init/02-extensions.sql — pgcrypto pinned to `public`, removing a connection-string-dependent schema placement
  - scripts/stack-smoke.sh — the wiring check `docker compose ps` cannot make
affects: [01-05, 01-06, 01-07, 01-08, 01-09, 01-10, 01-11, 01-12, 01-13, 01-14, 01-15]

tech-stack:
  added:
    - "Docker Compose (the Phase 1 deployment target)"
    - "Caddy 2.8 (TLS termination, internal CA)"
    - "Keycloak 24.0.5 (court IdP, TOTP MFA)"
    - "MinIO (chainguard build, digest-pinned) with SSE-S3"
    - "ClamAV 1.4.3 (signature-carrying tag)"
    - "Redis 7.2, OPA 0.64.1-static, PostgreSQL 15.7"
  patterns:
    - "Single TLS origin with a Compose network alias, so one hostname resolves to the proxy inside the network and to loopback in the browser — the issuer cannot differ between the two sides"
    - "The API trusts Caddy's internal CA via NODE_EXTRA_CA_CERTS; NODE_TLS_REJECT_UNAUTHORIZED is never set, and the container refuses to start if the CA copy fails"
    - "Only the proxy publishes a host port, making 'no plaintext path' structural rather than asserted"
    - "Seed writes are upserts on stable SEED_IDS UUIDs; the three append-only-except-revocation tables carry an EMPTY update:{} so the second boot cannot raise 42501"
    - "The seed opens two connections — app_rw for operational data, app_dba for the four configuration tables app_rw holds SELECT-only on"
    - "Security claims are established by falsification (try to break them) rather than by reading configuration back"

key-files:
  created:
    - docker-compose.yml
    - Dockerfile
    - .dockerignore
    - Caddyfile
    - .env
    - infra/keycloak/realm-judicialsync.json
    - infra/db/init/02-extensions.sql
    - scripts/ensure-hosts.sh
    - scripts/stack-smoke.sh
    - apps/api/prisma/seed.ts
    - apps/api/prisma/seed/ids.ts
    - apps/api/prisma/seed/keycloak.ts
    - apps/api/prisma/seed/courts.ts
    - apps/api/prisma/seed/identity.ts
    - apps/api/prisma/seed/configuration.ts
    - apps/api/test/seed-idempotency.e2e-spec.ts
    - docs/SEED-CREDENTIALS.md
  modified:
    - README.md

key-decisions:
  - "KC_HOSTNAME_URL, not KC_HOSTNAME: the two options have different grammars, and passing a URL to the latter silently advertises an issuer of https://https//.../auth/auth/realms/... that every client rejects"
  - "MFA is enforced by conditioning OTP on Level of Authentication 2, not by copying the built-in browser flow: the built-in conditions on 'user configured', so a user without an OTP credential skips MFA entirely"
  - "The seed uses two database connections because the configuration tables are SELECT-only to app_rw by design; widening the grant would let the running application rewrite the designation→entitlement map the policy engine reads"
  - "pgcrypto is created in `public` at cluster init, because CREATE EXTENSION with no SCHEMA clause lands it wherever the creating session's search_path points — making its location a property of the connection string"
  - "ClamAV uses the signature-carrying tag `1.4.3`, not `_base`: the plan had the convention inverted, and `_base` ships an empty signature directory requiring network access"
  - "MinIO comes from chainguard, digest-pinned: minio/minio was withdrawn from Docker Hub and quay.io now requires authentication"
  - "dns_search: ['.'] on every service, because the sandbox host's ndots:5 and cluster.local search list break short-name resolution inside the Compose network"

patterns-established:
  - "Falsification over inspection: every security claim in this plan was tested by trying to violate it, and the attempts are recorded next to the claim"
  - "Keycloak realm import constraints are documented inline at the point they bind, because each one costs a non-obvious debugging session to rediscover"
  - "Later phases import SEED_IDS rather than querying fixtures by business key"

duration: 95 min
completed: 2026-10-05
---

# Phase 01 Plan 04: Runnable Stack, Court IdP & Idempotent Seed Summary

**Eight health-checked services behind one TLS origin whose OIDC issuer is byte-identical from the browser and from inside the API container, a Keycloak realm with TOTP MFA that survived four distinct attempts to bypass it, and a seed that leaves the database in the same state on the fiftieth boot as on the first.**

## Performance

- **Duration:** 95 min
- **Tasks:** 3
- **Files created:** 17 · **modified:** 1
- **Commits:** 3 task commits + 1 metadata

## Accomplishments

- **A clean clone reaches a working system.** `docker compose up` brings `db`, `redis`, `opa`, `keycloak`, `clamav`, `minio`, `proxy` and `api` to `healthy`, with the API answering over TLS and the database populated. Verified repeatedly from `docker compose down -v`.
- **The hardest integration detail in the phase is solved and proven.** The OIDC discovery document reports `https://judicialsync.localhost:8443/auth/realms/judicialsync` as its issuer, and that exact string is fetched successfully **from inside the API container with certificate verification ON** — not with verification disabled, and not via a different internal URL.
- **MFA is genuinely unbypassable, established by attacking it.** Password-only authentication is rejected for all ten users; a user with *no* OTP credential is forced into enrolment rather than admitted; and requesting a lower `acr_values` does not skip the OTP form.
- **The seed is idempotent against the live stack**, not only against a test container: `docker compose restart api` replays `migrate → seed` and every row count is unchanged.
- **Three real defects were found and fixed** that would each have surfaced later as a confusing runtime failure — a cross-plan migration conflict, a connection-string-dependent extension schema, and host-inherited DNS settings breaking service discovery.

## Task Commits

1. **Task 1: Compose the full stack behind a single TLS origin** — `78afee4` (feat)
2. **Task 2: Keycloak realm with real TOTP MFA, one user per role** — `fce1598` (feat)
3. **Task 3: The idempotent, scenario-complete seed** — `2471f2b` (feat)

## Files Created/Modified

| File | What it does |
|---|---|
| `docker-compose.yml` | Eight services, every image pinned, every service health-checked; only `proxy` publishes a port |
| `Caddyfile` | TLS terminated once; routes `/auth` and `/api`; the header explains why one origin is non-negotiable |
| `Dockerfile` | Multi-stage; devDependencies kept for the build; non-root at runtime; openssl in **both** stages |
| `.dockerignore` | Keeps `.env` and `.git` out of image layers rather than trusting no one COPYs them |
| `.env` | Local values for the `.env.example` contract (gitignored) |
| `infra/keycloak/realm-judicialsync.json` | The court IdP realm: 10 users, TOTP, LoA-2 browser flow, audience mapper |
| `infra/db/init/02-extensions.sql` | pgcrypto pinned to `public` at cluster init |
| `scripts/ensure-hosts.sh` | Idempotently maps `judicialsync.localhost` where the resolver does not |
| `scripts/stack-smoke.sh` | Four checks, including the issuer-from-inside-the-container one |
| `apps/api/prisma/seed.ts` | Entry point; the two-connection split and the dependency order |
| `apps/api/prisma/seed/ids.ts` | `SEED_IDS` — stable identifiers later phases import |
| `apps/api/prisma/seed/keycloak.ts` | Resolves each user's `sub` from the admin API; fails loudly rather than inventing one |
| `apps/api/prisma/seed/courts.ts` | Case model, split so designations run after identity |
| `apps/api/prisma/seed/identity.ts` | Roles, users, grants — and the append-only constraint that shapes them |
| `apps/api/prisma/seed/configuration.ts` | Rule packages, security policies, retention schedules |
| `apps/api/test/seed-idempotency.e2e-spec.ts` | 17 assertions; both passes as `app_rw`, `current_user` proven |
| `docs/SEED-CREDENTIALS.md` | Every credential under a local-dev-only warning, plus how MFA is enforced |
| `README.md` | Quick start, what is running, why one origin, how to sign in |

## Decisions Made

Beyond the plan's specification, five judgement calls are worth flagging.

**1. `KC_HOSTNAME_URL`, not `KC_HOSTNAME`.** The plan specified `KC_HOSTNAME: https://judicialsync.localhost:8443/auth`. In Keycloak 24 those are different options with different grammars — `--hostname` takes a bare hostname, `--hostname-url` takes a full base URL. Passing a URL to the former does not error; Keycloak concatenates it with the scheme and relative path it derives separately and advertises `https://https//judicialsync.localhost:8443/auth/auth/realms/master`. Every client then rejects every token for an `iss` mismatch whose cause is nowhere near the token. This is precisely the failure the plan set out to prevent, reintroduced by the configuration key meant to prevent it.

**2. MFA is enforced through Level of Authentication, not by promoting the built-in OTP step.** The plan said to copy the built-in `browser` flow and make the OTP form `REQUIRED` rather than `CONDITIONAL`. That reading is understandable but the built-in flow's condition is `Condition - user configured` — meaning a user *without* an OTP credential skips MFA entirely. Making the form unconditionally `REQUIRED` would work for the seeded users and leave the hole open for anyone added later. The realm instead conditions OTP on LoA 2 with `acr.loa.map {"otp":2}`, and I verified a credential-less user is forced into enrolment rather than admitted. `CONDITIONAL` here is not a weakening: the condition is "was LoA 2 requested", and a client requesting *less* still gets the OTP form.

**3. The seed needs two connections, and that is a security property.** The plan directs that the seed run entirely as `app_rw`. It cannot: plan 01-03 §5 grants `app_rw` **SELECT only** on `court_profiles`, `rule_package_versions`, `security_policies` and `retention_schedules`, deliberately, because Phase 2's Configuration Engine adds authoring behind maker-checker approval. The options were to widen the grant or to split the seed. Widening would hand the running application the ability to rewrite the designation→entitlement map the policy engine reads — the single piece of data deciding who may see a sealed record. Establishing configuration defaults is an administrative act, so the administrative role performs it, in the same boot step that just ran the migrations. A test asserts `app_rw` still cannot write those tables, so the split does not quietly become cargo cult.

**4. The separation-of-duties pair is chosen structurally.** My first implementation special-cased "if the subject is `system_admin`, flip the requester" and left the decider alone — so both ends landed on `security_officer` and the table CHECK rejected it with `23514`. Independently patching each end does not compose. It now picks the first two of three administrative principals that are not the subject, which cannot degenerate. Worth noting that the database caught this: the constraint plan 01-03 added did exactly its job on its first real exercise.

**5. ClamAV's tag convention is the opposite of what the plan states.** The plan says `_base` "ships signature databases **baked in**". It is the reverse: `clamav/clamav:1.4.3_base` has an empty `/var/lib/clamav` and expects `freshclam` to populate it over the network; `clamav/clamav:1.4.3` carries ~110 MB of signatures. Since the sandbox may have no outbound network — the reason the plan gave for choosing `_base` — the signature-carrying tag is the one that satisfies the stated requirement.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Two pinned images no longer exist**

- **Found during:** Task 1
- **Issue:** `minio/minio:RELEASE.2024-06-13T22-53-53Z` returns `pull access denied, repository does not exist`. The `minio/minio` Docker Hub repository has been withdrawn entirely (the Hub API 404s on it), and `quay.io/minio/minio` now requires authentication for every tag. Separately, `clamav/clamav:1.3.1_base` is no longer a published tag.
- **Fix:** MinIO → `chainguard/minio`, **digest-pinned** (`sha256:4cf4831a…`) rather than tag-pinned, since that repository publishes only a moving `latest`. A digest is a stronger pin than a tag in any case. Verified it is a genuine MinIO server and that SSE-S3 works: created a bucket, `PutObject` with `ServerSideEncryption: AES256`, and `HeadObject` reports `AES256` — so plan 01-10's encryption-at-rest assertion has a working substrate. ClamAV → `clamav/clamav:1.4.3` (see Decision 5).
- **Verification:** Both images pull and run; MinIO's health endpoint answers and SSE round-trips.
- **Committed in:** `78afee4`

**2. [Rule 1 - Bug] `CREATE EXTENSION pgcrypto` lands in a different schema depending on who connects**

- **Found during:** Task 1
- **Issue:** The first `docker compose up` failed with `P3009` — a failed migration blocking all others. The failing statement was plan 01-05's in-flight `20260101000300_audit_hash_search_path`, with `42883 function digest(bytea, unknown) does not exist`. The root cause is older and belongs to neither plan: `20260101000000` runs `CREATE EXTENSION IF NOT EXISTS pgcrypto` with **no `SCHEMA` clause**, so PostgreSQL installs it into the first schema on the creating session's `search_path`. The test harness applies migrations through `psql` (default search_path → `public.digest()`); the Compose stack applies them through Prisma with `?schema=platform` (→ `platform.digest()`). Any SQL qualifying `digest()` against a fixed schema is therefore correct in exactly one of the two environments, and 01-05's hardening — correct for the harness — aborted the Compose migration and left `_prisma_migrations` wedged.
- **Fix:** `infra/db/init/02-extensions.sql` creates the extension explicitly in `public` before any migration runs. The migration's `IF NOT EXISTS` then finds it and does nothing, so the location stops depending on who is connected. This belongs in init rather than a migration for the same reason `01-roles.sql` does: it must be true *before* the first migration, and a migration cannot establish its own precondition.
- **Note on ownership:** `infra/db/init/` is mine to wire per this plan's file ownership; I added a file rather than editing 01-03's or 01-05's migrations, which are not mine and are already applied.
- **Verification:** Clean `docker compose down -v && up` applies all four migrations and the API starts. The full repo suite (134 tests, including 01-05's) passes unchanged.
- **Committed in:** `78afee4`

**3. [Rule 1 - Bug] Three healthchecks probed the wrong thing**

- **Found during:** Task 1
- **Issue:** All three as specified reported unhealthy against perfectly healthy services. Keycloak: the plan probes `/auth/health/ready` on port **9000**, but that management port only exists under `start` (production mode); under `start-dev` health is served on 8080, so the probe got connection-refused forever. MinIO: the image has no `curl`, `wget` or even `grep`, and answers a bare HTTP/1.0 request with `400 Bad Request`. Caddy: probing `https://127.0.0.1:8443/` returns a TLS internal-error alert, because the site block is bound to `judicialsync.localhost` and any other SNI gets no certificate.
- **Fix:** Keycloak probes 8080. MinIO uses pure-bash `/dev/tcp` with an HTTP/1.1 request and an explicit `Host` header, parsed with `read`/`case` — no external binary. Caddy probes the hostname, which resolves via its own network alias. OPA's `-static` image is distroless, so its probe is an OPA `eval` of `http.send` against its own `/health` — its only executable is the OPA binary.
- **Verification:** All eight services reach `healthy`, repeatedly, from a clean `down -v`.
- **Committed in:** `78afee4`

**4. [Rule 3 - Blocking] The host's DNS settings break service discovery inside the network**

- **Found during:** Task 3
- **Issue:** The seed failed with `getaddrinfo ENOTFOUND keycloak` from a container on the same network as a healthy `keycloak`. Docker copies the host's `/etc/resolv.conf` search list and options into every container; this Kubernetes-hosted sandbox supplies `search prod.svc.cluster.local svc.cluster.local cluster.local` and `options ndots:5`. With `ndots:5`, any name having fewer than five dots is tried against each search domain *first* — so `keycloak` becomes `keycloak.prod.svc.cluster.local`, then `.svc.cluster.local`, then `.cluster.local`, all `NXDOMAIN`, and resolution fails before the bare name ever reaches Docker's resolver. It presented as *intermittent* across services, because a name already in the resolver cache still answered, which is what made it expensive to pin down.
- **Fix:** `dns_search: ['.']` on every service via a YAML anchor, clearing the inherited list. Affects name resolution inside the Compose network only.
- **Verification:** Confirmed the mechanism directly (`getent hosts keycloak` fails with the inherited config and succeeds with `--dns-search .`) before applying it, rather than inferring it from the symptom.
- **Committed in:** `2471f2b`

**5. [Rule 1 - Bug] Four Dockerfile/realm defects, each surfacing as a misleading error**

- **Found during:** Tasks 1 and 2
- **Issue and fix:**
  - `prisma generate --schema apps/api/prisma/schema.prisma` fails with "file or directory not found" under `--workspace`, which changes npm's cwd. Path is now workspace-relative.
  - `COPY /app/apps/api/node_modules` fails: npm workspaces hoist, so there is exactly one `node_modules` at the root. Removed.
  - `prisma migrate deploy` in the runtime stage failed with `Could not parse schema engine response: SyntaxError: Unexpected token 'E'` — which reads like a Prisma bug and is a missing `libssl`. `openssl` and `libc6-compat` are now installed in **both** stages, not only the builder, because the seed and migrate run in the runtime stage on every boot.
  - The realm JSON carried a `_comment` root key. `RealmRepresentation` rejects unknown root fields outright, so Keycloak refused to start. The warning moved into `attributes` (a real free-form map). Two neighbouring constraints are now documented in place: `AUTHENTICATION_FLOW.DESCRIPTION` is `VARCHAR(255)` (a longer description aborts the import with `22001`), and client `minimum.acr.value` fails the import-time validator even when valid, because that validator runs before the realm's own `acr.loa.map` and flows are applied.
- **Verification:** Image builds; realm imports; stack healthy.
- **Committed in:** `78afee4`, `fce1598`

**6. [Rule 1 - Bug] The seed's separation-of-duties pair could self-approve**

- **Found during:** Task 3
- **Issue:** For the grant whose subject is `system_admin`, requester and decider both resolved to `security_officer`, violating `CHECK (decided_by <> requested_by)` with SQLSTATE `23514`.
- **Fix:** Pick the first two of three administrative principals that are not the subject — structural rather than special-cased.
- **Verification:** All 17 idempotency assertions pass, including `no access_grant_requests row has decided_by = requested_by`.
- **Committed in:** `2471f2b`

---

**Total deviations:** 6 auto-fixed (4 bug, 2 blocking)
**Impact on plan:** No scope change. Two were environmental (withdrawn images, host DNS), three were defects in the plan's own technical assumptions that would each have surfaced as a confusing runtime failure, and one was my own bug caught by a control plan 01-03 built. The two genuine judgement departures — the LoA-based MFA flow and the two-connection seed — both make the result *stricter* than specified.

## Verification Evidence

Commands run, with actual results.

| Check | Result |
|---|---|
| `docker compose config --quiet` | ✅ valid |
| `docker build` | ✅ exit 0 |
| All 8 services healthy from clean `down -v` | ✅ repeatedly |
| Only `proxy` publishes a host port | ✅ confirmed via `docker compose ps` |
| Plaintext probes on 8080/3000/5432/6379/9000/8181 | ✅ all refused (`http=000`) |
| `https://.../api/v1/health` | ✅ `{"status":"ok","service":"platform-core"}` |
| OIDC issuer, browser side | ✅ `https://judicialsync.localhost:8443/auth/realms/judicialsync` |
| **OIDC issuer, from inside api container, TLS verified** | ✅ identical string, no verification bypass |
| `NODE_TLS_REJECT_UNAUTHORIZED` in container | ✅ **UNSET**; `NODE_EXTRA_CA_CERTS=/caddy-ca/root.crt` present |
| API process user | ✅ `node`, not root |
| `scripts/stack-smoke.sh` | ✅ 4/4 PASS |
| Realm: 10 users, all with an `otp` credential | ✅ |
| Password-only auth, all ten users | ✅ `invalid_grant` for each |
| Password + computed TOTP, all ten users | ✅ `access_token` for each |
| Browser authorization-code flow | ✅ completes; token reports `acr: "otp"` (LoA 2) |
| Live seed counts (courts/cases/roles/users/entitlements) | ✅ 2 / 4 / 10 / **11** / **15** |
| Sealed = 1, restricted = 1 | ✅ |
| Reserved `system:unattributed` actor | ✅ present, `disabled`, zero roles/scopes/grants |
| `jury_admin` non-revoked grants | ✅ **0** |
| `access_grant_requests` with `decided_by = requested_by` | ✅ **0** |
| IdP subjects resolved live from Keycloak | ✅ 10 real UUIDs, not placeholders |
| `docker compose restart api` → counts unchanged | ✅ 4 cases, 11 users, 19 grants, 2 designations |
| `seed-idempotency.e2e-spec.ts` | ✅ 17 passed |
| `npm test` (whole repo) | ✅ **134 passed, 7 suites** |
| `npm run build` / `npm run lint` / `tsc --noEmit` | ✅ exit 0 each |

**Falsification — the checks that matter most, since a green suite proves nothing if it cannot go red:**

- **Substance-column rewrite on an append-only table.** Changed one seeded grant's upsert to `update: { entitlement_key: key }` → the second pass raised exactly `42501 permission denied for table entitlement_grants`, reproducing the predicted second-boot failure. Restored.
- **`jury_admin` granted `case_read`.** → **exactly one** test failed. The assertions are precisely targeted rather than broadly coupled.
- **MFA bypass, four ways.** A user with no OTP credential → forced into enrolment, not admitted. `acr_values=0`, `=1`, `=otp` on the authorize request → OTP form still presented in every case.
- **Configuration read-only posture.** An `UPDATE` on `security_policies` over the `app_rw` connection → `permission denied`, asserted as a test, so the two-connection split cannot silently become unnecessary.

## Known Stubs

**None found.** Scanned every created and modified file for TODO/FIXME/placeholder/not-implemented markers, hardcoded returns and empty bodies.

Two intentional scope boundaries, neither a stub:

- The Caddy catch-all route returns a text banner. Plan 01-13 replaces it with `reverse_proxy web:5173`; the comment marking the line is in place.
- `court_profiles` and `rule_package_versions` are seeded with one row each and no publish workflow, version comparison, or admin surface. CONTEXT assigns all of that to Phase 2.

## Issues Encountered

- **Plan 01-05 was landing commits concurrently.** Its migration `20260101000300` failed inside my stack and wedged `_prisma_migrations` with `P3009`. The underlying defect was 01-03's unqualified `CREATE EXTENSION` (deviation 2) rather than anything 01-05 did; the fix is in a file I own and leaves both plans' work intact. 134 tests across both plans pass together.
- **No `sudo` and no `psql` on the sandbox host.** `scripts/ensure-hosts.sh` could not be exercised as root here, but `judicialsync.localhost` already resolves natively so it was not needed; the script's no-op path was verified. Database checks ran via `docker compose exec db psql`, matching what 01-03 established.
- **MinIO and ClamAV image churn** (deviation 1) cost a detour through four registries. Worth recording that `minio/minio` is simply gone from Docker Hub — any later plan reaching for it will hit the same wall.

## User Setup Required

None. `cp .env.example .env` is covered by a committed `.env` with working local values, and every credential is documented in `docs/SEED-CREDENTIALS.md`. No external service account is needed.

## Next Phase Readiness

**Everything downstream is unblocked.** Specifically:

- **01-06 (identity/OIDC)** — a real issuer at `https://judicialsync.localhost:8443/auth/realms/judicialsync`, trusted by the API container; a confidential client with an audience mapper; `acr: "otp"` on a browser login and `amr`/`acr` available to reject under-authenticated sessions. `SEED_IDS.UNATTRIBUTED_ACTOR_USER_ID` is the actor for unattributable `access_attempt` events.
- **01-07 (PDP resource loader)** — `security_policies` seeded per court for `input.security_policies`; a sealed and a restricted case to load designations from.
- **01-09 / 01-10 (files)** — MinIO with SSE-S3 confirmed working end to end; `config_snapshot.file_type_allowlist` and `max_upload_bytes` in the database rather than in constants.
- **01-11 (retention)** — schedules seeded per court per category, with `court_admin`/`system_admin` holding `disposition_confirm` and `clerk_case_admin` deliberately not.
- **01-13 (web UI)** — add a `web` service and replace the Caddy catch-all; the marker comment is in place.
- **01-14 (assurance)** — the fixtures for criteria 1 and 4 exist: `judge` sees the sealed case, `clerk_case_admin` does not, and `jury_admin` holds a role with zero entitlements.

**Three things later plans must not do:**

1. **Do not grant `jury_admin` anything.** It is the fixture proving role existence never implies access, and 01-14 depends on it staying empty.
2. **Do not widen `app_rw` to cover the configuration tables.** The seed's two-connection split exists so that grant can stay narrow; a test asserts it.
3. **Do not set client `minimum.acr.value` / `default.acr.values` in the realm file.** The import-time validator rejects them regardless of validity. Apply via the admin REST API after import if ever needed.

**Carried forward:** ASM-05 (nine-vs-ten role catalog) remains OPEN — the seed implements ten. ASM-07 (PostgreSQL at-rest encryption) is unchanged: object-store encryption is now provable via MinIO SSE-S3, but the Compose Postgres volume is not encrypted and the deployment substrate must satisfy that before pilot.

## Self-Check: PASSED

All 17 created files verified present on disk. All 3 task commits verified in `git log`. Plan-level build (`npm run build`) run and passing, exit 0; `npm test` 134/134; `npm run lint` clean. `## Known Stubs` section present with no blocking entries.

---
*Phase: 01-core-identity-case-model-audit-security-baseline*
*Completed: 2026-10-05*
