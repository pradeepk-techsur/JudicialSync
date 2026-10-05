#!/usr/bin/env bash
#
# Run the JudicialSync Rego policy suite.
#
# Self-bootstraps the OPA binary pinned to the same version as the Compose
# stack (openpolicyagent/opa:0.64.1-static) into .tools/, so this script works
# on a fresh clone and in CI with no prior setup.
#
# Exits non-zero on any check or test failure.
set -euo pipefail

OPA_VERSION="0.64.1"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TOOLS_DIR="${REPO_ROOT}/.tools"
OPA_BIN="${TOOLS_DIR}/opa"

cd "${REPO_ROOT}"

# Resolve the download URL for this platform. Only linux/amd64 and
# darwin/arm64 are needed today (CI and developer laptops); anything else gets
# a clear message rather than a confusing 404 from curl.
opa_download_url() {
	local os arch
	os="$(uname -s)"
	arch="$(uname -m)"

	case "${os}/${arch}" in
	Linux/x86_64) echo "https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_linux_amd64_static" ;;
	Linux/aarch64 | Linux/arm64) echo "https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_linux_arm64_static" ;;
	Darwin/arm64) echo "https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_darwin_arm64" ;;
	Darwin/x86_64) echo "https://openpolicyagent.org/downloads/v${OPA_VERSION}/opa_darwin_amd64" ;;
	*)
		echo "unsupported platform: ${os}/${arch}" >&2
		return 1
		;;
	esac
}

# Reuse an existing binary only if it is the pinned version — a stale .tools/opa
# from a different version would silently test against different semantics.
needs_install=1
if [[ -x "${OPA_BIN}" ]] && "${OPA_BIN}" version 2>/dev/null | grep -q "^Version: ${OPA_VERSION}$"; then
	needs_install=0
fi

if [[ "${needs_install}" -eq 1 ]]; then
	url="$(opa_download_url)"
	echo "==> Installing OPA ${OPA_VERSION} into .tools/"
	mkdir -p "${TOOLS_DIR}"
	curl -sSL --fail --retry 3 --retry-delay 2 -o "${OPA_BIN}.tmp" "${url}"
	chmod +x "${OPA_BIN}.tmp"
	mv "${OPA_BIN}.tmp" "${OPA_BIN}"
fi

echo "==> $("${OPA_BIN}" version | head -1)"

echo "==> opa check policy/"
"${OPA_BIN}" check policy/

echo "==> opa test policy/ -v"
"${OPA_BIN}" test policy/ -v

echo "==> Policy suite passed."
