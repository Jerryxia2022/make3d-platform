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
ROOT_DIR="/srv/make3d-worker/test-integration/phase05-h-a"
DB_PATH="${ROOT_DIR}/db/make3d-test.db"
SOURCE_STL="/srv/make3d-worker/test-slicer/input/test-cube-20mm.stl"
PROFILE_PATH="/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini"
TOKEN_FILE="${ROOT_DIR}/slicing-worker.env"
NEXT_LOG="${ROOT_DIR}/logs/next.log"
WORKER_LOG="${ROOT_DIR}/logs/slicing-worker.log"
SEED_JSON="${ROOT_DIR}/logs/seed.json"
VERIFY_JSON="${ROOT_DIR}/logs/verify.json"
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
    error "Phase05-H-A local integration failed"
  fi
  exit "${status}"
}
trap cleanup EXIT

info "Checking WSL local integration environment"
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

if [[ ! -f "${REPO_DIR}/worker/prusaslicer-result-parser.mjs" ]]; then
  error "Parser not found in repo"
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

info "Existing file sync Worker status will be observed only"
systemctl is-active make3d-file-sync-worker.service >/dev/null 2>&1 && info "make3d-file-sync-worker.service is active" || info "make3d-file-sync-worker.service is not active or systemd unavailable"

mkdir -p "${ROOT_DIR}/"{files,processing,results,failed,logs,db}
chmod 750 "${ROOT_DIR}" "${ROOT_DIR}/files" "${ROOT_DIR}/processing" "${ROOT_DIR}/results" "${ROOT_DIR}/failed" "${ROOT_DIR}/logs" "${ROOT_DIR}/db"

info "Using local test database: ${DB_PATH}"
rm -f "${DB_PATH}"

SLICER_VERSION="$(dpkg-query -W -f='${Version}' prusa-slicer)"
if [[ -z "${SLICER_VERSION}" ]]; then
  error "Could not determine prusa-slicer package version"
  exit 1
fi
info "PrusaSlicer package version: ${SLICER_VERSION}"

TEST_TOKEN="$(node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))")"
cat > "${TOKEN_FILE}" <<EOF
SERVER_URL=${API_URL}
WORKER_TOKEN=${TEST_TOKEN}
WORKER_ID=wsl-worker-01
ROOT_DIR=${ROOT_DIR}
PRUSASLICER_BIN=/usr/bin/prusa-slicer
EOF
chmod 600 "${TOKEN_FILE}"
info "Created local test Worker env file: ${TOKEN_FILE}"

cd "${REPO_DIR}"

info "Seeding synthetic TEST database records"
PHASE05_H_DB_PATH="${DB_PATH}" \
PHASE05_H_ROOT_DIR="${ROOT_DIR}" \
PHASE05_H_SOURCE_STL="${SOURCE_STL}" \
PHASE05_H_PROFILE_PATH="${PROFILE_PATH}" \
PHASE05_H_SLICER_VERSION="${SLICER_VERSION}" \
PHASE05_H_WORKER_ID="wsl-worker-01" \
node --experimental-strip-types --experimental-specifier-resolution=node scripts/phase05-h-a-seed.mjs > "${SEED_JSON}"

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

info "Running one-shot slicing Worker"
set +e
SERVER_URL="${API_URL}" \
WORKER_TOKEN="${TEST_TOKEN}" \
WORKER_ID="wsl-worker-01" \
ROOT_DIR="${ROOT_DIR}" \
PRUSASLICER_BIN="/usr/bin/prusa-slicer" \
node worker/make3d-slicing-worker.mjs --once > "${WORKER_LOG}" 2>&1
WORKER_EXIT=$?
set -e

if [[ "${WORKER_EXIT}" -ne 0 ]]; then
  error "Slicing Worker exited with ${WORKER_EXIT}"
  tail -120 "${WORKER_LOG}" || true
  exit "${WORKER_EXIT}"
fi
success "Slicing Worker completed"

info "Verifying final database and G-code state"
PHASE05_H_DB_PATH="${DB_PATH}" \
PHASE05_H_ROOT_DIR="${ROOT_DIR}" \
PHASE05_H_WORKER_LOG="${WORKER_LOG}" \
node --experimental-strip-types --experimental-specifier-resolution=node scripts/phase05-h-a-verify.mjs > "${VERIFY_JSON}"

success "Phase05-H-A local closed-loop integration passed"
info "Seed summary: ${SEED_JSON}"
info "Verify summary: ${VERIFY_JSON}"
info "Next log: ${NEXT_LOG}"
info "Worker log: ${WORKER_LOG}"
