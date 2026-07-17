export function createCloudClient(config, options = {}) {
  const fetchImpl = options.fetchImpl || fetch;
  const serverUrl = normalizeServerUrl(config.serverUrl);
  const operatorToken = String(config.operatorToken || "").trim();
  if (!serverUrl) throw new Error("serverUrl is required");
  if (!operatorToken) throw new Error("operator token is required");

  async function requestJson(path) {
    const response = await fetchImpl(new URL(path, serverUrl), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${operatorToken}`,
        Accept: "application/json",
      },
    });
    const text = await response.text();
    let payload;
    try {
      payload = text ? JSON.parse(text) : {};
    } catch {
      throw new Error(`cloud API returned non-JSON status ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(redactString(`cloud API failed: ${response.status} ${JSON.stringify(payload)}`));
    }
    return payload;
  }

  return {
    listOrders(query = {}) {
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(query)) {
        if (value != null && String(value).trim()) params.set(key, String(value));
      }
      const suffix = params.size ? `?${params}` : "";
      return requestJson(`/api/operator/workbench/orders${suffix}`);
    },
    getOrder(id) {
      return requestJson(`/api/operator/workbench/orders/${encodeURIComponent(String(id))}`);
    },
  };
}

function redactString(value) {
  return String(value || "")
    .replace(/Authorization\s*:\s*Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Authorization: Bearer [REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/\b(token|secret|api[_-]?v?3?[_-]?key|private[_-]?key)\s*[:=]\s*["']?[^"',\s]+["']?/gi, "$1=[REDACTED]")
    .replace(/\b1[3-9]\d{9}\b/g, "[REDACTED]")
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "[REDACTED]");
}

function normalizeServerUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const url = new URL(text);
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url.toString();
}
