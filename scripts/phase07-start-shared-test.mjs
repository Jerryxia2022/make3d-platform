#!/usr/bin/env node
import { randomBytes } from "node:crypto";
import { closeSync, copyFileSync, mkdirSync, openSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawn } from "node:child_process";

import {
  createCustomerAccount,
  initDatabase,
  markCustomerTestAccount,
} from "../src/backend/database.ts";
import { createCustomerSessionToken } from "../src/backend/customerSessionCore.js";
import { applyOrderWorkbenchWriteSchema } from "../src/backend/orderWorkbenchWriteSchema.ts";

const args = parseArgs(process.argv.slice(2));
const root = resolve(args.root);
const repoRoot = resolve(new URL("..", import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, "$1:"));
const databasePath = resolve(root, "data", "make3d.db");
const uploadsPath = resolve(root, "uploads");
const derivedPath = resolve(root, "derived-models");
const gcodePath = resolve(root, "gcode");
const logsPath = resolve(root, "logs");
const profilePath = resolve(root, "profiles", "bambu-p1s.ini");
const url = `http://${args.host}:${args.port}`;

for (const path of [root, resolve(root, "data"), uploadsPath, derivedPath, gcodePath, logsPath, resolve(root, "profiles")]) {
  mkdirSync(path, { recursive: true });
}
copyFileSync(resolve(repoRoot, "profiles", "bambu-p1s.ini"), profilePath);

const sessionSecret = randomBytes(48).toString("base64url");
const operatorToken = randomBytes(48).toString("base64url");
const password = randomBytes(18).toString("base64url");
const phone = "18800007001";
process.env.SESSION_SECRET = sessionSecret;

const db = initDatabase(databasePath);
let customer;
try {
  customer = createCustomerAccount(db, {
    phone,
    password,
    name: "Phase07SharedTest",
    wechat: "phase07-shared-test",
    email: "phase07-shared@example.invalid",
    defaultAddress: "",
  });
  markCustomerTestAccount(db, customer.id, true);
  applyOrderWorkbenchWriteSchema(db);
  const integrity = db.prepare("PRAGMA integrity_check").get().integrity_check;
  const foreignKeyCount = db.prepare("PRAGMA foreign_key_check").all().length;
  if (integrity !== "ok" || foreignKeyCount !== 0) throw new Error("isolated test database verification failed");
} finally {
  db.close();
}

const sessionToken = createCustomerSessionToken(customer.id);
writeFileSync(resolve(root, "cookies.txt"), `# Netscape HTTP Cookie File\n${args.host}\tFALSE\t/\tFALSE\t0\tcustomer_session\t${sessionToken}\n`, { mode: 0o600 });
writeFileSync(resolve(root, "runtime-secrets.json"), JSON.stringify({ phone, password, sessionSecret, operatorToken }, null, 2), { mode: 0o600 });

const wslBridge = toWslPath(resolve(repoRoot, "scripts", "prusaslicer-wsl-bridge.sh"));
const stdoutFd = openSync(resolve(logsPath, "app.stdout.log"), "a");
const stderrFd = openSync(resolve(logsPath, "app.stderr.log"), "a");
const child = spawn(process.execPath, [resolve(repoRoot, "node_modules", "next", "dist", "bin", "next"), "start", "-H", "0.0.0.0", "-p", String(args.port)], {
  cwd: repoRoot,
  detached: true,
  windowsHide: true,
  stdio: ["ignore", stdoutFd, stderrFd],
  env: {
    ...process.env,
    NODE_ENV: "production",
    APP_URL: url,
    DATABASE_URL: `file:${databasePath}`,
    UPLOAD_DIR: uploadsPath,
    DERIVED_MODEL_DIR: derivedPath,
    GCODE_DIR: gcodePath,
    SESSION_SECRET: sessionSecret,
    COOKIE_SECURE: "false",
    SMTP_HOST: "",
    SMTP_USER: "",
    SMTP_PASS: "",
    WECHAT_MP_ENABLED: "false",
    WECHAT_PAY_ENABLED: "false",
    WECHAT_PAY_TEST_ONLY: "true",
    MAKE3D_LOCAL_WORKBENCH_TOKEN: operatorToken,
    PRUSASLICER_ENABLED: "true",
    PRUSASLICER_BIN: "wsl.exe",
    PRUSASLICER_COMMAND_PREFIX_ARGS_JSON: JSON.stringify(["-d", "Ubuntu-24.04", "--", "bash", wslBridge]),
    PRUSASLICER_PATH_MODE: "wsl",
    PRUSASLICER_PROFILE_PATH: profilePath,
    SLICE_TIMEOUT_SECONDS: "120",
    MAX_SLICE_CONCURRENCY: "1",
  },
});
closeSync(stdoutFd);
closeSync(stderrFd);
child.unref();

const metadata = {
  started_at: new Date().toISOString(),
  url,
  pid: child.pid,
  commit: process.env.PHASE07_COMMIT || null,
  database_path: databasePath,
  uploads_path: uploadsPath,
  derived_path: derivedPath,
  gcode_path: gcodePath,
  profile_path: profilePath,
  stdout_log: resolve(logsPath, "app.stdout.log"),
  stderr_log: resolve(logsPath, "app.stderr.log"),
  test_customer_id: customer.id,
};
writeFileSync(resolve(root, "deployment.json"), `${JSON.stringify(metadata, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(metadata, null, 2)}\n`);

function parseArgs(argv) {
  const result = { root: "", host: "192.168.0.111", port: 3108 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") result.root = String(argv[++index] || "");
    else if (argv[index] === "--host") result.host = String(argv[++index] || "");
    else if (argv[index] === "--port") result.port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }
  if (!result.root) throw new Error("--root is required");
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(result.host)) throw new Error("--host must be an IPv4 address");
  if (!Number.isSafeInteger(result.port) || result.port < 1024 || result.port > 65535) throw new Error("--port is invalid");
  return result;
}

function toWslPath(path) {
  const normalized = path.replaceAll("\\", "/");
  const match = /^([A-Za-z]):\/(.*)$/.exec(normalized);
  return match ? `/mnt/${match[1].toLowerCase()}/${match[2]}` : normalized;
}
