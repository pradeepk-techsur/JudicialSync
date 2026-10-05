# Seeded credentials

> ## ⚠️ LOCAL DEVELOPMENT ONLY
>
> **Every password and TOTP secret on this page is published in version
> control.** They exist so that `docker compose up` reaches a working,
> signed-into-able system from a clean clone with no manual step — which is
> what the Phase 1 CONTEXT requires.
>
> `infra/keycloak/realm-judicialsync.json` must **never** be imported into any
> environment reachable from outside a developer's machine, and these
> credentials must never be created in one.
> `TechArch/05-tech-stack.md` §8.4 requires production to resolve every
> credential from AWS Secrets Manager or Azure Key Vault (Government), with
> "no credentials embedded in code or container images". In a real deployment
> the court's own IdP is externally administered and this file has no
> counterpart at all.
>
> This residual risk is tracked as **threat T-01-14** (accepted, owner: the
> operator) in `01-04-PLAN.md`.

---

## The ten role users

One user per role in the `docs/ASSUMPTIONS.md` ASM-01 catalog. All ten require
**real TOTP** — password alone is rejected, and there is no bypass flag.

| Role | Person | Username | Password | TOTP secret (Base32) | Court | Persona |
| --- | --- | --- | --- | --- | --- | --- |
| `judge` | Robert Hale | `judge` | `judge_local_dev!1` | `GYZVMWCGIFDFMTKWIFETOU2XKVCEOQSQ` | NDCA | PER-02 |
| `law_clerk` | Ana Ibarra | `law_clerk` | `law_clerk_local_dev!1` | `JZNFOTRTIFHU6WSUGJJFMWSKJM2UWNCD` | NDCA | PER-02 |
| `courtroom_deputy` | Maria Santos | `courtroom_deputy` | `courtroom_deputy_local_dev!1` | `G5DUISCEKNGTOS2EK5MVAVZVJ5CE2VSL` | NDCA | PER-01 |
| `clerk_case_admin` | David Okafor | `clerk_case_admin` | `clerk_case_admin_local_dev!1` | `JY3EKWKCIZFUYVBUJBKDORSRIFFVCVSV` | NDCA | PER-03 |
| `attorney_external` | Jordan Whitfield | `attorney_external` | `attorney_external_local_dev!1` | `GNBU4UKHIMZVMQSDINLEISRTIQZEKTZW` | NDCA | — |
| **`jury_admin`** | Carla Jimenez | `jury_admin` | `jury_admin_local_dev!1` | `KJLFKS2PJJGECS2KJZMFEVSYKRHVEN2E` | NDCA | PER-05 |
| `court_admin` | Thomas Reyes | `court_admin` | `court_admin_local_dev!1` | `KY3TITKNKJIFQNKUJJGE6MSCIZFTIR2N` | NDCA | PER-06 |
| `ao_program_manager` | Lydia Brennan | `ao_program_manager` | `ao_program_manager_local_dev!1` | `GJMECQ2EKJGEKV2XJBATEV2DJVHEIWCR` | NDCA | — |
| `system_admin` | Priya Nandan | `system_admin` | `system_admin_local_dev!1` | `LBGUKTKWJJFUOWCFI5DDKM2YLFDU2SST` | **SDNY** | PER-04 |
| `security_officer` | Samuel Adeyemi | `security_officer` | `security_officer_local_dev!1` | `KRCUUTCVKBMFOSRWJFBU4RCQKZJTEV2T` | **SDNY** | — |

Two users sit in **SDNY** and eight in **NDCA** on purpose: cross-court
isolation has to be demonstrable at the identity provider, not only in the
database. A `court_code` claim mapper puts the value in every token.

### `jury_admin` holds a role and **zero entitlements**

This is the single most important row in the table, and it is deliberately
empty of authority.

CONTEXT states the hard constraint that **role existence must never imply
access**. A claim like that is easy to assert and easy to quietly violate —
the usual way is a "sensible default" entitlement bundle attached to each
role, which turns having a role into having access without anyone deciding to
grant it. `jury_admin` is the fixture that makes the constraint falsifiable:
the user authenticates successfully, carries a legitimate role, and is denied
every protected action, because it was granted nothing.

If a future change gives `jury_admin` entitlements by side effect, the
assurance suite (plan 01-14) fails. Do not "fix" that by granting it
something.

---

## Signing in

Scan a secret into any authenticator app (FreeOTP, Google Authenticator,
Microsoft Authenticator — the realm advertises all three), or compute the
current code from a terminal:

```bash
node -e "console.log(require('otplib').authenticator.generate('GYZVMWCGIFDFMTKWIFETOU2XKVCEOQSQ'))"
```

From a test, the same thing with a direct grant:

```bash
TOTP=$(node -e "console.log(require('otplib').authenticator.generate('<SECRET>'))")
curl -ks -X POST \
  https://judicialsync.localhost:8443/auth/realms/judicialsync/protocol/openid-connect/token \
  -d grant_type=password \
  -d client_id=judicialsync-internal \
  -d client_secret=judicialsync-local-dev-client-secret \
  -d username=clerk_case_admin \
  -d "password=clerk_case_admin_local_dev!1" \
  -d "totp=$TOTP"
```

Drop the `totp` parameter and the same request returns
`{"error":"invalid_grant"}`. That is the point.

### Why the secrets are pre-provisioned

Keycloak normally makes a user enrol TOTP on first login, by scanning a QR
code the server generates. That is correct for a human and impossible for an
automated test: nothing can read a QR code out of a page and continue.

Seeding the secret instead means Playwright and the integration suite compute
the current code with `otplib` and sign in unattended, while **a human can
scan the exact same secret into a real authenticator app** — which is what
CONTEXT means by MFA being "demonstrable end to end with any authenticator
app". Neither path is a simulation of the other; they use the same credential.

### A note on the stored format

Keycloak stores an OTP credential's secret as **raw bytes**, and derives the
HMAC key from them directly. The Base32 string an authenticator app expects is
`base32(those bytes)` — so the value in `realm-judicialsync.json`
(`secretData.value`) and the value in the table above are **not the same
string**, and neither is wrong.

This is worth stating because the natural assumption — that the field holds
the Base32 the app shows you — produces codes that are silently rejected, with
an error indistinguishable from a wrong password. The convention was confirmed
empirically against Keycloak 24.0.5 rather than taken from documentation.

---

## Other local credentials

| What | Value | Used by |
| --- | --- | --- |
| Keycloak admin console | `admin` / `admin_local_dev` | <https://judicialsync.localhost:8443/auth/admin/> |
| OIDC client secret | `judicialsync-local-dev-client-secret` | `OIDC_CLIENT_SECRET` in `.env`; must match the realm file |
| PostgreSQL app role | `app_rw` / `app_rw_local_dev` | the running API — no DELETE anywhere, no UPDATE on append-only tables |
| PostgreSQL migration role | `app_dba` / `app_dba_local_dev` | `npm run db:migrate` only |
| MinIO root | `judicialsync_local` / `judicialsync_local_secret` | the API's S3 client, server-side only |

The two PostgreSQL roles are **not interchangeable**. `PrismaService` asserts
at boot that the running application connected as `app_rw`, because running as
`app_dba` would void every append-only grant while every test still passed.

---

## How MFA is enforced

The realm does **not** use Keycloak's built-in browser flow. That flow wraps
the OTP step in a `Condition - user configured` subflow, which means a user
*without* an OTP credential skips MFA entirely — making MFA a property of the
user record rather than of the realm, and leaving exactly the bypass CONTEXT
forbids.

`browser-mfa` instead conditions the OTP step on **Level of Authentication 2**
(`conditional-level-of-authentication`, configured by `browser-mfa-loa-2`),
with the realm's `acr.loa.map` declaring `{"otp": 2}`. A successful browser
login reports `acr: "otp"`.

These properties were established by trying to break them, not by reading the
configuration back:

| Attempt | Result |
| --- | --- |
| Password only, direct grant, each of the ten users | `invalid_grant` — rejected |
| Password + computed TOTP, each of the ten users | `access_token` issued |
| `acr_values=0`, `=1`, `=otp` on the authorize request | OTP form still presented — a downgrade request does not skip it |
| A user with **no** OTP credential | Forced into TOTP enrolment, **not** admitted |

Plan 01-06 consumes this: it rejects any session whose `acr` is below level 2
or whose `amr` lacks `otp`.
