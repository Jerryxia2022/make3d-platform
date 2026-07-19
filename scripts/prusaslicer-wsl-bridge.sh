#!/bin/bash
set -euo pipefail

PRUSASLICER_PATH="${PRUSASLICER_WSL_BIN:-/usr/bin/prusa-slicer}"

if [[ ! -x "$PRUSASLICER_PATH" ]]; then
  echo "PrusaSlicer executable is unavailable in WSL" >&2
  exit 127
fi

translate_path() {
  local value="$1"

  if [[ "$value" =~ ^[A-Za-z]:[\\/] ]]; then
    wslpath -a -u "$value"
    return
  fi

  printf '%s\n' "$value"
}

args=()
for value in "$@"; do
  args+=("$(translate_path "$value")")
done

exec "$PRUSASLICER_PATH" "${args[@]}"
