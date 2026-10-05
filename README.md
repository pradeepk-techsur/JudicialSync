# JudicialSync

One current, auditable, explainable record for court exhibits and speedy-trial
deadlines. Judges and authorized staff stay in command of every ruling,
finding, override, and final determination; the system records, it never
decides.

Planning documents live under `.planning/`; the specifications they implement
live under `project_specs/`.

---

## Quick start

Prerequisites: Docker with Compose v2, and roughly 6 GB of free memory (ClamAV
loads ~110 MB of malware signatures and Keycloak runs a JVM).

```bash
cp .env.example .env     # local-development credentials, already filled in
./scripts/ensure-hosts.sh   # only if judicialsync.localhost does not resolve
docker compose up --build
```

Then open **<https://judicialsync.localhost:8443>**.

First boot takes several minutes: images are pulled, the API image is built,
ClamAV loads its signature database, and the API runs migrations and the seed
before it starts serving. Subsequent boots are fast.

To confirm the stack is not merely running but correctly wired:

```bash
./scripts/stack-smoke.sh
```

### Your browser will warn about the certificate

That is expected, and it is not a misconfiguration to work around. TLS is
terminated by Caddy using its own internal certificate authority, which no
browser trusts by default. Accept the warning for `judicialsync.localhost`.

What matters is that the **API container does not** skip verification: it
imports Caddy's root CA via `NODE_EXTRA_CA_CERTS` and verifies normally.
`NODE_TLS_REJECT_UNAUTHORIZED` is never set anywhere in this repository, and
a change that sets it should be rejected in review.

Production terminates TLS at the cloud gateway with a real certificate. That
deployment infrastructure is deliberately out of Phase 1 scope.

---

## What is running

`docker compose up` starts eight services on one network, behind a single TLS
origin:

| Service    | Image                            | Role                                              |
| ---------- | -------------------------------- | ------------------------------------------------- |
| `proxy`    | `caddy:2.8-alpine`               | TLS termination. **The only published port (8443).** |
| `api`      | built from `./Dockerfile`        | Platform Core API (NestJS)                        |
| `db`       | `postgres:15.7-alpine`           | The `platform` schema — identity, cases, audit    |
| `keycloak` | `quay.io/keycloak/keycloak:24.0.5` | Stand-in court identity provider, real TOTP MFA |
| `opa`      | `openpolicyagent/opa:0.64.1-static` | Policy decision point (the Rego bundle in `policy/`) |
| `redis`    | `redis:7.2-alpine`               | Queue backend and the short claim cache           |
| `clamav`   | `clamav/clamav:1.4.3`            | Malware scanning — a hard gate on every upload    |
| `minio`    | `chainguard/minio` (digest-pinned) | S3-compatible object store, encrypted at rest   |

Useful URLs (all through the one origin):

- API health — <https://judicialsync.localhost:8443/api/v1/health>
- OIDC discovery — <https://judicialsync.localhost:8443/auth/realms/judicialsync/.well-known/openid-configuration>
- Keycloak admin console — <https://judicialsync.localhost:8443/auth/admin/>

### Why only one origin

OIDC token validation compares the `iss` claim against the issuer the relying
party discovered. The usual local-development arrangement gives Keycloak two
addresses — `localhost:8080` for the browser, `keycloak:8080` for the API —
and those two strings differ, so every login fails with an error that appears
to be about the token.

So Keycloak gets exactly one address. `judicialsync.localhost` resolves to
loopback in the browser and, via a Compose network alias on `proxy`, to Caddy
inside the network. One name, one scheme, one port, one issuer. See the
header comment in `Caddyfile`.

A consequence worth stating plainly: **no service other than `proxy` publishes
a host port**. There is no plaintext path to the API or to Keycloak from
outside the Compose network, which is how `FRD/F13`'s "TLS 1.2+ with no
fallback to unencrypted transport" is made structural rather than asserted.

---

## Signing in

Every seeded user requires **real TOTP** — password alone is rejected, and
there is no development bypass flag.

`docs/SEED-CREDENTIALS.md` lists one user per role with its password and its
Base32 TOTP secret. Scan a secret into any authenticator app, or compute the
current code from a terminal:

```bash
node -e "console.log(require('otplib').authenticator.generate('<BASE32_SECRET>'))"
```

Those credentials are local-development only. They must never exist in an
environment reachable from outside a developer's machine.

---

## Working on it

```bash
npm install          # workspaces: apps/*
npm run build        # build every workspace
npm test             # unit + integration (Testcontainers; Docker required)
npm run lint
./scripts/opa-test.sh   # the Rego policy bundle's own tests
```

Two standing rules, both load-bearing:

1. **Never run `prisma migrate dev`.** It regenerates the migration directory,
   which silently drops the database grants and the audit hash-chain trigger —
   this phase's central guarantee — while reporting success. Use
   `npm run db:migrate` (`prisma migrate deploy`).
2. **The seed must stay idempotent.** The container's start command is
   `migrate → seed → serve`, and the volume persists, so the seed re-runs on
   every boot. `apps/api/test/seed-idempotency.e2e-spec.ts` enforces this.

Further reading: `docs/SCHEMA-NOTES.md` (why the schema departs from TechArch
where it does), `docs/ASSUMPTIONS.md` (decisions awaiting stakeholder
validation), `policy/README.md` (the authorization model).

---

## Resetting

```bash
docker compose down          # stop, keep data
docker compose down -v       # stop and DELETE all volumes — next boot re-seeds
```
