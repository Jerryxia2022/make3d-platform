#!/bin/bash
set -euo pipefail

source_path="${1:-}"
test_root="${2:-/srv/make3d-worker/test-slicer/phase07-step}"
profile_path="${PRUSASLICER_PROFILE:-/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "$source_path" || ! -f "$source_path" ]]; then
  echo "ERROR: STEP source file is missing" >&2
  exit 2
fi
if [[ ! -f "$profile_path" ]]; then
  echo "ERROR: PrusaSlicer profile is missing" >&2
  exit 3
fi

input_dir="$test_root/input"
output_dir="$test_root/output"
log_dir="$test_root/logs"
source_copy="$input_dir/04NF12.STEP"
direct_gcode="$output_dir/04NF12-direct.gcode"
derived_stl="$output_dir/04NF12-derived.stl"

sudo install -d -o make3d-worker -g make3d-worker -m 750 "$input_dir" "$output_dir" "$log_dir"
sudo install -o make3d-worker -g make3d-worker -m 600 "$source_path" "$source_copy"
rm -f "$direct_gcode" "$derived_stl"

if ! grep -aEiq '^ISO-10303-21;' "$source_copy" || ! grep -aEiq 'END-ISO-10303-21;[[:space:]]*$' "$source_copy"; then
  echo "ERROR: STEP Part 21 markers are invalid" >&2
  exit 4
fi

source_sha256="$(sha256sum "$source_copy" | awk '{print $1}')"
source_size="$(stat -c '%s' "$source_copy")"
started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

set +e
sudo -u make3d-worker timeout 120s /usr/bin/prusa-slicer \
  --export-stl \
  --output "$derived_stl" \
  "$source_copy" \
  >"$log_dir/export-stl-stdout.log" \
  2>"$log_dir/export-stl-stderr.log"
conversion_exit_code=$?

if [[ $conversion_exit_code -ne 0 || ! -s "$derived_stl" ]]; then
  set -e
  echo "ERROR: STEP to STL conversion failed with code $conversion_exit_code" >&2
  head -80 "$log_dir/export-stl-stderr.log" >&2
  exit 5
fi

sudo -u make3d-worker timeout 120s /usr/bin/prusa-slicer \
  --export-gcode \
  --load "$profile_path" \
  --output "$direct_gcode" \
  "$source_copy" \
  >"$log_dir/direct-stdout.log" \
  2>"$log_dir/direct-stderr.log"
direct_exit_code=$?
set -e

finished_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
gcode_size=0
gcode_sha256=""
if [[ -s "$direct_gcode" ]]; then
  gcode_size="$(stat -c '%s' "$direct_gcode")"
  gcode_sha256="$(sha256sum "$direct_gcode" | awk '{print $1}')"
fi
derived_stl_size="$(stat -c '%s' "$derived_stl")"
derived_stl_sha256="$(sha256sum "$derived_stl" | awk '{print $1}')"
dimensions_json="$(sudo -u make3d-worker node --experimental-strip-types --input-type=module -e '
  const modulePath = process.argv[1];
  const stlPath = process.argv[2];
  const { readStlDimensions } = await import(`file://${modulePath}`);
  process.stdout.write(JSON.stringify(await readStlDimensions(stlPath)));
' "$repo_root/src/backend/stlAnalysis.ts" "$derived_stl")"
parser_json="$(sudo -u make3d-worker node --experimental-strip-types --input-type=module -e '
  const modulePath = process.argv[1];
  const gcodePath = process.argv[2];
  const allowedRoot = process.argv[3];
  const { parsePrusaSlicerGcode } = await import(`file://${modulePath}`);
  const parsed = await parsePrusaSlicerGcode(gcodePath, {
    allowedRoots: [allowedRoot],
    sliceParams: {
      material: "PLA",
      printer_model: "Bambu Lab P1S",
      nozzle_diameter_microns: 400,
      layer_height_microns: 200,
      fill_density_percent: 50,
      support_mode: "none",
      brim_width_microns: 0,
    },
  });
  process.stdout.write(JSON.stringify({
    parse_status: parsed.parse.status,
    quote_ready: parsed.validation.quote_ready,
    print_time_seconds: parsed.result.print_time_seconds,
    filament_weight_mg: parsed.result.filament_weight_mg,
  }));
' "$repo_root/worker/prusaslicer-result-parser.mjs" "$direct_gcode" "$output_dir")"

printf '{\n' >"$log_dir/direct-summary.json"
printf '  "started_at": "%s",\n' "$started_at" >>"$log_dir/direct-summary.json"
printf '  "finished_at": "%s",\n' "$finished_at" >>"$log_dir/direct-summary.json"
printf '  "source_size_bytes": %s,\n' "$source_size" >>"$log_dir/direct-summary.json"
printf '  "source_sha256": "%s",\n' "$source_sha256" >>"$log_dir/direct-summary.json"
printf '  "conversion_exit_code": %s,\n' "$conversion_exit_code" >>"$log_dir/direct-summary.json"
printf '  "derived_stl_size_bytes": %s,\n' "$derived_stl_size" >>"$log_dir/direct-summary.json"
printf '  "derived_stl_sha256": "%s",\n' "$derived_stl_sha256" >>"$log_dir/direct-summary.json"
printf '  "derived_dimensions_mm": %s,\n' "$dimensions_json" >>"$log_dir/direct-summary.json"
printf '  "direct_exit_code": %s,\n' "$direct_exit_code" >>"$log_dir/direct-summary.json"
printf '  "gcode_size_bytes": %s,\n' "$gcode_size" >>"$log_dir/direct-summary.json"
printf '  "gcode_sha256": "%s",\n' "$gcode_sha256" >>"$log_dir/direct-summary.json"
printf '  "parser": %s\n' "$parser_json" >>"$log_dir/direct-summary.json"
printf '}\n' >>"$log_dir/direct-summary.json"
chmod 640 "$log_dir/direct-stdout.log" "$log_dir/direct-stderr.log" "$log_dir/export-stl-stdout.log" "$log_dir/export-stl-stderr.log" "$log_dir/direct-summary.json"
chown make3d-worker:make3d-worker "$log_dir/direct-stdout.log" "$log_dir/direct-stderr.log" "$log_dir/export-stl-stdout.log" "$log_dir/export-stl-stderr.log" "$log_dir/direct-summary.json"

cat "$log_dir/direct-summary.json"
echo "STDERR_BEGIN"
head -80 "$log_dir/direct-stderr.log"
echo "STDERR_END"
