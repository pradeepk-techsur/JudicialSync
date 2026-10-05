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
      // Fail a command rather than queue it forever when the server is down:
      // an authentication request should produce a prompt 503, not hang
      // until the client's socket times out.
      maxRetriesPerRequest: 2,
      enableOfflineQueue: false,
      lazyConnect: false,
    });

    client.on('error', (error: Error) => {
      logger.warn(`Redis connection error: ${error.message}`);
    });

    return client;
  },
};
