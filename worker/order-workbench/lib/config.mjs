export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 5177;
export const DEFAULT_LOCAL_FILES_ROOT = "/srv/make3d-worker/files";
export const DEFAULT_WORKBENCH_DB_PATH = "/srv/make3d-worker/order-workbench/workbench.db";
export const DEFAULT_WORKER_ROOT = "/srv/make3d-worker";
export const DEFAULT_PRUSASLICER_BIN = "/usr/bin/prusa-slicer";
export const DEFAULT_PRUSASLICER_PROFILE_KEY = "bambu-p1s";
export const DEFAULT_PRUSASLICER_PROFILE_NAME = "Bambu P1S 0.4mm / 0.2mm / 50%";
export const DEFAULT_PRUSASLICER_PROFILE_PATH = "/srv/make3d-worker/config/prusaslicer/bambu-p1s.ini";

export function loadWorkbenchConfig(env = process.env, overrides = {}) {
  const host = String(overrides.host || env.MAKE3D_ORDER_WORKBENCH_HOST || DEFAULT_HOST).trim();
  const port = normalizePort(overrides.port || env.MAKE3D_ORDER_WORKBENCH_PORT || DEFAULT_PORT);
  const serverUrl = normalizeServerUrl(overrides.serverUrl || env.SERVER_URL || env.MAKE3D_SERVER_URL);
  const operatorToken = String(
    overrides.operatorToken || env.MAKE3D_LOCAL_WORKBENCH_TOKEN || "",
  ).trim();
  const localFilesRoot = String(
    overrides.localFilesRoot
      || env.LOCAL_ORDER_FILES_ROOT
      || env.MAKE3D_LOCAL_FILES_ROOT
      || DEFAULT_LOCAL_FILES_ROOT,
  ).trim();
  const workbenchDbPath = String(
    overrides.workbenchDbPath || env.MAKE3D_ORDER_WORKBENCH_DB || DEFAULT_WORKBENCH_DB_PATH,
  ).trim();
  const workerRoot = String(overrides.workerRoot || env.MAKE3D_WORKER_ROOT || DEFAULT_WORKER_ROOT).trim();
  const prusaSlicerBin = String(
    overrides.prusaSlicerBin || env.MAKE3D_PRUSASLICER_BIN || DEFAULT_PRUSASLICER_BIN,
  ).trim();
  const profileKey = String(
    overrides.profileKey || env.MAKE3D_PRUSASLICER_PROFILE_KEY || DEFAULT_PRUSASLICER_PROFILE_KEY,
  ).trim();
  const profileName = String(
    overrides.profileName || env.MAKE3D_PRUSASLICER_PROFILE_NAME || DEFAULT_PRUSASLICER_PROFILE_NAME,
  ).trim();
  const profilePath = String(
    overrides.profilePath || env.MAKE3D_PRUSASLICER_PROFILE_PATH || DEFAULT_PRUSASLICER_PROFILE_PATH,
  ).trim();

  assertLoopbackHost(host);
  if (!serverUrl) throw new Error("SERVER_URL or MAKE3D_SERVER_URL is required");
  if (!operatorToken) throw new Error("MAKE3D_LOCAL_WORKBENCH_TOKEN is required");

  return {
    host,
    port,
    serverUrl,
    operatorToken,
    localFilesRoot,
    workbenchDbPath,
    workerRoot,
    prusaSlicerBin,
    profileKey,
    profileName,
    profilePath,
  };
}

export function assertLoopbackHost(host) {
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("Local Order Workbench must bind 127.0.0.1 or localhost only");
  }
}

function normalizeServerUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const url = new URL(text);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}

function normalizePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error("invalid local workbench port");
  }
  return port;
}
