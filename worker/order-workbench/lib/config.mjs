export const DEFAULT_HOST = "127.0.0.1";
export const DEFAULT_PORT = 5177;
export const DEFAULT_LOCAL_FILES_ROOT = "/srv/make3d-worker/files";

export function loadWorkbenchConfig(env = process.env, overrides = {}) {
  const host = String(overrides.host || env.MAKE3D_ORDER_WORKBENCH_HOST || DEFAULT_HOST).trim();
  const port = normalizePort(overrides.port || env.MAKE3D_ORDER_WORKBENCH_PORT || DEFAULT_PORT);
  const serverUrl = normalizeServerUrl(overrides.serverUrl || env.SERVER_URL || env.MAKE3D_SERVER_URL);
  const operatorToken = String(
    overrides.operatorToken || env.MAKE3D_LOCAL_WORKBENCH_TOKEN || "",
  ).trim();
  const localFilesRoot = String(
    overrides.localFilesRoot || env.MAKE3D_LOCAL_FILES_ROOT || DEFAULT_LOCAL_FILES_ROOT,
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
