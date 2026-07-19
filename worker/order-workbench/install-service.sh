#!/usr/bin/env bash
set -euo pipefail

WORKBENCH_USER="make3d-worker"
WORKBENCH_ENV="/etc/make3d-order-workbench.env"
SERVICE_NAME="make3d-order-workbench.service"
SERVICE_PATH="/etc/systemd/system/${SERVICE_NAME}"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
UNIT_TEMPLATE="${SCRIPT_DIR}/systemd/${SERVICE_NAME}.in"
WSL_INTEROP_TEMPLATE="${SCRIPT_DIR}/systemd/WSLInterop.conf"
WSL_INTEROP_CONFIG="/usr/lib/binfmt.d/WSLInterop.conf"

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

if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  if [[ ! -f "${WSL_INTEROP_TEMPLATE}" ]]; then
    echo "WSL interop binfmt template is missing." >&2
    exit 1
  fi
  install -o root -g root -m 0644 "${WSL_INTEROP_TEMPLATE}" "${WSL_INTEROP_CONFIG}"
  if [[ ! -e /proc/sys/fs/binfmt_misc/WSLInterop ]]; then
    printf ':WSLInterop:M::MZ::/init:PF' > /proc/sys/fs/binfmt_misc/register
  fi
fi

install -d -o "${WORKBENCH_USER}" -g "${WORKBENCH_USER}" -m 0750 \
  /srv/make3d-worker/order-workbench \
  /srv/make3d-worker/order-workbench/backups

operator_user="${MAKE3D_WORKBENCH_OPERATOR_USER:-${SUDO_USER:-}}"
if [[ -n "${operator_user}" && "${operator_user}" != "root" ]] && id -u "${operator_user}" >/dev/null 2>&1; then
  usermod -a -G "${WORKBENCH_USER}" "${operator_user}"
fi

# Windows Explorer reaches WSL files as the default WSL user. Keep customer
# files private to the Worker group while allowing the explicitly enrolled
# local operator to traverse order directories and read the selected file.
chgrp -R "${WORKBENCH_USER}" /srv/make3d-worker/files
find /srv/make3d-worker/files -type d -exec chmod 0750 {} +
find /srv/make3d-worker/files -type f -exec chmod 0640 {} +

chown root:"${WORKBENCH_USER}" "${WORKBENCH_ENV}"
chmod 0640 "${WORKBENCH_ENV}"

escaped_repo_root="${REPO_ROOT//|/\\|}"
sed "s|@REPO_ROOT@|${escaped_repo_root}|g" "${UNIT_TEMPLATE}" \
  | install -o root -g root -m 0644 /dev/stdin "${SERVICE_PATH}"

systemctl daemon-reload
systemctl enable "${SERVICE_NAME}"

echo "Installed and enabled ${SERVICE_NAME}."
echo "Start it with: sudo systemctl start ${SERVICE_NAME}"
