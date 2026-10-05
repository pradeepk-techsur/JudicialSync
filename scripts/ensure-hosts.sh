#!/usr/bin/env bash
# =============================================================================
# ensure-hosts.sh — make `judicialsync.localhost` resolve to loopback
# =============================================================================
#
# RFC 6761 reserves the `.localhost` TLD and says resolvers SHOULD map it (and
# everything under it) to loopback. Most browsers and glibc do. Several things
# do not: musl's resolver, some corporate DNS configurations, and a number of
# container base images. Where it does not, `https://judicialsync.localhost:8443`
# simply fails to resolve and the whole stack looks broken for a reason that
# has nothing to do with the stack.
#
# This script closes that gap idempotently. It is safe to run any number of
# times; if the entry is already present it changes nothing and exits 0.
#
# It is NOT needed inside the Compose network — there, the `proxy` service's
# network alias supplies the same name. This is purely for the host.
#
# Usage:  sudo ./scripts/ensure-hosts.sh
# =============================================================================

set -euo pipefail

HOSTS_FILE="${HOSTS_FILE:-/etc/hosts}"
HOSTNAME_TO_ADD="judicialsync.localhost"
MARKER="# JudicialSync — single TLS origin (scripts/ensure-hosts.sh)"

# Already resolvable through the hosts file? Match the hostname as a whole
# word so `judicialsync.localhost.example` would not count as a hit.
if grep -qE "^[^#]*[[:space:]]${HOSTNAME_TO_ADD}([[:space:]]|$)" "$HOSTS_FILE" 2>/dev/null; then
  echo "ok: ${HOSTNAME_TO_ADD} is already mapped in ${HOSTS_FILE}"
  exit 0
fi

if [ ! -w "$HOSTS_FILE" ]; then
  cat >&2 <<EOF
error: cannot write ${HOSTS_FILE}

${HOSTNAME_TO_ADD} is not mapped and this process cannot add it. Re-run with
elevated privileges:

    sudo ./scripts/ensure-hosts.sh

Or add the line by hand:

    127.0.0.1 ${HOSTNAME_TO_ADD}
EOF
  exit 1
fi

{
  echo ""
  echo "$MARKER"
  echo "127.0.0.1 ${HOSTNAME_TO_ADD}"
  echo "::1 ${HOSTNAME_TO_ADD}"
} >>"$HOSTS_FILE"

echo "added: 127.0.0.1 ${HOSTNAME_TO_ADD} -> ${HOSTS_FILE}"
