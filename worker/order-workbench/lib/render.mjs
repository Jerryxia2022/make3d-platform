const TEXT = {
  title: "\u672c\u5730\u8ba2\u5355\u5de5\u4f5c\u53f0",
  localOnly: "\u4ec5\u672c\u673a\u8bbf\u95ee",
  readonly: "\u5f53\u524d\u4e3a\u53ea\u8bfb\u6a21\u5f0f",
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
    .banner { font-size: 14px; color: #cbd5e1; margin-top: 4px; }
    .panel { background: #fff; border: 1px solid #d9dee7; border-radius: 8px; padding: 16px; margin-bottom: 16px; }
    .muted { color: #667085; }
    .danger { color: #a33131; font-weight: 700; }
    .ok { color: #0f766e; font-weight: 700; }
    .pill { display: inline-block; border: 1px solid #ccd3dd; border-radius: 999px; padding: 2px 8px; background: #f8fafc; font-size: 12px; }
    form.inline { display: inline; }
    button { border: 1px solid #9aa4b2; border-radius: 6px; background: #fff; padding: 6px 10px; cursor: pointer; }
    button:hover { background: #f1f5f9; }
    input, select { padding: 7px 8px; border: 1px solid #aeb7c4; border-radius: 6px; }
    code { background: #edf2f7; padding: 2px 4px; border-radius: 4px; }
  </style>
</head>
<body>
  <header>
    <strong>Make3D ${TEXT.title}</strong>
    <div class="banner">${TEXT.localOnly} | ${TEXT.readonly} | Read-only: no order, quote, payment, refund, WeChat Pay, or slicing changes.</div>
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

export function renderOrderDetailPage({ detail, localChecks, csrfToken }) {
  const order = detail.order;
  const fileRows = detail.files.map((file) => {
    const check = localChecks.get(file.local_file_sync_job_id) || {};
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
      <p>Quote ${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}, lead time ${escapeHtml(formatLeadTime(order))}</p>
      <p>Customer note: ${escapeHtml(order.remark || "none")}</p>
    </section>
    <section class="panel">
      <h3>File sync and local verification</h3>
      <table>
        <thead><tr><th>ID</th><th>File</th><th>Format</th><th>Size</th><th>SHA</th><th>Safe relative path</th><th>Sync</th><th>Exists</th><th>Size</th><th>SHA</th><th>Actions</th></tr></thead>
        <tbody>${fileRows || '<tr><td colspan="11" class="muted">No files</td></tr>'}</tbody>
      </table>
    </section>
    <section class="panel">
      <h3>Existing customer messages / visible replies</h3>
      <ul>${messages || '<li class="muted">No records</li>'}</ul>
    </section>`;
  return renderLayout({ title: `${order.order_no} - Make3D ${TEXT.title}`, body, csrfToken });
}

export function renderMessagePage({ title, message, backHref = "/" }) {
  return renderLayout({
    title,
    csrfToken: "",
    body: `<section class="panel"><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(backHref)}">Back</a></p></section>`,
  });
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
