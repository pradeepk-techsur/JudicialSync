#!/usr/bin/env bash
# =============================================================================
# stack-smoke.sh — prove the stack is actually wired, not merely running
# =============================================================================
#
# `docker compose ps` showing eight green rows proves the containers started.
# It does not prove the one thing this stack's design hinges on: that the OIDC
# issuer URL is the SAME STRING for the browser and for the API container. If
# those differ, every service is healthy and every login still fails, with an
# error that points at the token rather than at the network.
#
# So this script checks three things in order:
#
#   1. The API answers over TLS through the proxy.
#   2. The OIDC discovery document is fetchable FROM THE HOST and its `issuer`
#      is the expected string.
#   3. The same document is fetchable FROM INSIDE THE API CONTAINER, over TLS,
#      with certificate verification ON, and reports the same issuer.
#
# (3) is the one that matters and the one a casual smoke test omits. It fails
# if the proxy network alias is missing, if Caddy's internal CA was not copied
# into the container, or if KC_HOSTNAME drifts from the Caddy route.
#
# Usage:  ./scripts/stack-smoke.sh            # brings the stack up first
#         SKIP_UP=1 ./scripts/stack-smoke.sh  # assume it is already up
# =============================================================================

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ORIGIN="https://judicialsync.localhost:8443"
ISSUER="${ORIGIN}/auth/realms/judicialsync"
DISCOVERY="${ISSUER}/.well-known/openid-configuration"
# Health and discovery can legitimately take minutes on first boot: ClamAV
# loads ~110 MB of signatures, and the API runs migrate + seed before it binds.
READY_TIMEOUT="${READY_TIMEOUT:-900}"

FAILURES=0

pass() { printf '  \033[32mPASS\033[0m  %s\n' "$1"; }
fail() {
  printf '  \033[31mFAIL\033[0m  %s\n' "$1"
  FAILURES=$((FAILURES + 1))
}
step() { printf '\n\033[1m%s\033[0m\n' "$1"; }

# -----------------------------------------------------------------------------
step "1/4  Bring the stack up"
# -----------------------------------------------------------------------------
if [ -z "${SKIP_UP:-}" ]; then
  if [ ! -f .env ]; then
    echo "error: .env is missing. Run: cp .env.example .env" >&2
    exit 1
  fi
  docker compose up -d --build || {
    echo "error: docker compose up failed" >&2
    exit 1
  }
else
  echo "  SKIP_UP set — assuming the stack is already running"
fi

# -----------------------------------------------------------------------------
step "2/4  Wait for every service to report healthy"
# -----------------------------------------------------------------------------
# `--format json` emits one JSON object per line. Counting `"Health":"healthy"`
# across them is enough and avoids a jq dependency.
deadline=$((SECONDS + READY_TIMEOUT))
expected_healthy=7 # db redis opa keycloak clamav minio proxy — api counted separately
while [ "$SECONDS" -lt "$deadline" ]; do
  healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"')
  if [ "$healthy" -ge "$expected_healthy" ]; then
    break
  fi
  sleep 10
done

docker compose ps

healthy=$(docker compose ps --format json 2>/dev/null | grep -c '"Health":"healthy"')
if [ "$healthy" -ge "$expected_healthy" ]; then
  pass "at least ${expected_healthy} services report healthy (${healthy})"
else
  fail "only ${healthy} services healthy after ${READY_TIMEOUT}s (wanted >= ${expected_healthy})"
fi

# -----------------------------------------------------------------------------
step "3/4  Reachability over TLS, from the host"
# -----------------------------------------------------------------------------
# `-k` here only because the host has not been asked to trust Caddy's internal
# CA. The API container's check below runs with verification ON, which is the
# check that actually matters.
deadline=$((SECONDS + READY_TIMEOUT))
while [ "$SECONDS" -lt "$deadline" ]; do
  curl -ksSf "${ORIGIN}/api/v1/health" >/dev/null 2>&1 && break
  sleep 10
done

if curl -ksSf "${ORIGIN}/api/v1/health" 2>/dev/null | grep -q '"status":"ok"'; then
  pass "API answers over TLS at ${ORIGIN}/api/v1/health"
else
  fail "API did not answer at ${ORIGIN}/api/v1/health"
  docker compose logs --tail 40 api proxy
fi

if curl -ksSf "$DISCOVERY" 2>/dev/null | grep -q "\"issuer\":\"${ISSUER}\""; then
  pass "OIDC discovery issuer is ${ISSUER} (browser side)"
else
  fail "OIDC discovery issuer mismatch or unreachable (browser side)"
  curl -ks "$DISCOVERY" 2>/dev/null | head -c 400
  echo
fi

# -----------------------------------------------------------------------------
step "4/4  The same issuer, from inside the API container, TLS verified"
# -----------------------------------------------------------------------------
# No -k equivalent and no NODE_TLS_REJECT_UNAUTHORIZED. Node verifies the
# certificate against the Caddy root CA imported via NODE_EXTRA_CA_CERTS. A
# pass here means the trust anchor landed AND the alias resolves AND the issuer
# string agrees with the browser-side one.
if docker compose exec -T api node -e "
const https = require('https');
const expected = '${ISSUER}';
https.get('${DISCOVERY}', (res) => {
  if (res.statusCode !== 200) {
    console.error('status ' + res.statusCode);
    process.exit(1);
  }
  let body = '';
  res.on('data', (c) => (body += c));
  res.on('end', () => {
    const issuer = JSON.parse(body).issuer;
    if (issuer !== expected) {
      console.error('issuer mismatch: ' + issuer + ' !== ' + expected);
      process.exit(1);
    }
    console.log(issuer);
  });
}).on('error', (e) => {
  console.error(e.message);
  process.exit(1);
});
" >/dev/null 2>&1; then
  pass "issuer reachable, TLS-verified and identical from inside the api container"
else
  fail "api container could not verify/reach ${DISCOVERY}"
  docker compose exec -T api node -e "require('https').get('${DISCOVERY}',r=>console.log(r.statusCode)).on('error',e=>console.error(e.message))" 2>&1 | head -5
fi

# -----------------------------------------------------------------------------
printf '\n'
if [ "$FAILURES" -eq 0 ]; then
  printf '\033[32mSTACK SMOKE PASSED\033[0m — single TLS origin and matching issuer confirmed.\n'
  exit 0
fi
printf '\033[31mSTACK SMOKE FAILED\033[0m — %d check(s) failed.\n' "$FAILURES"
exit 1
