const TEST_MARKER_PATTERNS = [
  /\bM3DTEST\b/i,
  /\bPHASE\d{2}[_-][A-Z0-9_-]*TEST\b/i,
  /\bTEST[_-]ONLY\b/i,
  /\bsynthetic\b/i,
  /\btest[-_]slicer\b/i,
];

export function classifyTestSubject(input = {}) {
  const reasons = [];
  const customerFlag = normalizeAuthoritativeFlag(input.customerIsTestAccount);
  const orderFlag = normalizeAuthoritativeFlag(input.orderIsTestAccount);
  const flags = [customerFlag, orderFlag].filter((flag) => flag !== "missing");

  if (customerFlag === true) reasons.push("customer_is_test_account");
  if (orderFlag === true) reasons.push("order_is_test_account");

  if (input.customerId == null || String(input.customerId).trim() === "") {
    reasons.push("missing_customer_id");
  }

  if (customerFlag === "missing" && orderFlag === "missing") {
    reasons.push("missing_authoritative_test_flag");
  }

  const markerReasons = findTestSourceMarkers(input.sourceMarkers || []);
  reasons.push(...markerReasons);

  const hasAuthoritativeTest = flags.includes(true);
  const hasAuthoritativeReal = flags.includes(false);
  const hasMarker = markerReasons.length > 0;
  const failClosed = reasons.includes("missing_customer_id") || reasons.includes("missing_authoritative_test_flag");

  return {
    isTest: hasAuthoritativeTest || hasMarker || failClosed,
    authoritativeTestFlag: hasAuthoritativeTest ? true : hasAuthoritativeReal ? false : null,
    failClosed,
    reasons,
  };
}

export function isRealCustomerEligibleByTestClassification(input = {}) {
  const classification = classifyTestSubject(input);
  return !classification.isTest && classification.authoritativeTestFlag === false && !classification.failClosed;
}

function normalizeAuthoritativeFlag(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["1", "true", "yes"].includes(normalized)) return true;
    if (["0", "false", "no"].includes(normalized)) return false;
  }
  return "missing";
}

function findTestSourceMarkers(values) {
  const reasons = [];
  for (const value of values) {
    const text = String(value || "");
    if (!text) continue;
    if (TEST_MARKER_PATTERNS.some((pattern) => pattern.test(text))) {
      reasons.push("test_source_marker");
      break;
    }
  }
  return reasons;
}
