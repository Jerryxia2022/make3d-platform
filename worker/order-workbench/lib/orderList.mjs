const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

export function buildOrderListView({ orders = [], localOverviews = new Map(), details = new Map(), query = {}, now = new Date() }) {
  const normalizedQuery = normalizeQuery(query);
  const allRows = orders.map((order) => buildRow(order, localOverviews.get(Number(order.id)), details.get(Number(order.id))));
  const stats = buildStats(allRows, now);
  const filtered = allRows.filter((row) => matchesFilters(row, normalizedQuery, now));
  const sorted = [...filtered].sort(sorter(normalizedQuery.sort));
  const totalPages = Math.max(1, Math.ceil(sorted.length / normalizedQuery.pageSize));
  const page = Math.min(normalizedQuery.page, totalPages);
  const start = (page - 1) * normalizedQuery.pageSize;

  return {
    rows: sorted.slice(start, start + normalizedQuery.pageSize),
    stats,
    query: { ...normalizedQuery, page },
    pagination: {
      page,
      pageSize: normalizedQuery.pageSize,
      totalRows: sorted.length,
      totalPages,
      startRow: sorted.length ? start + 1 : 0,
      endRow: Math.min(start + normalizedQuery.pageSize, sorted.length),
    },
  };
}

export function requiresOrderDetailEnrichment(query = {}) {
  return Boolean(String(query.q || "").trim() || String(query.customer_reply || "").trim());
}

function buildRow(order, local, detail) {
  const fileSummary = order.file_sync_summary || {};
  const localState = String(local?.state || "UNREVIEWED");
  const sliceStatus = normalizeSliceStatus(local?.slice_status);
  const customerType = order.is_test_account === true ? "test" : order.is_test_account === false ? "real" : "unknown";
  const files = Array.isArray(detail?.files) ? detail.files : [];
  const requests = Array.isArray(detail?.customer_service_requests) ? detail.customer_service_requests : [];
  const replyState = deriveReplyState(localState, requests, local);
  const next = deriveNextStep({ order, fileSummary, localState, sliceStatus, replyState, local });
  const updatedAt = latestTimestamp(order.updated_at, local?.updated_at, local?.slice_updated_at, order.created_at);
  const filenameSearch = files.flatMap((file) => [file.original_filename, file.masked_filename]).filter(Boolean).join(" ");
  const customerLabel = customerType === "test" ? "TEST 客户" : customerType === "real" ? "真实客户" : "身份未确认";

  return {
    ...order,
    customerType,
    customerLabel,
    localState,
    sliceStatus,
    replyState,
    next,
    updatedAt,
    fileStatus: String(fileSummary.status || "unknown"),
    exception: next.severity === "blocker",
    searchBlob: [order.id, order.order_no, order.remark, customerLabel, filenameSearch].filter(Boolean).join(" ").toLowerCase(),
  };
}

function deriveNextStep({ order, fileSummary, localState, sliceStatus, replyState, local }) {
  if (["CLOSED"].includes(localState) || ["completed", "cancelled", "canceled"].includes(String(order.status || "").toLowerCase())) {
    return { key: "closed", label: "查看归档", detail: "订单已关闭或完成", severity: "done", priority: 90 };
  }
  if (["failed", "missing_sync_job", "no_files"].includes(String(fileSummary.status))) {
    return { key: "file-blocked", label: "处理文件异常", detail: "文件缺失、同步失败或尚无同步任务", severity: "blocker", priority: 10 };
  }
  if (["failed", "partial"].includes(sliceStatus) || ["FILE_PROBLEM", "SLICE_NEEDS_FIX"].includes(localState)) {
    return { key: "slice-blocked", label: "排查切片失败", detail: "检查模型、配置或解析器提示", severity: "blocker", priority: 20 };
  }
  if (replyState === "waiting") {
    return { key: "waiting-customer", label: "等待客户回复", detail: "已提出补充或重传要求", severity: "waiting", priority: 40 };
  }
  if (replyState === "received") {
    return { key: "customer-replied", label: "查看客户回复", detail: "客户消息晚于本地处理记录", severity: "action", priority: 30 };
  }
  if (fileSummary.status === "verified" && sliceStatus === "not_started") {
    return { key: "ready-to-slice", label: "审核并准备切片", detail: "文件已同步并通过校验", severity: "action", priority: 50 };
  }
  if (sliceStatus === "parsed") {
    return local?.confirmed_price_cents
      ? { key: "review-draft", label: "复核价格和货期", detail: "切片指标和本地草稿已就绪", severity: "action", priority: 60 }
      : { key: "ready-to-quote", label: "填写人工报价", detail: "切片指标已可用于人工审核", severity: "action", priority: 60 };
  }
  if (["READY_FOR_ONLINE_SYNC", "QUOTE_DRAFTED", "SLICE_CONFIRMED"].includes(localState)) {
    return { key: "review-draft", label: "复核本地草稿", detail: "检查价格、货期和回复", severity: "action", priority: 65 };
  }
  if (["REVIEWING", "SLICING"].includes(localState) || sliceStatus === "slicing") {
    return { key: "processing", label: "继续处理", detail: "本地操作正在进行", severity: "progress", priority: 70 };
  }
  return { key: "manual-review", label: "开始人工审核", detail: "检查订单、文件和客户备注", severity: "action", priority: 35 };
}

function buildStats(rows, now) {
  return {
    all: rows.length,
    actionable: rows.filter((row) => !["done", "waiting"].includes(row.next.severity)).length,
    fileAbnormal: rows.filter((row) => ["failed", "missing_sync_job", "no_files"].includes(row.fileStatus)).length,
    sliceFailed: rows.filter((row) => ["failed", "partial"].includes(row.sliceStatus)).length,
    waitingCustomer: rows.filter((row) => row.replyState === "waiting").length,
    todayNew: rows.filter((row) => sameLocalDate(row.created_at, now)).length,
  };
}

function matchesFilters(row, query, now) {
  if (query.q && !row.searchBlob.includes(query.q.toLowerCase())) return false;
  if (query.localState && row.localState !== query.localState) return false;
  if (query.fileStatus && row.fileStatus !== query.fileStatus) return false;
  if (query.sliceStatus && row.sliceStatus !== query.sliceStatus) return false;
  if (query.paymentStatus && String(row.payment_status || "") !== query.paymentStatus) return false;
  if (query.customerType && row.customerType !== query.customerType) return false;
  if (query.exception === "1" && !row.exception) return false;
  if (query.exception === "file" && !["failed", "missing_sync_job", "no_files"].includes(row.fileStatus)) return false;
  if (query.customerReply && row.replyState !== query.customerReply) return false;
  if (query.date === "today" && !sameLocalDate(row.created_at, now)) return false;
  if (query.date === "7d" && !withinDays(row.created_at, now, 7)) return false;
  if (query.date === "30d" && !withinDays(row.created_at, now, 30)) return false;
  return true;
}

function sorter(sort) {
  const byNewest = (a, b) => timestamp(b.updatedAt) - timestamp(a.updatedAt) || Number(b.id) - Number(a.id);
  if (sort === "created_desc") return (a, b) => timestamp(b.created_at) - timestamp(a.created_at) || Number(b.id) - Number(a.id);
  if (sort === "created_asc") return (a, b) => timestamp(a.created_at) - timestamp(b.created_at) || Number(a.id) - Number(b.id);
  if (sort === "amount_desc") return (a, b) => amount(b) - amount(a) || byNewest(a, b);
  return (a, b) => a.next.priority - b.next.priority || byNewest(a, b);
}

function deriveReplyState(localState, requests, local) {
  if (["FILE_PROBLEM"].includes(localState)) return "waiting";
  const localUpdated = timestamp(local?.updated_at);
  const newestCustomerMessage = Math.max(0, ...requests.map((item) => timestamp(item.updated_at || item.created_at)));
  return newestCustomerMessage > localUpdated ? "received" : "none";
}

function normalizeQuery(query) {
  const pageSize = clampInteger(query.page_size, DEFAULT_PAGE_SIZE, 10, MAX_PAGE_SIZE);
  return {
    q: String(query.q || "").trim().slice(0, 120),
    localState: String(query.local_state || "").trim(),
    fileStatus: String(query.file_status || query.sync_status || "").trim(),
    sliceStatus: String(query.slice_status || "").trim(),
    paymentStatus: String(query.payment_status || "").trim(),
    customerType: String(query.customer_type || "").trim(),
    date: String(query.date || "").trim(),
    exception: String(query.exception || "").trim(),
    customerReply: String(query.customer_reply || "").trim(),
    sort: String(query.sort || "priority").trim(),
    page: clampInteger(query.page, 1, 1, 10_000),
    pageSize,
  };
}

function normalizeSliceStatus(value) {
  const status = String(value || "");
  return ["pending", "slicing", "parsed", "partial", "failed"].includes(status) ? status : "not_started";
}

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(Math.max(number, min), max) : fallback;
}

function amount(row) {
  const value = Number(row.final_price ?? row.payable_price ?? row.estimated_price ?? 0);
  return Number.isFinite(value) ? value : 0;
}

function timestamp(value) {
  const number = Date.parse(String(value || ""));
  return Number.isFinite(number) ? number : 0;
}

function latestTimestamp(...values) {
  return values.sort((a, b) => timestamp(b) - timestamp(a))[0] || null;
}

function sameLocalDate(value, now) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return false;
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
}

function withinDays(value, now, days) {
  const time = timestamp(value);
  return time > 0 && time >= now.getTime() - days * 24 * 60 * 60 * 1000;
}
