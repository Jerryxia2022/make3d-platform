#!/bin/bash
set -e

RED="\033[0;31m"
GREEN="\033[0;32m"
BLUE="\033[0;34m"
NC="\033[0m"

PROXY_WARNING=$'\u68c0\u6d4b\u5230\u4ee3\u7406\u53d8\u91cf\uff0c\u8bf7\u786e\u8ba4VPN\u5df2\u7ecf\u5173\u95ed\u3002'
DONE_MESSAGE=$'PrusaSlicer\u5b89\u88c5\u5b8c\u6210\uff0c\u8bf7\u91cd\u65b0\u5f00\u542fVPN\u540e\u7ee7\u7eed\u6d4b\u8bd5\u3002'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
REPORT_DIR="${PROJECT_ROOT}/reports"
LOG_DIR="${PROJECT_ROOT}/logs"
RESULT_REPORT="${REPORT_DIR}/phase05-install-result.md"

CURRENT_STEP="init"
START_TIME="$(date -Is)"

mkdir -p "${REPORT_DIR}" "${LOG_DIR}"

info() {
  echo -e "${BLUE}[INFO]${NC} $*"
}

success() {
  echo -e "${GREEN}[SUCCESS]${NC} $*"
}

error() {
  echo -e "${RED}[ERROR]${NC} $*" >&2
}

write_result_report() {
  local status="$1"
  local message="$2"
  local prusa_path=""
  local prusa_version=""
  local ubuntu_version=""
  local dependency_result="not checked"

  if [ -f /etc/os-release ]; then
    ubuntu_version="$(. /etc/os-release && echo "${PRETTY_NAME}")"
  fi

  if command -v prusa-slicer >/dev/null 2>&1; then
    prusa_path="$(command -v prusa-slicer)"
    prusa_version="$(prusa-slicer --help 2>/dev/null | head -1 || true)"
    if [ -n "${prusa_path}" ] && ldd "${prusa_path}" 2>/dev/null | grep -q "not found"; then
      dependency_result="missing dependencies detected"
    else
      dependency_result="no missing dependencies detected"
    fi
  else
    prusa_path="not installed"
    prusa_version="not installed"
  fi

  cat > "${RESULT_REPORT}" <<EOF_REPORT
# Phase05-A PrusaSlicer Install Result

Execution time: $(date -Is)
Start time: ${START_TIME}
Status: ${status}

## Summary

${message}

## Environment

Ubuntu:

\`\`\`text
${ubuntu_version}
\`\`\`

Current user:

\`\`\`text
$(whoami)
\`\`\`

## PrusaSlicer

Binary path:

\`\`\`text
${prusa_path}
\`\`\`

Version:

\`\`\`text
${prusa_version}
\`\`\`

Dependency check:

\`\`\`text
${dependency_result}
\`\`\`

## Logs

\`\`\`text
${LOG_DIR}
\`\`\`

Known logs:

\`\`\`text
logs/phase05-network-archive.log
logs/phase05-network-security.log
logs/phase05-apt-sources.log
logs/phase05-apt-policy-prusa-slicer.log
logs/phase05-apt-update.log
logs/phase05-prusaslicer-install.log
logs/phase05-prusaslicer-version.log
logs/version-help.log
logs/phase05-prusaslicer-help.log
logs/phase05-prusaslicer-ldd.log
\`\`\`

## Failed Or Last Step

\`\`\`text
${CURRENT_STEP}
\`\`\`

## Safety

This script does not intentionally modify:
- Make3D production code
- databases
- WeChat Pay
- upload limits
- quote logic
- Windows proxy settings
- Clash/Mihomo configuration
- WSL network mode
- persistent DNS files

## Next Step

$(if [ "${status}" = "success" ]; then echo "${DONE_MESSAGE}"; else echo "Fix the failed step above, keep VPN/proxy disabled for APT access, then rerun this script."; fi)
EOF_REPORT
}

on_error() {
  local exit_code=$?
  error "Step failed: ${CURRENT_STEP} (exit ${exit_code})"
  write_result_report "failed" "Installation stopped at step: ${CURRENT_STEP}. Exit code: ${exit_code}."
  error "Result report written: ${RESULT_REPORT}"
  exit "${exit_code}"
}

trap on_error ERR

run_logged() {
  local log_file="$1"
  shift
  "$@" >"${log_file}" 2>&1
}

require_command() {
  local name="$1"
  command -v "${name}" >/dev/null 2>&1
}

info "Phase05-A PrusaSlicer offline install script started."
info "Project root: ${PROJECT_ROOT}"

CURRENT_STEP="Step 1 environment check"
info "${CURRENT_STEP}"

if [ ! -f /etc/os-release ]; then
  error "/etc/os-release not found."
  exit 1
fi

. /etc/os-release

if [ "${ID:-}" != "ubuntu" ]; then
  error "This script must run inside Ubuntu WSL."
  exit 1
fi

if ! grep -qi "microsoft\\|wsl" /proc/version; then
  error "This environment does not look like WSL."
  exit 1
fi

info "Ubuntu: ${PRETTY_NAME}"
info "Kernel: $(uname -r)"
info "Current user: $(whoami)"
df -h / /srv 2>/dev/null || df -h /

if ! require_command systemctl; then
  error "systemctl not found."
  exit 1
fi

SYSTEMD_STATE="$(systemctl is-system-running 2>/dev/null || true)"
info "systemd state: ${SYSTEMD_STATE}"
if [ "${SYSTEMD_STATE}" != "running" ] && [ "${SYSTEMD_STATE}" != "degraded" ]; then
  error "systemd is not running."
  exit 1
fi

if systemctl list-unit-files make3d-file-sync-worker.service >/dev/null 2>&1; then
  WORKER_STATE="$(systemctl is-active make3d-file-sync-worker.service 2>/dev/null || true)"
  info "make3d-file-sync-worker.service: ${WORKER_STATE}"
else
  info "make3d-file-sync-worker.service not found in this WSL environment."
fi

CURRENT_STEP="Step 2 proxy detection"
info "${CURRENT_STEP}"

PROXY_FOUND=0
for key in HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy; do
  if [ -n "${!key:-}" ]; then
    PROXY_FOUND=1
    info "${key} is set in current shell."
  fi
done

if [ "${PROXY_FOUND}" -eq 1 ]; then
  error "${PROXY_WARNING}"
  info "Unsetting proxy variables only for this shell."
  unset HTTP_PROXY HTTPS_PROXY ALL_PROXY http_proxy https_proxy all_proxy
else
  success "No proxy environment variables detected."
fi

CURRENT_STEP="Step 3 network check"
info "${CURRENT_STEP}"

run_logged "${LOG_DIR}/phase05-network-archive.log" curl -I --max-time 30 https://archive.ubuntu.com
success "archive.ubuntu.com reachable."

run_logged "${LOG_DIR}/phase05-network-security.log" curl -I --max-time 30 https://security.ubuntu.com
success "security.ubuntu.com reachable."

CURRENT_STEP="Step 4 apt update"
info "${CURRENT_STEP}"

{
  echo "Generated at: $(date -Is)"
  echo "== /etc/apt sources =="
  find /etc/apt -maxdepth 2 -type f \( -name "*.sources" -o -name "*.list" \) -print -exec sed -n '1,160p' {} \;
} > "${LOG_DIR}/phase05-apt-sources.log" 2>&1

run_logged "${LOG_DIR}/phase05-apt-policy-prusa-slicer.log" apt-cache policy prusa-slicer

if ! apt-cache show prusa-slicer 2>/dev/null | grep -q "^Origin: Ubuntu$"; then
  error "prusa-slicer candidate does not show Origin: Ubuntu in apt metadata."
  exit 1
fi

run_logged "${LOG_DIR}/phase05-apt-update.log" sudo apt update
success "APT update completed."

CURRENT_STEP="Step 5 install PrusaSlicer"
info "${CURRENT_STEP}"
run_logged "${LOG_DIR}/phase05-prusaslicer-install.log" sudo apt install -y --no-install-recommends prusa-slicer
success "PrusaSlicer package installed."

CURRENT_STEP="Step 6 CLI verification"
info "${CURRENT_STEP}"

PRUSA_PATH="$(command -v prusa-slicer)"
if [ -z "${PRUSA_PATH}" ]; then
  error "prusa-slicer binary not found after installation."
  exit 1
fi

which prusa-slicer | tee "${LOG_DIR}/phase05-prusaslicer-path.log"
set +e
prusa-slicer --version > "${LOG_DIR}/phase05-prusaslicer-version.log" 2>&1
VERSION_DIAGNOSTIC_EXIT=$?
set -e
info "prusa-slicer --version diagnostic exit code: ${VERSION_DIAGNOSTIC_EXIT}"

prusa-slicer --help > "${LOG_DIR}/version-help.log" 2>&1
cp "${LOG_DIR}/version-help.log" "${LOG_DIR}/phase05-prusaslicer-help.log"
PRUSA_HELP_HEAD="$(sed -n '1,20p' "${LOG_DIR}/version-help.log")"
if ! printf '%s\n' "${PRUSA_HELP_HEAD}" | grep -q "PrusaSlicer-"; then
  error "PrusaSlicer help output does not contain version banner."
  exit 1
fi
if ! printf '%s\n' "${PRUSA_HELP_HEAD}" | grep -q "Usage: prusa-slicer"; then
  error "PrusaSlicer help output does not contain usage line."
  exit 1
fi

ldd "${PRUSA_PATH}" > "${LOG_DIR}/phase05-prusaslicer-ldd.log" 2>&1

if grep -q "not found" "${LOG_DIR}/phase05-prusaslicer-ldd.log"; then
  error "Missing dynamic dependencies detected. See logs/phase05-prusaslicer-ldd.log."
  exit 1
fi

success "PrusaSlicer CLI verification completed."

CURRENT_STEP="Step 7 create worker directories"
info "${CURRENT_STEP}"

sudo mkdir -p \
  /srv/make3d-worker/config/prusaslicer \
  /srv/make3d-worker/processing/prusaslicer \
  /srv/make3d-worker/test-slicer

if id make3d-worker >/dev/null 2>&1; then
  sudo chown -R make3d-worker:make3d-worker \
    /srv/make3d-worker/config/prusaslicer \
    /srv/make3d-worker/processing/prusaslicer \
    /srv/make3d-worker/test-slicer
fi

sudo chmod 0750 \
  /srv/make3d-worker/config/prusaslicer \
  /srv/make3d-worker/processing/prusaslicer \
  /srv/make3d-worker/test-slicer

success "Worker PrusaSlicer directories are ready."

CURRENT_STEP="Step 8 generate result report"
info "${CURRENT_STEP}"
write_result_report "success" "PrusaSlicer CLI installation and validation completed successfully."
success "Result report written: ${RESULT_REPORT}"
success "${DONE_MESSAGE}"
