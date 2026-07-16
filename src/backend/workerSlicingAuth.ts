import { createHash, timingSafeEqual } from "node:crypto";

export type SlicingWorkerAuthContext = {
  workerId: "wsl-worker-01";
};

export type SlicingWorkerAuthFailure = {
  ok: false;
  status: 401 | 403 | 503;
  code: "WORKER_AUTH_REQUIRED" | "WORKER_AUTH_INVALID" | "WORKER_DISABLED" | "WORKER_AUTH_NOT_CONFIGURED";
  message: string;
};

export type SlicingWorkerAuthResult =
  | {
      ok: true;
      context: SlicingWorkerAuthContext;
    }
  | SlicingWorkerAuthFailure;

export function authenticateSlicingWorkerRequest(request: Request): SlicingWorkerAuthResult {
  const expectedToken = process.env.MAKE3D_WORKER_TOKEN;

  if (!expectedToken || !expectedToken.trim()) {
    return {
      ok: false,
      status: 503,
      code: "WORKER_AUTH_NOT_CONFIGURED",
      message: "Worker authentication is not configured",
    };
  }

  const receivedToken = extractBearerToken(request);

  if (!receivedToken) {
    return {
      ok: false,
      status: 401,
      code: "WORKER_AUTH_REQUIRED",
      message: "Worker authentication is required",
    };
  }

  if (!safeTokenEqual(receivedToken, expectedToken)) {
    return {
      ok: false,
      status: 401,
      code: "WORKER_AUTH_INVALID",
      message: "Worker authentication failed",
    };
  }

  return {
    ok: true,
    context: {
      workerId: "wsl-worker-01",
    },
  };
}

function extractBearerToken(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

function safeTokenEqual(received: string, expected: string) {
  const receivedHash = createHash("sha256").update(received, "utf8").digest();
  const expectedHash = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(receivedHash, expectedHash);
}
