#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
DATABASE_PATH="${DATABASE_PATH:-./data/make3d.db}"
UPLOADS_DIR="${UPLOADS_DIR:-./uploads}"
PROFILES_DIR="${PROFILES_DIR:-./profiles}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEST_DIR="${BACKUP_ROOT}/${TIMESTAMP}"

mkdir -p "${DEST_DIR}"

if [ -f "${DATABASE_PATH}" ]; then
  if command -v sqlite3 >/dev/null 2>&1; then
    sqlite3 "${DATABASE_PATH}" ".backup '${DEST_DIR}/make3d.db'"
  else
    cp "${DATABASE_PATH}" "${DEST_DIR}/make3d.db"
  fi
fi

if [ -d "${UPLOADS_DIR}" ]; then
  tar -czf "${DEST_DIR}/uploads.tar.gz" -C "$(dirname "${UPLOADS_DIR}")" "$(basename "${UPLOADS_DIR}")"
fi

if [ -d "${PROFILES_DIR}" ]; then
  tar -czf "${DEST_DIR}/profiles.tar.gz" -C "$(dirname "${PROFILES_DIR}")" "$(basename "${PROFILES_DIR}")"
fi

cat > "${DEST_DIR}/manifest.txt" <<EOF
Make3D backup
created_at=${TIMESTAMP}
database=${DATABASE_PATH}
uploads=${UPLOADS_DIR}
profiles=${PROFILES_DIR}
EOF

echo "Backup created: ${DEST_DIR}"
