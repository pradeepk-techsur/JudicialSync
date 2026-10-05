# Integrating a court identity provider

JudicialSync authenticates every user against an **externally administered
identity provider**. Locally that is the Keycloak container from
`docker-compose.yml`; in a real deployment it is the court's own IdP.

Swapping one for the other is intended to be a **configuration change, not a
code change**, and this document is the contract that makes that true: what
the system requires of an IdP, which settings carry those requirements, and
which parts are deliberately not built yet.

---

## 1. The configuration surface

Everything the application knows about the IdP arrives through these
variables. There is no other coupling — no realm name in code, no Keycloak
API call on the authentication path, no provider-specific branch.

| Variable | Meaning | Local value |
| --- | --- | --- |
| `OIDC_ISSUER_URL` | Issuer base URL. Discovery reads `${issuer}/.well-known/openid-configuration`. | `https://judicialsync.localhost:8443/auth/realms/judicialsync` |
| `OIDC_CLIENT_ID` | Client identifier for the **internal** application audience. | `judicialsync-internal` |
| `OIDC_CLIENT_SECRET` | Client secret. Production resolves this from AWS Secrets Manager / Azure Key Vault (Government) per `TechArch/05-tech-stack.md` §8.4. | local dev value only |
| `OIDC_REDIRECT_URI` | Authorization-code callback. Must match the IdP client registration **exactly**. | `https://judicialsync.localhost:8443/api/v1/auth/callback` |
| `OIDC_ACR_LOA_MAP` | Optional JSON `{alias: level}` mapping ACR aliases to numeric Levels of Authentication. See §3 — **read it before deploying against a new IdP.** | unset locally (derived from discovery) |
| `NODE_EXTRA_CA_CERTS` | Trust anchor when the IdP presents an internally issued certificate. | Caddy's internal root CA |

`NODE_EXTRA_CA_CERTS` adds a **trust anchor**; it is not a verification
bypass. `NODE_TLS_REJECT_UNAUTHORIZED` is never set anywhere in this
repository and `rejectUnauthorized: false` appears nowhere under
`apps/api/src/`. A CI grep enforces both, because "just for local dev" is how
a disabled certificate check reaches production.

---

## 2. What the IdP must provide

1. **OIDC discovery** at `${OIDC_ISSUER_URL}/.well-known/openid-configuration`,
   publishing a `jwks_uri`.
2. **Authorization Code flow with PKCE (`S256`)**. The client is confidential
   and also sends its secret; PKCE is required in addition, not instead.
3. **Claims** `sub`, `name` (or `preferred_username`) and `email` on the ID
   token, from the `openid profile email` scopes.
4. **An authentication-context claim evidencing MFA** — see §3, which is the
   part most likely to need attention on a new IdP.
5. **Enforced multi-factor authentication.** The application *verifies* the
   evidence; it cannot *cause* the second factor to be demanded. An IdP that
   issues a non-MFA assertion produces a rejected login, not a degraded
   session.

---

## 3. The MFA evidence contract — read this before swapping IdPs

A session is MFA-satisfied if **either**:

- the assertion's `amr` names a second-factor method (`otp`, `mfa`, `hwk`,
  `swk`, `sms`, `pop` — RFC 8176); **or**
- the assertion's `acr` resolves to a numeric Level of Authentication **≥ 2**.

The second clause is where IdPs differ, and getting it wrong is silent in one
direction and loud in the other. The details below were established by
driving the real realm, not from documentation.

### What Keycloak actually sends

A genuine browser login with password **plus** a real TOTP code produces:

```json
{ "acr": "otp" }
```

That is the realm's **LoA alias**, not a number — and there is **no `amr`
claim at all**. So an implementation that computes

```js
Number(claims.acr) >= 2 || claims.amr?.includes('otp')   // WRONG
```

evaluates `Number("otp") >= 2` → `NaN >= 2` → `false`, with `amr` undefined,
and rejects every correct MFA login with `AUTH_MFA_FAILED`.

The missing half is the realm's `acr.loa.map`:

```json
"acr.loa.map": "{\"otp\": 2}"
```

That map is what says the alias `otp` *means* level 2. `OidcProvider`
resolves `acr` through it (merged with anything numeric in
`acr_values_supported`, and overridable via `OIDC_ACR_LOA_MAP`), so the alias
carries its intended meaning instead of being parsed as a number it never was.

### Why the obvious repair is worse than the bug

The naive formula fails **closed** — it denies real users rather than
admitting forged assertions. Loud, and therefore survivable.

The tempting fix under deadline pressure is "treat any non-empty `acr` as
MFA". That inverts the failure direction, and it admits a specific real
token. A **direct-access-grant** token obtained with password + TOTP reports:

```json
{ "acr": "1" }
```

The direct grant verifies the TOTP as a credential but does not run the
browser flow's LoA-conditioned OTP step, so the session is never stepped up to
level 2. `"1"` resolves to 1, which is below the threshold, and is correctly
**not** MFA-satisfied. An "any `acr` will do" check would accept it.

An ACR alias that appears in **neither** the configured map nor
`acr_values_supported` resolves to nothing and therefore denies. A realm
misconfiguration must not silently downgrade MFA for everyone.

### Configuring a new IdP

Supply the mapping explicitly when the provider does not publish numeric
levels:

```bash
OIDC_ACR_LOA_MAP='{"otp":2,"mfa":2,"urn:mace:incommon:iap:silver":2}'
```

Then verify against the real provider before trusting it — decode an ID token
from a genuine MFA login and confirm `acr`/`amr` carry what you expect. Two
providers agreeing on the OIDC spec routinely disagree here.

---

## 4. How MFA is enforced locally

The realm deliberately does **not** use Keycloak's built-in browser flow.
That flow wraps the OTP step in a `Condition - user configured` subflow, which
means a user *without* an OTP credential skips MFA entirely — making MFA a
property of the user record rather than of the realm.

`browser-mfa` instead conditions OTP on **Level of Authentication 2**
(`conditional-level-of-authentication`, configured by `browser-mfa-loa-2`),
with `acr.loa.map` declaring `{"otp": 2}`.

| Attempt | Result |
| --- | --- |
| Password only, direct grant | `invalid_grant` — rejected |
| Password + TOTP, browser flow | `acr: "otp"` → MFA satisfied |
| Password + TOTP, direct grant | `acr: "1"` → **not** MFA satisfied (no LoA step-up) |
| `acr_values=0`/`1`/`otp` on the authorize request | OTP form still presented — a downgrade request does not skip it |
| A user with no OTP credential | Forced into enrolment, not admitted |

There is no application-side flag that changes any row of that table. The
Phase 1 CONTEXT rejected one, on the reasoning that it becomes the
daily-exercised path while the real control goes unproven — so the only way
`mfa_satisfied` becomes true is for the identity provider to say, in a signed
assertion, that the second factor happened.

---

## 5. `POST /auth/mfa-challenge` and why it returns 422 here

The shared API contract (`FRD/Y1a-api-shared.md` §Identity & Access) lists an
MFA challenge endpoint, so it exists. Against this deployment it returns:

```
422 AUTH_MFA_NOT_REQUIRED_AT_THIS_STEP
```

because **Keycloak owns the OTP form**. The second factor is collected and
verified inside the IdP's own browser flow, before the authorization code is
ever issued — by the time the application sees an assertion, MFA has either
happened or it has not.

The endpoint is kept for an IdP that returns an interim `mfa_required` state
and expects the relying party to collect the code. Implementing an
application-side OTP verifier for *this* deployment would mean building a
second authentication path alongside the real one — exactly what CONTEXT
rejected — so the endpoint reports honestly that the step does not apply
rather than pretending to perform it.

---

## 6. Deferred: SAML

**Not implemented, deliberately.** The Phase 1 CONTEXT defers SAML "until a
court requires it", with the explicit instruction not to add `node-saml` now.
No markup-protocol code exists under `apps/api/src/modules/identity/`, and a
CI grep keeps it that way.

What makes this a deferral rather than a gap: `IdpProvider`
(`idp/idp-provider.interface.ts`) is protocol-agnostic. It speaks in
`IdpAssertionResult` — subject, display name, email, MFA evidence — and
nothing in `AuthService`, `SessionService` or the guard chain knows which
protocol produced it. Adding a second protocol is therefore:

1. a new class implementing `IdpProvider`,
2. a widened `protocol` union, and
3. a changed binding for `IDP_PROVIDER` in `identity.module.ts`.

No caller changes. That is what the seam is for, and it is why the seam was
built despite having only one implementation behind it today.

---

## 7. The external attorney portal needs a second client

F12 (Phase 4) adds an external attorney portal. It must use a **separate IdP
client with a distinct audience**, not the internal one.

The reason is audience confusion: if external counsel and court staff receive
tokens bearing the same `aud`, then a token legitimately issued to an
attorney is, as far as `aud` validation is concerned, a valid token for the
internal application. The audience check is what keeps "authenticated to the
portal" from meaning "authenticated to the case management system", and it
only works if the two audiences differ.

The abstraction already permits this — `OidcProviderConfig` carries its own
`clientId`/`clientSecret`, so a second provider instance bound under a second
token is additive. Phase 4 owns the work; this note exists so the Phase 1
client registration is not mistaken for the only one the system will need.

---

*Owner: plan 01-06. Credentials for the local realm:
[`SEED-CREDENTIALS.md`](./SEED-CREDENTIALS.md).*
