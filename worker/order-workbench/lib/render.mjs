const TEXT = {
  title: "\u672c\u5730\u8ba2\u5355\u5de5\u4f5c\u53f0",
  localOnly: "\u4ec5\u672c\u673a\u8bbf\u95ee",
  readonly: "TEST\u8ba2\u5355\u53ef\u4eba\u5de5\u540c\u6b65 | \u771f\u5b9e\u8ba2\u5355\u53ea\u8bfb",
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
    .order-kind { display: inline-block; border: 2px solid; border-radius: 6px; padding: 3px 8px; margin-left: 8px; font-size: 12px; font-weight: 800; vertical-align: middle; }
    .order-kind-test { color: #075985; border-color: #38bdf8; background: #e0f2fe; }
    .order-kind-real { color: #9f1239; border-color: #fb7185; background: #fff1f2; }
    .order-kind-unknown { color: #854d0e; border-color: #facc15; background: #fefce8; }
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
      <td><a href="/orders/${order.id}">${escapeHtml(order.order_no)}</a>${renderOrderKindBadge(order)}</td>
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
      <h2>${escapeHtml(order.order_no)} ${renderOrderKindBadge(order)}</h2>
      ${renderOrderWriteBoundary(order)}
      <p>Online data: order status ${escapeHtml(order.status)}, payment status ${escapeHtml(order.payment_status || "")}</p>
      <p>Material ${escapeHtml(order.material)}, color ${escapeHtml(order.color || "")}, quantity ${escapeHtml(order.quantity)}</p>
      <p>Online quote ${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}, online lead time ${escapeHtml(formatLeadTime(order))}</p>
      ${String(order.payment_status || "").toLowerCase().includes("paid") ? '<p class="warn">Paid orders cannot be repriced by local draft alone.</p>' : ""}
      <p>Customer note: ${escapeHtml(order.remark || "none")}</p>
      <p>Online version <code>${escapeHtml(detail.order_version || "unavailable")}</code></p>
      ${renderLatestOnlineConfirmation(detail.latest_operator_confirmation)}
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
    ${renderOnlineSyncPreparation(order, review, detail.order_version, csrfToken)}
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

export function renderOnlineSyncConfirmPage({ detail, payload, csrfToken }) {
  const order = detail.detail.order;
  const previous = detail.detail.latest_operator_confirmation;
  const body = `
    <p><a href="/orders/${order.id}">Back to order</a></p>
    <section class="panel">
      <h2>Second confirmation before TEST online sync</h2>
      <p class="danger">TEST only. This will append an online manual confirmation and a customer-visible order message. It will not change order status, payment, refund, uploads, quote engine, WeChat Pay, or slicing jobs.</p>
      <div class="grid">
        <p><strong>Order no</strong><br>${escapeHtml(order.order_no)}</p>
        <p><strong>TEST marker</strong><br>${order.is_test_account ? '<span class="ok">TEST_SAFE</span>' : '<span class="danger">NOT TEST</span>'}</p>
        <p><strong>Old manual quote</strong><br>${escapeHtml(previous ? formatCents(previous.confirmed_quote_amount_cents) : "none")}</p>
        <p><strong>New manual quote</strong><br>${escapeHtml(formatCents(payload.confirmed_quote_amount_cents))}</p>
        <p><strong>Old lead time</strong><br>${escapeHtml(previous ? formatHourRange(previous.lead_time_min_hours, previous.lead_time_max_hours) : "none")}</p>
        <p><strong>New lead time</strong><br>${escapeHtml(formatHourRange(payload.lead_time_min_hours, payload.lead_time_max_hours))}</p>
        <p><strong>Online version</strong><br><code>${escapeHtml(payload.expected_order_version)}</code></p>
      </div>
      <h3>Reply preview</h3>
      <p><span class="pill">${escapeHtml(payload.message_type)}</span></p>
      <pre>${escapeHtml(payload.message_body)}</pre>
      <form method="POST" action="/orders/${order.id}/online-sync/run">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        ${Object.entries(payload).map(([key, value]) =>
          `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}">`,
        ).join("")}
        <button type="submit" ${order.is_test_account === true ? "" : "disabled"}>${order.is_test_account === true ? "Confirm and sync to TEST order" : "Real order sync disabled"}</button>
      </form>
    </section>`;
  return renderLayout({ title: `Confirm TEST sync - ${order.order_no}`, body, csrfToken });
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

function renderOnlineSyncPreparation(order, review, orderVersion, csrfToken) {
  const canSync = order.is_test_account === true;
  return `
    <section class="panel">
      <h3>Online TEST sync preparation</h3>
      <p class="warn">Prepare sync only after the local quote, lead time, and reply draft are reviewed. Final sync requires a second confirmation.</p>
      ${canSync ? "" : '<p class="danger">\u771f\u5b9e\u8ba2\u5355\u4ec5\u5141\u8bb8\u672c\u5730\u67e5\u770b\u548c\u8349\u7a3f\uff0c\u201c\u540c\u6b65\u7ebf\u4e0a\u201d\u5df2\u7981\u7528\u3002</p>'}
      <div class="grid">
        <p><strong>Draft quote</strong><br>${escapeHtml(formatCents(review?.confirmed_price_cents))}</p>
        <p><strong>Draft lead time</strong><br>${escapeHtml(formatHourRange(review?.lead_time_min_hours, review?.lead_time_max_hours))}</p>
        <p><strong>Online version</strong><br><code>${escapeHtml(orderVersion || "unavailable")}</code></p>
      </div>
      <h4>Reply preview</h4>
      <pre>${escapeHtml(review?.reply_draft || "")}</pre>
      <form method="POST" action="/orders/${order.id}/online-sync/prepare">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <button type="submit" ${canSync ? "" : "disabled"}>${canSync ? "Prepare sync" : "\u771f\u5b9e\u8ba2\u5355\u7981\u6b62\u540c\u6b65"}</button>
      </form>
    </section>`;
}

function renderOrderKindBadge(order) {
  if (order?.is_test_account === true) {
    return '<span class="order-kind order-kind-test">TEST\u8ba2\u5355</span>';
  }
  if (order?.is_test_account === false) {
    return '<span class="order-kind order-kind-real">\u771f\u5b9e\u8ba2\u5355 \u00b7 \u53ea\u8bfb</span>';
  }
  return '<span class="order-kind order-kind-unknown">\u8eab\u4efd\u672a\u786e\u8ba4 \u00b7 \u7981\u6b62\u540c\u6b65</span>';
}

function renderOrderWriteBoundary(order) {
  return order?.is_test_account === true
    ? '<p class="ok">TEST\u8ba2\u5355\uff1a\u5141\u8bb8\u7ecf\u4e8c\u6b21\u786e\u8ba4\u540e\u540c\u6b65\u4eba\u5de5\u62a5\u4ef7\u3001\u8d27\u671f\u548c\u5ba2\u6237\u53ef\u89c1\u56de\u590d\u3002</p>'
    : '<p class="danger">\u771f\u5b9e\u8ba2\u5355\uff1a\u53ea\u8bfb\u9884\u89c8\uff0c\u4e0d\u4f1a\u540c\u6b65\u7ebf\u4e0a\u3002</p>';
}

function renderLatestOnlineConfirmation(confirmation) {
  if (!confirmation) return '<p class="muted">No online manual confirmation yet.</p>';
  return `
    <div class="grid">
      <p><strong>Latest manual quote</strong><br>${escapeHtml(formatCents(confirmation.confirmed_quote_amount_cents))}</p>
      <p><strong>Latest manual lead time</strong><br>${escapeHtml(formatHourRange(confirmation.lead_time_min_hours, confirmation.lead_time_max_hours))}</p>
      <p><strong>Confirmation time</strong><br>${escapeHtml(confirmation.created_at || "")}</p>
    </div>`;
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
        <p><strong>Material weight</strong><br>${escapeHtml(slice.material_weight_grams ?? "")} g</p>
        <p><strong>Weight source</strong><br>${escapeHtml(formatWeightSource(slice))}</p>
        <p><strong>Upload model dimensions</strong><br>${escapeHtml(formatUploadDimensions(slice))}</p>
        <p><strong>Slicing output range</strong><br>${escapeHtml(formatSlicingDimensions(slice))}</p>
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

function formatCents(value) {
  if (value == null || value === "") return "not confirmed";
  const cents = Number(value);
  return Number.isSafeInteger(cents) ? `RMB ${(cents / 100).toFixed(2)}` : "not confirmed";
}

function formatHourRange(min, max) {
  if (min == null || max == null || min === "" || max === "") return "not confirmed";
  const minHours = Number(min);
  const maxHours = Number(max);
  if (!Number.isSafeInteger(minHours) || !Number.isSafeInteger(maxHours)) return "not confirmed";
  return minHours === maxHours ? `${minHours} hours` : `${minHours}-${maxHours} hours`;
}

function formatLeadTime(order) {
  if (order.final_lead_time_hours) return `${order.final_lead_time_hours} hours`;
  const min = order.estimated_lead_time_min_hours;
  const max = order.estimated_lead_time_max_hours;
  if (min && max) return `${min}-${max} hours`;
  return "not confirmed";
}

function formatUploadDimensions(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  const dimensions = metrics.dimension_sources?.upload_model_dimensions;
  return formatDimensionObject(dimensions, "temporarily unavailable");
}

function formatWeightSource(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  return metrics.metric_sources?.filament_weight_source || "unavailable";
}

function formatSlicingDimensions(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  const dimensions = metrics.dimension_sources?.parser_dimensions || {
    x_mm: slice.dimensions_x,
    y_mm: slice.dimensions_y,
    z_mm: slice.dimensions_z,
    source: metrics.dimension_sources?.parser_dimensions_source,
  };
  return `${formatDimensionObject(dimensions, "temporarily unavailable")} (${dimensions?.source || "unavailable"})`;
}

function formatDimensionObject(dimensions, fallback) {
  if (!dimensions) return fallback;
  const x = dimensions.x_mm == null ? "temporarily unavailable" : `${dimensions.x_mm}mm`;
  const y = dimensions.y_mm == null ? "temporarily unavailable" : `${dimensions.y_mm}mm`;
  const z = dimensions.z_mm == null ? "temporarily unavailable" : `${dimensions.z_mm}mm`;
  return `${x} / ${y} / ${z}`;
}

function renderWarnings(value) {
  let warnings = [];
  try {
    warnings = JSON.parse(value || "[]");
  } catch {
    warnings = [];
  }
  if (!warnings.length) return '<h4>Parser warnings (warning severity / code / message)</h4><p class="muted">No parser warnings</p>';
  return `<h4>Parser warnings (warning severity / code / message)</h4><ul>${warnings.map((warning) => {
    const parsed = parseWarning(warning);
    return `<li class="warn"><strong>${escapeHtml(parsed.severity)}</strong> ${escapeHtml(parsed.code)}: ${escapeHtml(parsed.message)}</li>`;
  }).join("")}</ul>`;
}

function parseWarning(warning) {
  if (typeof warning !== "string") {
    return { severity: "UNKNOWN", code: "PARSER_NOTE", message: String(warning || "") };
  }
  const match = warning.match(/^([A-Z_]+):([A-Z0-9_]+):(.*)$/);
  if (!match) {
    return { severity: "UNKNOWN", code: "PARSER_NOTE", message: warning };
  }
  return {
    severity: match[1],
    code: match[2],
    message: match[3],
  };
}

function parseMetricsJson(value) {
  try {
    const parsed = JSON.parse(value || "{}");
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
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
