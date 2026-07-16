#!/bin/bash
set -euo pipefail

RED="\033[31m"
GREEN="\033[32m"
BLUE="\033[34m"
RESET="\033[0m"

info() { echo -e "${BLUE}INFO${RESET} $*"; }
success() { echo -e "${GREEN}SUCCESS${RESET} $*"; }
error() { echo -e "${RED}ERROR${RESET} $*" >&2; }

REPO_DIR="/mnt/c/Users/21899/Documents/make3d-platform"
ROOT_DIR="/srv/make3d-worker/test-integration/phase05-h-c"
DB_PATH="${ROOT_DIR}/db/make3d-test.db"
SOURCE_STL="/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl"
PROFILE_PATH="/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini"
TOKEN_FILE="${ROOT_DIR}/logs/slicing-worker-token.env"
NEXT_LOG="${ROOT_DIR}/logs/next.log"
DRIVER_LOG="${ROOT_DIR}/logs/driver.log"
DRIVER_JSON="${ROOT_DIR}/logs/driver.json"
SERVICE_BEFORE="${ROOT_DIR}/logs/file-sync-worker-before.txt"
SERVICE_AFTER="${ROOT_DIR}/logs/file-sync-worker-after.txt"
API_URL="http://127.0.0.1:3100"
NEXT_PID=""

cleanup() {
  local status=$?
  if [[ -n "${NEXT_PID}" ]] && kill -0 "${NEXT_PID}" >/dev/null 2>&1; then
    info "Stopping local Next.js PID ${NEXT_PID}"
    kill "${NEXT_PID}" >/dev/null 2>&1 || true
    wait "${NEXT_PID}" >/dev/null 2>&1 || true
  fi
  rm -f "${TOKEN_FILE}"
  if [[ ${status} -ne 0 ]]; then
    error "Phase05-H-C attempt isolation integration failed"
  fi
  exit "${status}"
}
trap cleanup EXIT

info "Checking Phase05-H-C integration environment"
if [[ ! -d "${REPO_DIR}" ]]; then
  error "Repo not found: ${REPO_DIR}"
  exit 1
fi
if [[ ! -d "/srv/make3d-worker" ]]; then
  error "Worker root not found: /srv/make3d-worker"
  exit 1
fi
if [[ ! -x "/usr/bin/prusa-slicer" ]]; then
  error "PrusaSlicer not found: /usr/bin/prusa-slicer"
  exit 1
fi
if [[ ! -f "${SOURCE_STL}" ]]; then
  error "Synthetic STL not found: ${SOURCE_STL}"
  exit 1
fi
if [[ ! -f "${PROFILE_PATH}" ]]; then
  error "PrusaSlicer profile not found: ${PROFILE_PATH}"
  exit 1
fi

if [[ ! -d "${ROOT_DIR}" ]]; then
  sudo mkdir -p "${ROOT_DIR}"
  sudo chown "$(id -u):$(id -g)" "${ROOT_DIR}"
fi
mkdir -p "${ROOT_DIR}/"{files,processing,results,failed,logs,db}
chmod 750 "${ROOT_DIR}" "${ROOT_DIR}/files" "${ROOT_DIR}/processing" "${ROOT_DIR}/results" "${ROOT_DIR}/failed" "${ROOT_DIR}/logs" "${ROOT_DIR}/db"

info "Recording existing file sync Worker status before integration"
systemctl status make3d-file-sync-worker.service --no-pager > "${SERVICE_BEFORE}" 2>&1 || true
BEFORE_ACTIVE="$(systemctl is-active make3d-file-sync-worker.service || true)"
BEFORE_PID="$(systemctl show -p MainPID --value make3d-file-sync-worker.service 2>/dev/null || true)"
if [[ "${BEFORE_ACTIVE}" != "active" ]]; then
  error "make3d-file-sync-worker.service is not active before integration"
  exit 1
fi
info "make3d-file-sync-worker.service before: active, PID ${BEFORE_PID}"

info "Using isolated H-C test database: ${DB_PATH}"
rm -f "${DB_PATH}"

SLICER_VERSION="$(dpkg-query -W -f='${Version}' prusa-slicer)"
if [[ -z "${SLICER_VERSION}" ]]; then
  error "Could not determine prusa-slicer package version"
  exit 1
fi

TEST_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
cat > "${TOKEN_FILE}" <<EOF
WORKER_TOKEN=${TEST_TOKEN}
EOF
chmod 600 "${TOKEN_FILE}"

cd "${REPO_DIR}"
if [[ ! -d "${REPO_DIR}/.next" ]]; then
  error "Built .next directory is missing; run npm run build before local integration"
  exit 1
fi

info "Starting local Next.js API on 127.0.0.1:3100 from existing build"
DATABASE_URL="file:${DB_PATH}" \
MAKE3D_WORKER_TOKEN="${TEST_TOKEN}" \
npm run start -- -H 127.0.0.1 -p 3100 > "${NEXT_LOG}" 2>&1 &
NEXT_PID=$!

for attempt in $(seq 1 60); do
  if curl -fsS -H "Authorization: Bearer ${TEST_TOKEN}" "${API_URL}/api/worker/slicing/jobs/pending" >/dev/null 2>&1; then
    success "Local API is ready"
    break
  fi
  if ! kill -0 "${NEXT_PID}" >/dev/null 2>&1; then
    error "Next.js exited before becoming ready"
    tail -80 "${NEXT_LOG}" || true
    exit 1
  fi
  if [[ "${attempt}" == "60" ]]; then
    error "Local API did not become ready"
    tail -80 "${NEXT_LOG}" || true
    exit 1
  fi
  sleep 2
done

info "Running Phase05-H-C attempt isolation driver"
set +e
PHASE05_HC_DB_PATH="${DB_PATH}" \
PHASE05_HC_ROOT_DIR="${ROOT_DIR}" \
PHASE05_HC_SOURCE_STL="${SOURCE_STL}" \
PHASE05_HC_PROFILE_PATH="${PROFILE_PATH}" \
PHASE05_HC_SLICER_VERSION="${SLICER_VERSION}" \
SERVER_URL="${API_URL}" \
WORKER_TOKEN="${TEST_TOKEN}" \
WORKER_ID="wsl-worker-01" \
node --experimental-strip-types --experimental-specifier-resolution=node scripts/phase05-h-c-attempt-isolation-driver.mjs > "${DRIVER_JSON}" 2> "${DRIVER_LOG}"
DRIVER_EXIT=$?
set -e

if [[ "${DRIVER_EXIT}" -ne 0 ]]; then
  error "Phase05-H-C driver exited with ${DRIVER_EXIT}"
  tail -160 "${DRIVER_LOG}" || true
  exit "${DRIVER_EXIT}"
fi
success "Phase05-H-C attempt isolation driver passed"

info "Recording existing file sync Worker status after integration"
systemctl status make3d-file-sync-worker.service --no-pager > "${SERVICE_AFTER}" 2>&1 || true
AFTER_ACTIVE="$(systemctl is-active make3d-file-sync-worker.service || true)"
AFTER_PID="$(systemctl show -p MainPID --value make3d-file-sync-worker.service 2>/dev/null || true)"
if [[ "${AFTER_ACTIVE}" != "active" ]]; then
  error "make3d-file-sync-worker.service is not active after integration"
  exit 1
fi
if [[ "${AFTER_PID}" != "${BEFORE_PID}" ]]; then
  error "make3d-file-sync-worker.service PID changed from ${BEFORE_PID} to ${AFTER_PID}"
  exit 1
fi

success "Phase05-H-C attempt isolation integration passed"
info "Driver summary: ${DRIVER_JSON}"
info "Driver stderr log: ${DRIVER_LOG}"
info "Next log: ${NEXT_LOG}"
info "File sync Worker before: ${SERVICE_BEFORE}"
info "File sync Worker after: ${SERVICE_AFTER}"
