/**
 * Resolve each seeded user's Keycloak `sub` from the admin REST API.
 *
 * ## Why this cannot be hard-coded
 *
 * `users.external_idp_subject` has to hold the IdP's own subject identifier,
 * because that is the only value a token carries that identifies the person.
 * Keycloak generates those ids when it imports the realm — they are not in
 * `realm-judicialsync.json` and they differ between any two imports. Writing a
 * guessed value would produce a database whose users can never be matched to
 * an authenticated session: every login would succeed at the IdP and then fail
 * to resolve a principal, which looks like an authorization bug and is not one.
 *
 * ## Why it fails loudly rather than inventing subjects
 *
 * If Keycloak is unreachable the honest outcome is a failed boot. Falling back
 * to synthetic subjects would produce a stack that starts, looks healthy, and
 * cannot authenticate anyone — and the cause would be a silent decision taken
 * minutes earlier in a log nobody reads.
 *
 * The test suite passes `fixtureSubjects` instead, so the idempotency test does
 * not need a running Keycloak.
 */

export interface SubjectResolver {
  (username: string): Promise<string>;
}

interface KeycloakUser {
  id: string;
  username: string;
}

/** Fixture resolver: `judge` -> `seed-subject-judge`. Tests only. */
export function fixtureSubjects(): SubjectResolver {
  return (username: string) => Promise.resolve(`seed-subject-${username}`);
}

async function adminToken(baseUrl: string, user: string, pass: string): Promise<string> {
  const res = await fetch(`${baseUrl}/realms/master/protocol/openid-connect/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: user,
      password: pass,
    }),
  });
  if (!res.ok) {
    throw new Error(
      `Keycloak admin authentication failed (${res.status}). ` +
        `Check KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD against the running container.`,
    );
  }
  const body = (await res.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error('Keycloak admin token response carried no access_token.');
  }
  return body.access_token;
}

/**
 * Live resolver against the Keycloak admin REST API.
 *
 * `baseUrl` is the INTERNAL address (`http://keycloak:8080/auth`), not the
 * public issuer. This is a server-to-server call that no browser ever sees,
 * and it runs during container start when the public TLS origin may not yet be
 * serving — reaching for the issuer URL here would make the seed depend on the
 * proxy's readiness for no benefit.
 */
export function keycloakSubjects(opts: {
  baseUrl: string;
  realm: string;
  adminUser: string;
  adminPassword: string;
}): SubjectResolver {
  const cache = new Map<string, string>();
  let tokenPromise: Promise<string> | undefined;

  return async (username: string): Promise<string> => {
    const cached = cache.get(username);
    if (cached) return cached;

    tokenPromise ??= adminToken(opts.baseUrl, opts.adminUser, opts.adminPassword);
    const token = await tokenPromise;

    const url =
      `${opts.baseUrl}/admin/realms/${opts.realm}/users` +
      `?username=${encodeURIComponent(username)}&exact=true`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (!res.ok) {
      throw new Error(`Keycloak user lookup for '${username}' failed (${res.status}).`);
    }

    const users = (await res.json()) as KeycloakUser[];
    const match = users.find((u) => u.username === username);
    if (!match) {
      throw new Error(
        `Keycloak realm '${opts.realm}' has no user '${username}'. ` +
          `The realm import and the seed disagree about the role catalog — ` +
          `check infra/keycloak/realm-judicialsync.json.`,
      );
    }

    cache.set(username, match.id);
    return match.id;
  };
}

/**
 * Pick a resolver from the environment. Used by `prisma/seed.ts`.
 *
 * `SEED_FAKE_IDP_SUBJECTS=true` selects the fixture resolver. That switch
 * exists for the integration suite, and is deliberately NOT a fallback: it has
 * to be asked for, so a misconfigured deployment cannot drift into it.
 */
export function resolverFromEnv(): SubjectResolver {
  if (process.env.SEED_FAKE_IDP_SUBJECTS === 'true') {
    return fixtureSubjects();
  }
  const baseUrl = process.env.KEYCLOAK_INTERNAL_URL ?? 'http://keycloak:8080/auth';
  return keycloakSubjects({
    baseUrl: baseUrl.replace(/\/$/, ''),
    realm: process.env.KEYCLOAK_REALM ?? 'judicialsync',
    adminUser: process.env.KEYCLOAK_ADMIN ?? 'admin',
    adminPassword: process.env.KEYCLOAK_ADMIN_PASSWORD ?? '',
  });
}
