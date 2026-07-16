#!/usr/bin/env bash
set -euo pipefail

WORKER_USER="make3d-worker"
WORKER_ROOT="/srv/make3d-worker"
ENV_PATH="/etc/make3d-worker.env"
ENV_EXAMPLE_PATH="/etc/make3d-worker.env.example"
SERVICE_PATH="/etc/systemd/system/make3d-file-sync-worker.service"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Please run as root, for example: sudo bash worker/install-worker.sh" >&2
  exit 1
fi

if ! id -u "${WORKER_USER}" >/dev/null 2>&1; then
  useradd --system --home-dir "${WORKER_ROOT}" --shell /usr/sbin/nologin "${WORKER_USER}"
fi

install -d -o "${WORKER_USER}" -g "${WORKER_USER}" -m 0750 "${WORKER_ROOT}"
for dir in incoming processing files failed logs; do
  install -d -o "${WORKER_USER}" -g "${WORKER_USER}" -m 0750 "${WORKER_ROOT}/${dir}"
done

install -o root -g root -m 0755 \
  "${REPO_ROOT}/worker/make3d-file-sync-worker.mjs" \
  "${WORKER_ROOT}/make3d-file-sync-worker.mjs"

install -o root -g root -m 0644 \
  "${REPO_ROOT}/worker/systemd/make3d-file-sync-worker.service" \
  "${SERVICE_PATH}"

install -o root -g root -m 0600 \
  "${REPO_ROOT}/worker/make3d-worker.env.example" \
  "${ENV_EXAMPLE_PATH}"

if [[ ! -f "${ENV_PATH}" ]]; then
  install -o root -g root -m 0600 \
    "${REPO_ROOT}/worker/make3d-worker.env.example" \
    "${ENV_PATH}"
  echo "Created ${ENV_PATH} with placeholder WORKER_TOKEN. Edit it before starting the service."
else
  echo "Kept existing ${ENV_PATH}; it was not overwritten."
fi

systemctl daemon-reload
echo "Installed ${SERVICE_PATH}."
echo "Enable/start only after ${ENV_PATH} contains the real Worker token."
