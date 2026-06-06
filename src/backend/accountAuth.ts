import {
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  createCustomerSessionToken,
  verifyCustomerSessionToken,
  verifyCustomerSessionTokenDetailed,
} from "./customerSessionCore.js";

export const CUSTOMER_SESSION_COOKIE = "customer_session";
export {
  CUSTOMER_SESSION_MAX_AGE_SECONDS,
  createCustomerSessionToken,
  verifyCustomerSessionToken,
  verifyCustomerSessionTokenDetailed,
};

export function getCustomerCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: CUSTOMER_SESSION_MAX_AGE_SECONDS,
  };
}

export function createCustomerLoginRedirectResponse(sessionToken: string) {
  const response = new Response(null, {
    status: 303,
    headers: { Location: "/quote" },
  });
  setCustomerSessionCookie(response, sessionToken);

  return response;
}

export function setCustomerSessionCookie(response: Response, sessionToken: string) {
  response.headers.append(
    "Set-Cookie",
    serializeCookie(CUSTOMER_SESSION_COOKIE, sessionToken, getCustomerCookieOptions()),
  );

  return response;
}

export function createCustomerLogoutResponse(status = 200, location?: string) {
  const headers = new Headers({
    "Set-Cookie": `${CUSTOMER_SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=lax`,
  });

  if (location) {
    headers.set("Location", location);
  }

  return new Response(null, { status, headers });
}

export function getCustomerFromRequestCookie(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);

  if (!token) {
    return null;
  }

  const decodedToken = decodeCookieValue(token);
  const result = verifyCustomerSessionTokenDetailed(decodedToken);

  if (!result.session) {
    logCustomerSessionVerifyFailure(decodedToken, result.error || "unknown verify error");
  }

  return result.session;
}

export function getCustomerSessionDiagnostics(request: Request) {
  const token = getCustomerSessionTokenFromRequest(request);
  const decodedToken = token ? decodeCookieValue(token) : "";
  const result = verifyCustomerSessionTokenDetailed(decodedToken || undefined);

  return {
    customerSessionExists: Boolean(token),
    tokenPrefix: decodedToken ? decodedToken.slice(0, 20) : "",
    verifyErrorMessage: result.session ? null : result.error || "unknown verify error",
    sessionSecretExists: Boolean(process.env.SESSION_SECRET),
    nodeEnv: process.env.NODE_ENV || "",
    appUrl: process.env.APP_URL || "",
    cookieSecure: process.env.COOKIE_SECURE || "",
  };
}

export function logCustomerSessionDiagnostics(label: string, request: Request) {
  console.warn(label, getCustomerSessionDiagnostics(request));
}

function getCustomerSessionTokenFromRequest(request: Request) {
  const cookieHeader = request.headers.get("Cookie") || "";
  return cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CUSTOMER_SESSION_COOKIE}=`))
    ?.slice(CUSTOMER_SESSION_COOKIE.length + 1);
}

function decodeCookieValue(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function logCustomerSessionVerifyFailure(token: string, error: string) {
  console.warn("[make3d] customer session verify failed", {
    customerSessionExists: true,
    tokenPrefix: token.slice(0, 12),
    verifyErrorMessage: error,
    sessionSecretExists: Boolean(process.env.SESSION_SECRET),
  });
}

function serializeCookie(
  name: string,
  value: string,
  options: ReturnType<typeof getCustomerCookieOptions>,
) {
  const parts = [`${name}=${value}`, `Path=${options.path}`, `Max-Age=${options.maxAge}`];

  if (options.httpOnly) {
    parts.push("HttpOnly");
  }

  if (options.secure) {
    parts.push("Secure");
  }

  parts.push(`SameSite=${options.sameSite}`);
  return parts.join("; ");
}
