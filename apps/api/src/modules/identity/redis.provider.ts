import { Logger, Provider } from '@nestjs/common';
import Redis from 'ioredis';

/**
 * The shared Redis connection for the identity module.
 *
 * Two distinct users, both short-lived and both reconstructible:
 *
 *   - OIDC `state`/`nonce`/PKCE entries for in-flight logins
 *     (`oidc.provider.ts`), and
 *   - the resolved-`Principal` claim cache
 *     (`entitlement-resolver.service.ts`).
 *
 * Neither is a system of record. Everything here can be rebuilt from
 * PostgreSQL or by the user retrying a login, which is why losing Redis
 * degrades latency and in-flight logins rather than correctness. The one
 * thing that must NOT follow from a Redis outage is a relaxed check — see
 * `OidcProvider.requireRedis`, which denies rather than proceeding without
 * replay protection.
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

export const redisProvider: Provider = {
  provide: REDIS_CLIENT,
  useFactory: (): Redis | undefined => {
    const url = process.env.REDIS_URL;
    const logger = new Logger('RedisProvider');

    if (url === undefined || url.trim() === '') {
      // Unset is a legitimate state for a unit test that never touches a
      // cache path. The consumers treat an absent client as "deny" rather
      // than "skip the check", so an unset URL cannot weaken anything.
      logger.warn('REDIS_URL is not set; identity Redis features are unavailable.');
      return undefined;
    }

    const client = new Redis(url, {
      // Bound the retries so an authentication request against a dead Redis
      // produces a prompt failure rather than hanging until the socket
      // times out.
      maxRetriesPerRequest: 2,

      // `enableOfflineQueue` stays TRUE, deliberately, and this is a
      // correctness fix rather than a tuning preference.
      //
      // With it false, ioredis rejects any command issued before the
      // connection reaches `ready` — including commands issued microseconds
      // after construction, while the TCP handshake is still in flight. The
      // observable effect is that the FIRST login attempt after every boot
      // fails: `beginAuthorization` cannot persist its state/nonce, so the
      // callback finds nothing and the user is told their assertion was
      // invalid. It then works forever after, which makes it the kind of
      // bug that is dismissed as a flake and never fixed.
      //
      // Found exactly that way — the first real end-to-end login in the
      // integration suite failed with AUTH_INVALID_ASSERTION while Redis was
      // provably healthy.
      //
      // Queuing does not weaken the fail-closed posture: the queue is
      // bounded by `maxRetriesPerRequest`, so a genuinely unreachable Redis
      // still fails the command, and `OidcProvider.requireRedis` still
      // denies rather than proceeding without replay protection.
      enableOfflineQueue: true,

      lazyConnect: false,
    });

    client.on('error', (error: Error) => {
      logger.warn(`Redis connection error: ${error.message}`);
    });

    return client;
  },
};
