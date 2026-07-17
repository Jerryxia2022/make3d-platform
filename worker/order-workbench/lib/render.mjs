const TEXT = {
  title: "\u672c\u5730\u8ba2\u5355\u5de5\u4f5c\u53f0",
  localOnly: "\u4ec5\u672c\u673a\u8bbf\u95ee",
  readonly: "\u5f53\u524d\u4e3a\u53ea\u8bfb\u6a21\u5f0f",
  draftMode: "\u672c\u5730\u8349\u7a3f\u6a21\u5f0f",
  notSynced: "\u5c1a\u672a\u540c\u6b65\u5ba2\u6237",
};

export function renderLayout({ title, body, csrfToken }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; }
    body { margin: 0; color: #1f2933; background: #f6f7f9; }
    header { background: #0f172a; color: #fff; padding: 16px 24px; }
    main { max-width: 1180px; margin: 0 auto; padding: 20px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { background: #eef2f7; font-weight: 700; }
    a { color: #0f5f9e; text-decoration: none; }
    textarea { width: 100%; min-height: 90px; }
    .banner { font-size: 14px; color: #cbd5e1; margin-top: 4px; }
    .panel { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .muted { color: #667085; }
    .danger { color: #a33131; font-weight: 700; }
    .ok { color: #0f766e; font-weight: 700; }
    .warn { color: #9a5b00; font-weight: 700; }
    .pill { display: inline-block; border: 1px solid #ccd3dd; border-radius: 999px; padding: 2px 8px; background: #f8fafc; font-size: 12px; }
    form.inline { display: inline; }
    button { border: 1px solid #9aa4b2; border-radius: 6px; background: #fff; padding: 6px 10px; cursor: pointer; }
    button:hover { background: #f1f5f9; }
    input, select, textarea { padding: 7px 8px; border: 1px solid #aeb7c4; border-radius: 6px; box-sizing: border-box; }
    label { display: block; margin: 8px 0; }
    code { background: #edf2f7; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <strong>Make3D ${TEXT.title}</strong>
    <div class="banner">${TEXT.localOnly} | ${TEXT.readonly} | ${TEXT.draftMode} | ${TEXT.notSynced}</div>
  </header>
  <main data-csrf="${escapeHtml(csrfToken)}">${body}</main>
</body>
</html>`;
}

export function renderOrderListPage({ orders, query, csrfToken }) {
  const rows = orders.map((order) => `
    <tr>
      <td><a href="/orders/${order.id}">${escapeHtml(order.order_no)}</a>${order.is_test_account ? ' <span class="pill">TEST</span>' : ""}</td>
      <td>${escapeHtml(order.created_at || "")}</td>
      <td>${escapeHtml(order.status || "")}</td>
      <td>${escapeHtml(order.payment_status || "")}</td>
      <td>${escapeHtml(order.material || "")}</td>
      <td>${escapeHtml(order.color || "")}</td>
      <td>${escapeHtml(order.quantity)}</td>
      <td>${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}</td>
      <td>${escapeHtml(formatLeadTime(order))}</td>
      <td>${escapeHtml(order.remark || "")}</td>
      <td>${escapeHtml(order.file_count)}</td>
      <td>${renderSyncSummary(order.file_sync_summary)}</td>
      <td>${escapeHtml(new Date().toISOString())}</td>
    </tr>`).join("");

  const body = `
    <section class="panel">
      <form method="GET" action="/">
        <label>Order search <input name="q" value="${escapeHtml(query.q || "")}"></label>
        <label>Order status <input name="status" value="${escapeHtml(query.status || "")}"></label>
        <label>Sync status
          <select name="sync_status">
            ${["", "verified", "syncing", "failed", "missing_sync_job", "no_files"].map((value) =>
              `<option value="${value}" ${query.sync_status === value ? "selected" : ""}>${value || "all"}</option>`,
            ).join("")}
          </select>
        </label>
        <button type="submit">Refresh</button>
      </form>
    </section>
    <section class="panel">
      <table>
        <thead><tr>
          <th>Order no</th><th>Created</th><th>Order status</th><th>Payment</th><th>Material</th><th>Color</th><th>Qty</th>
          <th>Quote</th><th>Lead time</th><th>Customer note summary</th><th>Files</th><th>File sync</th><th>Checked at</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="13" class="muted">No orders</td></tr>'}</tbody>
      </table>
    </section>`;
  return renderLayout({ title: `Make3D ${TEXT.title}`, body, csrfToken });
}

export function renderOrderDetailPage({ detail, localChecks, review, sliceResult, auditEvents = [], csrfToken }) {
  const order = detail.order;
  const fileRows = detail.files.map((file) => {
    const check = localChecks.get(file.local_file_sync_job_id) || {};
    const canSlice = canAttemptSlice(file, check);
    return `<tr>
      <td>${escapeHtml(file.file_id)}</td>
      <td>${escapeHtml(file.masked_filename)}</td>
      <td>${escapeHtml(file.format)}</td>
      <td>${escapeHtml(file.filesize)}</td>
      <td>${escapeHtml(shortSha(file.expected_sha256))}</td>
      <td><code>${escapeHtml(file.relative_path || "")}</code></td>
      <td>${escapeHtml(file.sync_status || "")}</td>
      <td>${renderCheck(check.exists)}</td>
      <td>${renderCheck(check.size_matches)}</td>
      <td>${renderCheck(check.sha_matches)}</td>
      <td>
        ${file.local_file_sync_job_id ? `
          <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/verify-sha">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="order_id" value="${escapeHtml(order.id)}">
            <button type="submit">Verify SHA</button>
          </form>
          <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/open-directory">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="order_id" value="${escapeHtml(order.id)}">
            <button type="submit">Open directory</button>
          </form>
          <form class="inline" method="POST" action="/orders/${order.id}/local-slice/confirm">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="sync_job_id" value="${escapeHtml(file.local_file_sync_job_id)}">
            <button type="submit" ${canSlice ? "" : "disabled"}>Manual slice</button>
          </form>` : '<span class="muted">No sync job</span>'}
      </td>
    </tr>`;
  }).join("");

  const messages = detail.customer_service_requests.map((item) => `
    <li>
      <strong>${escapeHtml(item.created_at || "")}</strong>
      <span class="pill">${escapeHtml(item.status || "")}</span>
      <div>${escapeHtml(item.message || "")}</div>
      ${item.customer_visible_reply ? `<div class="muted">Visible reply: ${escapeHtml(item.customer_visible_reply)}</div>` : ""}
    </li>`).join("");

  const body = `
    <p><a href="/">Back to order list</a></p>
    <section class="panel">
      <h2>${escapeHtml(order.order_no)} ${order.is_test_account ? '<span class="pill">TEST</span>' : ""}</h2>
      <p>Online data: order status ${escapeHtml(order.status)}, payment status ${escapeHtml(order.payment_status || "")}</p>
      <p>Material ${escapeHtml(order.material)}, color ${escapeHtml(order.color || "")}, quantity ${escapeHtml(order.quantity)}</p>
      <p>Online quote ${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}, online lead time ${escapeHtml(formatLeadTime(order))}</p>
      ${String(order.payment_status || "").toLowerCase().includes("paid") ? '<p class="warn">Paid orders cannot be repriced by local draft alone.</p>' : ""}
      <p>Customer note: ${escapeHtml(order.remark || "none")}</p>
    </section>
    <section class="panel">
      <h3>File check</h3>
      <table>
        <thead><tr><th>ID</th><th>File</th><th>Format</th><th>Size</th><th>SHA</th><th>Safe relative path</th><th>Sync</th><th>Exists</th><th>Size</th><th>SHA</th><th>Actions</th></tr></thead>
        <tbody>${fileRows || '<tr><td colspan="11" class="muted">No files</td></tr>'}</tbody>
      </table>
    </section>
    ${renderSliceResult(sliceResult)}
    ${renderLocalDraftForm(order, review, csrfToken)}
    <section class="panel">
      <h3>Existing customer messages / visible replies</h3>
      <ul>${messages || '<li class="muted">No records</li>'}</ul>
    </section>
    <section class="panel">
      <h3>Local audit history</h3>
      <ul>${renderAuditEvents(auditEvents)}</ul>
    </section>`;
  return renderLayout({ title: `${order.order_no} - Make3D ${TEXT.title}`, body, csrfToken });
}

export function renderLocalSliceConfirmPage({ detail, file, csrfToken, profileName, profileKey }) {
  const order = detail.detail.order;
  const body = `
    <p><a href="/orders/${order.id}">Back to order</a></p>
    <section class="panel">
      <h2>Confirm one-shot local slicing</h2>
      <p class="danger">This starts one local PrusaSlicer process only. It does not sync price, lead time, reply, order status, payment, refund, or WeChat Pay.</p>
      <div class="grid">
        <p><strong>Order</strong><br>${escapeHtml(order.order_no)}</p>
        <p><strong>File</strong><br>${escapeHtml(file.masked_filename)}</p>
        <p><strong>Size</strong><br>${escapeHtml(file.filesize)} bytes</p>
        <p><strong>Material</strong><br>${escapeHtml(order.material || "")}</p>
        <p><strong>Quantity</strong><br>${escapeHtml(order.quantity)}</p>
        <p><strong>Profile</strong><br>${escapeHtml(profileName)} <span class="pill">${escapeHtml(profileKey)}</span></p>
        <p><strong>Current local state</strong><br>${escapeHtml(detail.review?.state || "UNREVIEWED")}</p>
      </div>
      <form method="POST" action="/orders/${order.id}/local-slice/run">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="sync_job_id" value="${escapeHtml(file.local_file_sync_job_id)}">
        <button type="submit">Confirm and run one-shot slicing</button>
      </form>
    </section>`;
  return renderLayout({ title: `Confirm local slicing - ${order.order_no}`, body, csrfToken });
}

export function renderMessagePage({ title, message, backHref = "/" }) {
  return renderLayout({
    title,
    csrfToken: "",
    body: `<section class="panel"><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(backHref)}">Back</a></p></section>`,
  });
}

function renderLocalDraftForm(order, review, csrfToken) {
  const state = review?.state || "UNREVIEWED";
  return `
    <section class="panel">
      <h3>Local confirmation drafts <span class="pill">${TEXT.notSynced}</span></h3>
      <form method="POST" action="/orders/${order.id}/local-review">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <div class="grid">
          <label>Local handling state
            <select name="state">
              ${["UNREVIEWED","REVIEWING","FILE_PROBLEM","READY_TO_SLICE","SLICING","SLICE_REVIEWED","SLICE_CONFIRMED","SLICE_NEEDS_FIX","QUOTE_DRAFTED","READY_FOR_ONLINE_SYNC","CLOSED"].map((value) =>
                `<option value="${value}" ${state === value ? "selected" : ""}>${value}</option>`,
              ).join("")}
            </select>
          </label>
          <label>Suggested price cents <input name="suggested_price_cents" inputmode="numeric" value="${escapeHtml(review?.suggested_price_cents ?? "")}"></label>
          <label>Confirmed price cents <input name="confirmed_price_cents" inputmode="numeric" value="${escapeHtml(review?.confirmed_price_cents ?? "")}"></label>
          <label>Lead time min hours <input name="lead_time_min_hours" inputmode="numeric" value="${escapeHtml(review?.lead_time_min_hours ?? "")}"></label>
          <label>Lead time max hours <input name="lead_time_max_hours" inputmode="numeric" value="${escapeHtml(review?.lead_time_max_hours ?? "")}"></label>
          <label>Estimated ship at <input name="estimated_ship_at" value="${escapeHtml(review?.estimated_ship_at ?? "")}" placeholder="YYYY-MM-DD HH:mm"></label>
          <label>Reply template
            <select name="reply_template">
              ${["","FILE_RECEIVED","FILE_CONFIRMED","MODEL_PROBLEM_REUPLOAD","CONFIRM_MATERIAL_COLOR_QUANTITY","QUOTE_MANUAL_CONFIRM","LEAD_TIME_UPDATED","CONFIRM_SUPPORT_OR_APPEARANCE","PLAIN_TEXT"].map((value) =>
                `<option value="${value}" ${review?.reply_template === value ? "selected" : ""}>${value || "none"}</option>`,
              ).join("")}
            </select>
          </label>
        </div>
        <label>Reply draft<textarea name="reply_draft" maxlength="4000">${escapeHtml(review?.reply_draft || "")}</textarea></label>
        <label>Operator note<textarea name="operator_note" maxlength="2000">${escapeHtml(review?.operator_note || "")}</textarea></label>
        <button type="submit">Save local draft only</button>
      </form>
    </section>`;
}

function renderSliceResult(slice) {
  if (!slice) {
    return `<section class="panel"><h3>Slicing result</h3><p class="muted">No local slicing result yet. Metrics are for manual reference only and will not sync price automatically.</p></section>`;
  }
  return `
    <section class="panel">
      <h3>Slicing result <span class="pill">${escapeHtml(slice.status)}</span></h3>
      <p class="warn">Manual reference only. Do not auto-sync price.</p>
      <div class="grid">
        <p><strong>Slicer version</strong><br>${escapeHtml(slice.slicer_version || "")}</p>
        <p><strong>Profile</strong><br>${escapeHtml(slice.profile_name || "")}</p>
        <p><strong>Profile SHA</strong><br>${escapeHtml(shortSha(slice.profile_sha256))}</p>
        <p><strong>Parser version</strong><br>${escapeHtml(slice.parser_version || "")}</p>
        <p><strong>Started</strong><br>${escapeHtml(slice.started_at || "")}</p>
        <p><strong>Completed</strong><br>${escapeHtml(slice.completed_at || "")}</p>
        <p><strong>Duration</strong><br>${escapeHtml(slice.duration_seconds ?? "")} seconds</p>
        <p><strong>Print time</strong><br>${escapeHtml(slice.print_time_seconds ?? "")} seconds</p>
        <p><strong>Weight</strong><br>${escapeHtml(slice.material_weight_grams ?? "")} g</p>
        <p><strong>Dimensions</strong><br>${escapeHtml(formatDimensions(slice))}</p>
        <p><strong>G-code size</strong><br>${escapeHtml(slice.gcode_size_bytes ?? "")} bytes</p>
        <p><strong>G-code SHA</strong><br>${escapeHtml(shortSha(slice.gcode_sha256))}</p>
        <p><strong>Parse status</strong><br>${escapeHtml(slice.parse_status || "")}</p>
        <p><strong>Metrics status</strong><br>${escapeHtml(slice.metrics_status || "")}</p>
        <p><strong>Parser quote ready</strong><br>${slice.parser_quote_ready ? '<span class="ok">yes</span>' : '<span class="warn">no</span>'}</p>
      </div>
      ${slice.failure_summary ? `<p class="danger">${escapeHtml(slice.failure_summary)}</p>` : ""}
      ${renderWarnings(slice.warnings_json)}
    </section>`;
}

function renderAuditEvents(events) {
  return events.map((event) => `<li><strong>${escapeHtml(event.created_at)}</strong> <span class="pill">${escapeHtml(event.action)}</span> ${escapeHtml(event.result)}</li>`).join("")
    || '<li class="muted">No local audit events</li>';
}

function renderSyncSummary(summary = {}) {
  const status = summary.status || "unknown";
  const className = status === "verified" ? "ok" : status === "failed" ? "danger" : "muted";
  return `<span class="${className}">${escapeHtml(status)}</span><br><span class="muted">${escapeHtml(summary.verified_count || 0)}/${escapeHtml(summary.file_count || 0)}</span>`;
}

function renderCheck(value) {
  if (value === true) return '<span class="ok">passed</span>';
  if (value === false) return '<span class="danger">failed</span>';
  return '<span class="muted">not checked</span>';
}

function canAttemptSlice(file, check) {
  const ext = String(file.relative_path || file.masked_filename || "").toLowerCase().split(".").pop();
  return (file.sync_status === "verified" || file.sync_status === "local_synced")
    && check.exists === true
    && check.size_matches === true
    && (ext === "stl" || ext === "3mf");
}

function formatMoney(value) {
  if (value == null || value === "") return "not confirmed";
  const amount = Number(value);
  return Number.isFinite(amount) ? `RMB ${amount.toFixed(2)}` : "not confirmed";
}

function formatLeadTime(order) {
  if (order.final_lead_time_hours) return `${order.final_lead_time_hours} hours`;
  const min = order.estimated_lead_time_min_hours;
  const max = order.estimated_lead_time_max_hours;
  if (min && max) return `${min}-${max} hours`;
  return "not confirmed";
}

function formatDimensions(slice) {
  const x = slice.dimensions_x == null ? "unknown" : `${slice.dimensions_x}mm`;
  const y = slice.dimensions_y == null ? "unknown" : `${slice.dimensions_y}mm`;
  const z = slice.dimensions_z == null ? "unknown" : `${slice.dimensions_z}mm`;
  return `${x} / ${y} / ${z}`;
}

function renderWarnings(value) {
  let warnings = [];
  try {
    warnings = JSON.parse(value || "[]");
  } catch {
    warnings = [];
  }
  if (!warnings.length) return '<p class="muted">No parser warnings</p>';
  return `<ul>${warnings.map((warning) => `<li class="warn">${escapeHtml(warning)}</li>`).join("")}</ul>`;
}

function shortSha(value) {
  const text = String(value || "");
  return /^[a-f0-9]{64}$/i.test(text) ? text.slice(0, 12) : "";
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
