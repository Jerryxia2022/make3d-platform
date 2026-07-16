import { copyFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";

const args = new Map();

for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const phase = normalizePhase(args.get("--phase"));
const type = args.get("--type");

if (!phase || !["design", "final"].includes(type || "")) {
  console.error("Usage: node scripts/create-phase-report.mjs --phase 04 --type design|final");
  process.exit(1);
}

const reportsDir = join(process.cwd(), "reports");
const template =
  type === "design"
    ? join(reportsDir, "phase-report-template.md")
    : join(reportsDir, "phase-final-template.md");
const target = join(reportsDir, `phase${phase}-${type}.md`);

await mkdir(reportsDir, { recursive: true });

if (await exists(target)) {
  console.error(`Refusing to overwrite existing report: ${target}`);
  process.exit(1);
}

await copyFile(template, target);
console.log(target);

function normalizePhase(value) {
  if (!value || !/^\d+$/.test(value)) {
    return "";
  }

  return value.padStart(2, "0");
}

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
