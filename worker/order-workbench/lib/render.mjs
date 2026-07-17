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
    <strong>Make3D 本地订单工作台</strong>
    <div class="banner">仅本机访问 · 当前为只读模式 · 不修改订单、价格、支付、退款、微信支付或切片任务</div>
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
        <label>订单号搜索 <input name="q" value="${escapeHtml(query.q || "")}"></label>
        <label>订单状态 <input name="status" value="${escapeHtml(query.status || "")}"></label>
        <label>同步状态
          <select name="sync_status">
            ${["", "verified", "syncing", "failed", "missing_sync_job", "no_files"].map((value) =>
              `<option value="${value}" ${query.sync_status === value ? "selected" : ""}>${value || "全部"}</option>`,
            ).join("")}
          </select>
        </label>
        <button type="submit">刷新</button>
      </form>
    </section>
    <section class="panel">
      <table>
        <thead><tr>
          <th>订单号</th><th>创建时间</th><th>订单状态</th><th>支付</th><th>材料</th><th>颜色</th><th>数量</th>
          <th>当前报价</th><th>当前货期</th><th>客户备注摘要</th><th>文件数</th><th>文件同步</th><th>最后同步</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="13" class="muted">暂无订单</td></tr>'}</tbody>
      </table>
    </section>`;
  return renderLayout({ title: "Make3D 本地订单工作台", body, csrfToken });
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
            <button type="submit">验证 SHA</button>
          </form>
          <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/open-directory">
            <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
            <input type="hidden" name="order_id" value="${escapeHtml(order.id)}">
            <button type="submit">打开目录</button>
          </form>` : '<span class="muted">无同步任务</span>'}
      </td>
    </tr>`;
  }).join("");

  const messages = detail.customer_service_requests.map((item) => `
    <li>
      <strong>${escapeHtml(item.created_at || "")}</strong>
      <span class="pill">${escapeHtml(item.status || "")}</span>
      <div>${escapeHtml(item.message || "")}</div>
      ${item.customer_visible_reply ? `<div class="muted">可见回复：${escapeHtml(item.customer_visible_reply)}</div>` : ""}
    </li>`).join("");

  const body = `
    <p><a href="/">返回订单列表</a></p>
    <section class="panel">
      <h2>${escapeHtml(order.order_no)} ${order.is_test_account ? '<span class="pill">TEST</span>' : ""}</h2>
      <p>线上数据：订单状态 ${escapeHtml(order.status)}，支付状态 ${escapeHtml(order.payment_status || "")}</p>
      <p>材料 ${escapeHtml(order.material)}，颜色 ${escapeHtml(order.color || "")}，数量 ${escapeHtml(order.quantity)}</p>
      <p>报价 ${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}，货期 ${escapeHtml(formatLeadTime(order))}</p>
      <p>客户备注：${escapeHtml(order.remark || "无")}</p>
    </section>
    <section class="panel">
      <h3>文件同步与本地验证</h3>
      <table>
        <thead><tr><th>ID</th><th>文件</th><th>格式</th><th>大小</th><th>SHA</th><th>安全相对路径</th><th>同步</th><th>存在</th><th>大小</th><th>SHA</th><th>操作</th></tr></thead>
        <tbody>${fileRows || '<tr><td colspan="11" class="muted">暂无文件</td></tr>'}</tbody>
      </table>
    </section>
    <section class="panel">
      <h3>现有客户留言 / 可见回复</h3>
      <ul>${messages || '<li class="muted">暂无记录</li>'}</ul>
    </section>`;
  return renderLayout({ title: `${order.order_no} - 本地订单工作台`, body, csrfToken });
}

export function renderMessagePage({ title, message, backHref = "/" }) {
  return renderLayout({
    title,
    csrfToken: "",
    body: `<section class="panel"><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(backHref)}">返回</a></p></section>`,
  });
}

function renderSyncSummary(summary = {}) {
  const status = summary.status || "unknown";
  const className = status === "verified" ? "ok" : status === "failed" ? "danger" : "muted";
  return `<span class="${className}">${escapeHtml(status)}</span><br><span class="muted">${escapeHtml(summary.verified_count || 0)}/${escapeHtml(summary.file_count || 0)}</span>`;
}

function renderCheck(value) {
  if (value === true) return '<span class="ok">通过</span>';
  if (value === false) return '<span class="danger">失败</span>';
  return '<span class="muted">未验证</span>';
}

function formatMoney(value) {
  if (value == null || value === "") return "未确认";
  const amount = Number(value);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : "未确认";
}

function formatLeadTime(order) {
  if (order.final_lead_time_hours) return `${order.final_lead_time_hours} 小时`;
  const min = order.estimated_lead_time_min_hours;
  const max = order.estimated_lead_time_max_hours;
  if (min && max) return `${min}-${max} 小时`;
  return "未确认";
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
