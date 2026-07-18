#!/usr/bin/env bash
set -euo pipefail

WORKBENCH_USER="make3d-worker"
WORKBENCH_ENV="/etc/make3d-order-workbench.env"
SERVICE_NAME="make3d-order-workbench.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UNIT_TEMPLATE="${SCRIPT_DIR}/systemd/${SERVICE_NAME}.in"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run with sudo: sudo bash worker/order-workbench/install-service.sh" >&2
  exit 1
fi

if ! id -u "${WORKBENCH_USER}" >/dev/null 2>&1; then
  echo "Required service user ${WORKBENCH_USER} does not exist." >&2
  exit 1
fi

if [[ ! -f "${WORKBENCH_ENV}" ]]; then
  echo "Required protected env file ${WORKBENCH_ENV} does not exist." >&2
  exit 1
fi

if [[ ! -f "${UNIT_TEMPLATE}" ]]; then
  echo "Service template is missing." >&2
  exit 1
fi

install -d -o "${WORKBENCH_USER}" -g "${WORKBENCH_USER}" -m 0750 \
  /srv/make3d-worker/order-workbench \
  /srv/make3d-worker/order-workbench/backups

chown root:"${WORKBENCH_USER}" "${WORKBENCH_ENV}"
chmod 0640 "${WORKBENCH_ENV}"

escaped_repo_root="${REPO_ROOT//|/\\|}"
sed "s|@REPO_ROOT@|${escaped_repo_root}|g" "${UNIT_TEMPLATE}" \
  | install -o root -g root -m 0644 /dev/stdin "${SERVICE_PATH}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "Installed and enabled ${SERVICE_NAME}."
echo "Start it with: sudo systemctl start ${SERVICE_NAME}"
