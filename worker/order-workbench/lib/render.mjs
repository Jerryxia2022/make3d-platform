import { WORKBENCH_DESIGN_STYLES } from "./designSystem.mjs";

const TEXT = {
  title: "本地订单工作台",
  localOnly: "仅限本机访问",
  readonly: "TEST订单可人工同步 | 真实订单只读",
  draftMode: "价格和货期先保存为本地草稿",
  notSynced: "尚未同步给客户",
};

export function renderLayout({ title, body, csrfToken }) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, "Microsoft YaHei", sans-serif; font-size: 14px; --border:#d8dee8; --muted:#667085; --ink:#17202e; --primary:#1769aa; --success:#13795b; --warning:#a15c00; --danger:#b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; color: var(--ink); background: #f4f6f8; line-height: 1.55; }
    header { background: #172334; color: #fff; padding: 12px 24px; }
    main { max-width: 1440px; margin: 0 auto; padding: 20px 24px 32px; }
    table { width: 100%; border-collapse: collapse; background: #fff; }
    th, td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; text-align: left; vertical-align: top; }
    th { background: #eef2f7; font-weight: 700; }
    a { color: #0f5f9e; text-decoration: none; }
    textarea { width: 100%; min-height: 90px; }
    .banner { font-size: 14px; color: #cbd5e1; margin-top: 4px; }
    h1,h2,h3,h4,p { margin-top: 0; }
    h2 { font-size: 23px; line-height: 1.3; }
    h3 { font-size: 16px; margin-bottom: 12px; }
    .panel { background: #fff; border: 1px solid var(--border); border-radius: 8px; padding: 18px; margin-bottom: 16px; }
    .panel-primary { border-left: 4px solid #0284c7; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .table-wrap { width: 100%; overflow-x: auto; }
    .file-path { display: block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .section-note { margin: 4px 0 14px; color: #475467; }
    .muted { color: #667085; }
    .danger { color: var(--danger); font-weight: 700; }
    .ok { color: var(--success); font-weight: 700; }
    .warn { color: var(--warning); font-weight: 700; }
    .pill { display: inline-block; border: 1px solid #ccd3dd; border-radius: 999px; padding: 2px 8px; background: #f8fafc; font-size: 12px; }
    .order-kind { display: inline-block; border: 2px solid; border-radius: 6px; padding: 3px 8px; margin-left: 8px; font-size: 12px; font-weight: 800; vertical-align: middle; }
    .order-kind-test { color: #075985; border-color: #38bdf8; background: #e0f2fe; }
    .order-kind-real { color: #9f1239; border-color: #fb7185; background: #fff1f2; }
    .order-kind-unknown { color: #854d0e; border-color: #facc15; background: #fefce8; }
    form.inline { display: inline; }
    button, .button-link { min-height: 36px; border: 1px solid #9aa4b2; border-radius: 6px; background: #fff; padding: 7px 12px; cursor: pointer; color: #263445; font: inherit; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; gap: 6px; }
    button:hover { background: #f1f5f9; }
    button.primary, .button-link.primary { color: #fff; border-color: #0369a1; background: #0369a1; font-weight: 700; }
    button.primary:hover, .button-link.primary:hover { background: #075985; }
    button:disabled { color: #98a2b3; border-color: #d0d5dd; background: #f2f4f7; cursor: not-allowed; }
    button.text-button { border-color: transparent; background: transparent; color: var(--primary); }
    button.danger-button { color: #fff; border-color: var(--danger); background: var(--danger); }
    input, select, textarea { padding: 7px 8px; border: 1px solid #aeb7c4; border-radius: 6px; box-sizing: border-box; }
    input { width: min(100%, 320px); }
    input.copy-path { width: 100%; max-width: none; font-family: Consolas, monospace; }
    label { display: block; margin: 8px 0; }
    code { background: #edf2f7; padding: 2px 4px; border-radius: 4px; max-width: 100%; overflow-wrap: anywhere; word-break: break-word; }
    .breadcrumb { margin: 0 0 12px; }
    .order-overview { box-shadow: 0 4px 14px rgba(16,24,40,.06); }
    .overview-row, .section-head, .file-head, .action-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
    .overview-title { min-width: 0; }
    .overview-title h2 { margin-bottom: 4px; overflow-wrap: anywhere; }
    .overview-actions, .file-actions { display: flex; flex-wrap: wrap; gap: 8px; }
    .status-strip { display: grid; grid-template-columns: repeat(6, minmax(120px,1fr)); gap: 8px; margin-top: 14px; }
    .status-item { min-width: 0; padding: 9px 10px; border: 1px solid #e2e7ee; border-radius: 6px; background: #f8fafc; }
    .status-label { display: block; color: var(--muted); font-size: 12px; }
    .status-value { display: block; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .status-badge { display: inline-flex; align-items: center; gap: 5px; border-radius: 999px; padding: 3px 9px; font-size: 12px; font-weight: 700; }
    .status-idle { color:#475467; background:#eef2f6; }
    .status-progress { color:#175cd3; background:#eaf2ff; }
    .status-success { color:#087443; background:#e7f8ef; }
    .status-warning { color:#8a4b08; background:#fff4d6; }
    .status-failed { color:#b42318; background:#feeceb; }
    .workspace-grid { display: grid; grid-template-columns: minmax(0, 2.1fr) minmax(300px, 1fr); gap: 16px; align-items: start; }
    .main-column, .side-column { min-width: 0; }
    .side-sticky { position: static; }
    .info-grid { display: grid; grid-template-columns: repeat(3,minmax(0,1fr)); gap: 12px 20px; }
    .info-item { min-width:0; }
    .info-item dt { color: var(--muted); font-size: 12px; }
    .info-item dd { margin: 2px 0 0; font-weight: 600; overflow-wrap: anywhere; }
    .file-card { border: 1px solid #dfe5ec; border-radius: 8px; padding: 16px; background:#fbfcfd; }
    .file-card + .file-card { margin-top: 12px; }
    .file-title { min-width:0; }
    .file-title strong { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .file-meta-grid { display:grid; grid-template-columns: repeat(4,minmax(0,1fr)); gap:12px; margin:14px 0; }
    .path-box { display:grid; grid-template-columns: 92px minmax(0,1fr) auto; gap:8px; align-items:center; border-top:1px solid #e5e9ef; padding-top:10px; margin-top:10px; }
    .path-value { min-width:0; font-family:Consolas,monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .slice-settings { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .slice-settings label { margin:0; }
    .slice-settings input, .slice-settings select { width:100%; margin-top:4px; }
    .result-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    #slice-result { scroll-margin-top: 16px; }
    .result-card { padding:10px; border-radius:6px; background:#f8fafc; min-width:0; }
    .result-card span { display:block; color:var(--muted); font-size:12px; }
    .result-card strong, .result-card code { display:block; margin-top:3px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .next-step { padding:12px; border-left:3px solid var(--primary); background:#f0f7ff; border-radius:4px; }
    .notice-toast { border-left:4px solid var(--primary); }
    .progress-track { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin:16px 0; }
    .progress-stage { padding:10px; border:1px solid var(--border); border-radius:6px; color:var(--muted); background:#fff; text-align:center; }
    .progress-stage.active { color:#175cd3; border-color:#84adff; background:#eff4ff; font-weight:700; }
    .progress-stage.done { color:#087443; border-color:#75e0a7; background:#ecfdf3; }
    .progress-stage.failed { color:#b42318; border-color:#fda29b; background:#fef3f2; font-weight:700; }
    .progress-stage.warning { color:#8a4b08; border-color:#fec84b; background:#fffaeb; font-weight:700; }
    .live-result { margin-top:16px; border:1px solid currentColor; border-radius:8px; padding:16px; }
    .technical-details { margin-top:12px; }
    .technical-details pre { max-height:240px; overflow:auto; white-space:pre-wrap; overflow-wrap:anywhere; }
    .compact-form textarea { min-height:72px; }
    .compact-form button { width:100%; }
    .inline-note { font-size:12px; color:var(--muted); }
    @media (max-width: 1100px) {
      main { padding:16px; }
      .order-overview { position:static; }
      .workspace-grid { grid-template-columns:1fr; }
      .side-column { grid-row:1; }
      .side-sticky { position:static; }
      .status-strip { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .info-grid, .result-grid { grid-template-columns:repeat(2,minmax(0,1fr)); }
    }
    @media (max-width: 720px) {
      header { padding:10px 14px; }
      main { padding:12px; }
      .overview-row, .section-head, .file-head { align-items:flex-start; flex-direction:column; }
      .status-strip, .info-grid, .file-meta-grid, .slice-settings, .result-grid { grid-template-columns:1fr; }
      .overview-actions, .file-actions { width:100%; }
      .overview-actions > *, .file-actions > * { flex:1 1 auto; }
      .path-box { grid-template-columns:1fr auto; }
      .path-box .status-label { grid-column:1 / -1; }
      .progress-track { grid-template-columns:1fr 1fr; }
    }
    ${WORKBENCH_DESIGN_STYLES}
  </style>
  <script src="/workbench.js" defer></script>
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

export function renderOrderListPage({ rows = [], stats = {}, query = {}, pagination = {}, error = null, csrfToken }) {
  const tableRows = rows.map((order) => `
    <tr>
      <td class="order-cell"><a href="/orders/${order.id}" title="${escapeHtml(order.order_no)}">${escapeHtml(order.order_no)}</a><small>ID ${escapeHtml(order.id)} · ${escapeHtml(formatOrderStatus(order.status))}</small></td>
      <td>${renderOrderKindBadge(order)}<span class="cell-subtext">${escapeHtml(order.customerLabel)}</span></td>
      <td>${escapeHtml(formatCompactDate(order.created_at))}</td>
      <td>${renderSyncSummary(order.file_sync_summary)}</td>
      <td>${statusBadge(formatSliceStatus(order.sliceStatus), sliceListStatusClass(order.sliceStatus))}</td>
      <td>${statusBadge(formatLocalState(order.localState), localStateClass(order.localState))}</td>
      <td>${statusBadge(formatPaymentStatus(order.payment_status), paymentStatusClass(order.payment_status))}</td>
      <td>${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))}</td>
      <td>${escapeHtml(formatLeadTime(order))}</td>
      <td>${escapeHtml(formatCompactDate(order.updatedAt))}</td>
      <td><span class="next-action ${escapeHtml(order.next.severity)}">${escapeHtml(order.next.label)}</span><span class="cell-subtext">${escapeHtml(order.next.detail)}</span></td>
      <td><div class="row-actions"><a class="button-link primary" href="/orders/${order.id}">处理</a><details class="row-more"><summary>更多</summary><div><a href="/orders/${order.id}#audit-log">查看操作记录</a></div></details></div></td>
    </tr>`).join("");

  const hasFilters = Boolean(query.q || query.localState || query.fileStatus || query.sliceStatus || query.paymentStatus || query.customerType || query.date || query.exception || query.customerReply);
  const body = `
    <div class="page-heading"><div><h2>订单工作台</h2><p>按阻塞项和下一步优先处理，线上订单数据保持只读。</p></div><button type="button" data-local-refresh>刷新数据</button></div>
    ${error ? `<section class="state-view error list-notice"><h3>订单数据加载失败</h3><p>${escapeHtml(error)}</p><a class="button-link primary" href="/">重新加载</a></section>` : ""}
    <nav class="stat-strip" aria-label="订单统计">
      ${renderStatCard("全部订单", stats.all, {})}
      ${renderStatCard("待处理", stats.actionable, { exception: "", local_state: "UNREVIEWED" })}
      ${renderStatCard("文件异常", stats.fileAbnormal, { exception: "file" })}
      ${renderStatCard("切片失败", stats.sliceFailed, { slice_status: "failed" })}
      ${renderStatCard("等待客户", stats.waitingCustomer, { customer_reply: "waiting" })}
      ${renderStatCard("今日新增", stats.todayNew, { date: "today" })}
    </nav>
    <section class="panel filter-panel">
      <form method="GET" action="/orders" data-order-list-form>
        <div class="search-row">
          ${renderFilterField("搜索", `<input name="q" value="${escapeHtml(query.q || "")}" placeholder="订单号、订单 ID、客户类型或文件名">`)}
          ${renderFilterField("排序", renderSelect("sort", query.sort, [["priority","处理优先级"],["updated_desc","最近更新"],["created_desc","下单时间：新到旧"],["created_asc","下单时间：旧到新"],["amount_desc","金额：高到低"]]))}
          ${renderFilterField("每页", renderSelect("page_size", query.pageSize, [[20,"20 条"],[50,"50 条"]]))}
          <div class="filter-actions"><button class="primary" type="submit">应用筛选</button><a class="button-link" href="/orders">清除筛选</a><span class="refresh-indicator">正在刷新…</span></div>
        </div>
        <div class="filter-grid">
          ${renderFilterField("本地处理", renderSelect("local_state", query.localState, localStateOptions()))}
          ${renderFilterField("文件状态", renderSelect("file_status", query.fileStatus, fileStatusOptions()))}
          ${renderFilterField("切片状态", renderSelect("slice_status", query.sliceStatus, sliceStatusOptions()))}
          ${renderFilterField("支付状态", renderSelect("payment_status", query.paymentStatus, paymentStatusOptions()))}
          ${renderFilterField("订单类型", renderSelect("customer_type", query.customerType, [["","全部"],["test","TEST"],["real","真实订单"],["unknown","身份未确认"]]))}
          ${renderFilterField("下单日期", renderSelect("date", query.date, [["","不限"],["today","今天"],["7d","最近 7 天"],["30d","最近 30 天"]]))}
          ${renderFilterField("异常", renderSelect("exception", query.exception, [["","全部"],["1","全部异常"],["file","文件异常"]]))}
          ${renderFilterField("客户回复", renderSelect("customer_reply", query.customerReply, [["","全部"],["waiting","等待客户"],["received","客户已回复"]]))}
        </div>
      </form>
    </section>
    <section class="panel">
      <div class="list-meta"><span>${error ? "数据未加载" : `显示 ${escapeHtml(pagination.startRow || 0)}-${escapeHtml(pagination.endRow || 0)}，共 ${escapeHtml(pagination.totalRows || 0)} 条${hasFilters ? "筛选结果" : "订单"}`}</span><span>默认按阻塞项和人工下一步排序</span></div>
      <div class="table-wrap orders-table-wrap"><table class="orders-table">
        <thead><tr>
          <th class="col-order">订单</th><th class="col-customer">客户</th><th class="col-time">创建时间</th><th class="col-files">文件</th><th class="col-slice">切片</th><th class="col-state">本地状态</th>
          <th class="col-payment">支付</th><th class="col-money">报价</th><th class="col-lead">货期</th><th class="col-time">最近更新</th><th class="col-next">下一步</th><th class="col-action">操作</th>
        </tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
      ${!error && !tableRows ? `<div class="state-view"><h3>${hasFilters ? "没有符合条件的订单" : "当前没有订单"}</h3><p>${hasFilters ? "调整搜索或筛选条件后重试。" : "新订单出现后会在这里显示。"}</p>${hasFilters ? '<a class="button-link" href="/orders">清除筛选</a>' : ""}</div>` : ""}
      ${renderPagination(query, pagination)}
    </section>`;
  return renderLayout({ title: `Make3D ${TEXT.title}`, body, csrfToken });
}

function renderStatCard(label, value, patch) {
  return `<a class="stat-card" href="${escapeHtml(buildQueryHref(patch))}"><strong>${escapeHtml(value || 0)}</strong><span>${escapeHtml(label)}</span></a>`;
}

function renderFilterField(label, control) {
  return `<label class="filter-field">${escapeHtml(label)}${control}</label>`;
}

function renderSelect(name, selected, options) {
  return `<select name="${escapeHtml(name)}">${options.map(([value, label]) => `<option value="${escapeHtml(value)}" ${String(selected ?? "") === String(value) ? "selected" : ""}>${escapeHtml(label)}</option>`).join("")}</select>`;
}

function renderPagination(query, pagination) {
  if (!pagination || pagination.totalPages <= 1) return "";
  const previous = buildQueryHref({ ...queryForHref(query), page: Math.max(1, pagination.page - 1) });
  const next = buildQueryHref({ ...queryForHref(query), page: Math.min(pagination.totalPages, pagination.page + 1) });
  return `<nav class="pagination" aria-label="订单分页"><span>第 ${escapeHtml(pagination.page)} / ${escapeHtml(pagination.totalPages)} 页</span><div class="pagination-links"><a class="button-link" href="${escapeHtml(previous)}" aria-disabled="${pagination.page <= 1}">上一页</a><a class="button-link" href="${escapeHtml(next)}" aria-disabled="${pagination.page >= pagination.totalPages}">下一页</a></div></nav>`;
}

function buildQueryHref(values = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) if (value !== "" && value != null && value !== false) params.set(key, String(value));
  return `/orders${params.size ? `?${params}` : ""}`;
}

function queryForHref(query) {
  return {
    q: query.q, local_state: query.localState, file_status: query.fileStatus, slice_status: query.sliceStatus,
    payment_status: query.paymentStatus, customer_type: query.customerType, date: query.date,
    exception: query.exception, customer_reply: query.customerReply, sort: query.sort, page_size: query.pageSize,
  };
}

export function renderOrderDetailPage({ detail, localChecks, localFilesRoot, review, sliceResult, auditEvents = [], notice = null, csrfToken }) {
  const order = detail.order;
  const fileCards = detail.files.map((file) => {
    const check = localChecks.get(file.local_file_sync_job_id) || {};
    return renderFileCard({ order, file, check, csrfToken });
  }).join("");

  const messages = detail.customer_service_requests.map((item) => `
    <li>
      <strong>${escapeHtml(item.created_at || "")}</strong>
      <span class="pill">${escapeHtml(formatCustomerServiceStatus(item.status))}</span>
      <div>${escapeHtml(item.message || "")}</div>
      ${item.customer_visible_reply ? `<div class="muted">客户可见回复：${escapeHtml(item.customer_visible_reply)}</div>` : ""}
    </li>`).join("");

  const primaryFile = detail.files.find((file) => canAttemptSlice(file, localChecks.get(file.local_file_sync_job_id) || {})) || detail.files[0] || null;
  const body = `
    <p class="breadcrumb"><a href="/">← 返回订单列表</a></p>
    ${renderNotice(notice)}
    ${renderOrderOverview({ order, detail, review, sliceResult, primaryFile, localChecks, csrfToken })}
    <div class="workspace-grid">
      <div class="main-column">
        <section class="panel" id="order-info">
          <div class="section-head"><h3>客户与订单信息</h3><span class="pill">客户隐私保护</span></div>
          <dl class="info-grid">
            <div class="info-item"><dt>客户资料</dt><dd>本地接口已脱敏，不显示电话、微信和邮箱</dd></div>
            <div class="info-item"><dt>下单时间</dt><dd>${escapeHtml(order.created_at || "暂不可用")}</dd></div>
            <div class="info-item"><dt>配送方式</dt><dd>${escapeHtml(order.delivery_method || "以线上订单为准")}</dd></div>
            <div class="info-item"><dt>材料 / 颜色 / 数量</dt><dd>${escapeHtml(order.material)} / ${escapeHtml(order.color || "未填写")} / ${escapeHtml(order.quantity)}</dd></div>
            <div class="info-item"><dt>线上报价 / 货期</dt><dd>${escapeHtml(formatMoney(order.final_price ?? order.payable_price ?? order.estimated_price))} / ${escapeHtml(formatLeadTime(order))}</dd></div>
            <div class="info-item"><dt>客户备注</dt><dd>${escapeHtml(order.remark || "无")}</dd></div>
          </dl>
          ${isPaidOrder(order.payment_status) ? '<p class="warn">订单已经付款，本地草稿不会直接改变已付款金额。</p>' : ""}
        </section>
        <section class="panel panel-primary" id="files">
          <div class="section-head"><div><h3>文件信息</h3><p class="section-note">本地 STL / 模型文件 · 根目录：<code>${escapeHtml(localFilesRoot || "/srv/make3d-worker/files")}</code></p></div><span class="status-badge ${fileStatusClass(primaryFile, localChecks)}">${escapeHtml(primaryFile ? formatSyncStatus(primaryFile.sync_status) : "无文件")}</span></div>
          ${fileCards || '<p class="muted">该订单没有文件</p>'}
        </section>
        ${renderSliceSettings({ order, file: primaryFile, sliceResult, localChecks, csrfToken })}
        ${renderSliceResult(sliceResult)}
        ${renderQuoteAndReplyPanel(order, review, csrfToken)}
        <section class="panel">
          <h3>客户消息和可见回复</h3>
          <ul>${messages || '<li class="muted">暂无记录</li>'}</ul>
        </section>
        <details class="panel" id="audit-log"><summary><strong>本地操作记录</strong></summary><ul>${renderAuditEvents(auditEvents)}</ul></details>
      </div>
      <aside class="side-column" id="operator-work">
        <div class="side-sticky">
          ${renderOperatorSidebar({ order, review, sliceResult, primaryFile, localChecks, csrfToken })}
          ${renderOnlineSyncPreparation(order, review, detail.order_version, csrfToken)}
        </div>
      </aside>
    </div>`;
  return renderLayout({ title: `${order.order_no} - Make3D ${TEXT.title}`, body, csrfToken });
}

function renderOrderOverview({ order, detail, review, sliceResult, primaryFile, localChecks, csrfToken }) {
  const check = primaryFile ? localChecks.get(primaryFile.local_file_sync_job_id) || {} : {};
  const primaryAction = renderPrimaryAction({ order, file: primaryFile, check, sliceResult, csrfToken });
  return `<section class="panel order-overview">
    <div class="overview-row">
      <div class="overview-title">
        <h2>${escapeHtml(order.order_no)} ${renderOrderKindBadge(order)}</h2>
        <span class="muted">订单 ID ${escapeHtml(order.id)} · ${order.is_test_account === true ? "TEST 操作边界" : "真实订单只读"}</span>
      </div>
      <div class="overview-actions">
        <a class="button-link" href="#operator-work">保存本地审核</a>
        ${primaryAction}
        <a class="button-link" href="#audit-log">更多信息</a>
      </div>
    </div>
    <div class="status-strip">
      ${statusItem("处理状态", formatLocalState(review?.state || "UNREVIEWED"), localStateClass(review?.state))}
      ${statusItem("付款状态", formatPaymentStatus(order.payment_status), paymentStatusClass(order.payment_status))}
      ${statusItem("文件状态", primaryFile ? formatSyncStatus(primaryFile.sync_status) : "无文件", fileStatusClass(primaryFile, localChecks))}
      ${statusItem("切片状态", displaySliceStage(sliceResult), sliceStatusClass(sliceResult))}
      ${statusItem("订单创建", order.created_at || "暂不可用", "status-idle")}
      ${statusItem("最后更新", order.updated_at || order.created_at || "暂不可用", "status-idle")}
    </div>
    <span class="inline-note">线上数据版本 ${escapeHtml(shortSha(detail.order_version))}</span>
    ${order.is_test_account === true ? "" : '<p class="danger" style="margin:10px 0 0">真实订单：只读预览，不会启动切片或同步线上。</p>'}
  </section>`;
}

function renderFileCard({ order, file, check, csrfToken }) {
  const canOpen = Boolean(file.local_file_sync_job_id)
    && ["verified", "local_synced"].includes(String(file.sync_status || ""))
    && check.exists === true && check.size_matches !== false;
  const canPull = Boolean(file.local_file_sync_job_id)
    && !["locked", "downloaded"].includes(String(file.sync_status || ""));
  const path = check.path || "";
  return `<article class="file-card">
    <div class="file-head">
      <div class="file-title"><strong title="${escapeHtml(file.original_filename || file.masked_filename)}">${escapeHtml(file.original_filename || file.masked_filename)}</strong><span class="inline-note">文件 ID ${escapeHtml(file.file_id)} · ${escapeHtml(String(file.format || "").toUpperCase())}${file.original_filename ? "" : " · 原名已脱敏"}</span></div>
      <span class="status-badge ${file.sync_status === "verified" ? "status-success" : file.sync_status === "failed" ? "status-failed" : "status-progress"}">${escapeHtml(formatSyncStatus(file.sync_status))}</span>
    </div>
    <div class="file-meta-grid">
      <div class="result-card"><span>线上 / 本地大小</span><strong>${escapeHtml(formatBytes(file.expected_size_bytes ?? file.filesize))} / ${escapeHtml(check.exists ? formatBytes(check.size) : "无")}</strong></div>
      <div class="result-card"><span>SHA-256</span><strong>${escapeHtml(shortSha(file.expected_sha256))} · ${check.sha_matches === true ? "通过" : check.sha_matches === false ? "失败" : "未检查"}</strong></div>
      <div class="result-card"><span>文件存在</span><strong>${check.exists === true ? "是" : "否"}</strong></div>
      <div class="result-card"><span>最近同步</span><strong>${escapeHtml(file.local_synced_at || check.modified_at || "无")}</strong></div>
    </div>
    <div class="path-box"><span class="status-label">本地目录</span><code class="path-value" title="${escapeHtml(check.directory || "")}">${escapeHtml(check.directory || "尚未拉取")}</code>${check.directory ? `<button type="button" class="text-button" data-copy-value="${escapeHtml(check.directory)}">复制</button>` : ""}</div>
    <div class="path-box"><span class="status-label">完整路径</span><code class="path-value" title="${escapeHtml(path)}">${escapeHtml(path || "尚未拉取")}</code>${path ? `<button type="button" class="text-button" data-copy-value="${escapeHtml(path)}">复制</button>` : ""}</div>
    ${file.last_error_summary || check.error ? `<p class="danger">${escapeHtml(file.last_error_summary || formatLocalCheckError(check.error))}</p>` : ""}
    <div class="file-actions">
      ${file.local_file_sync_job_id ? `
        <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/pull" data-busy-form><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="order_id" value="${escapeHtml(order.id)}"><button type="submit" ${canPull ? "" : "disabled"}>${check.exists ? "重新检查" : "拉取文件"}</button></form>
        <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/verify-sha" data-busy-form><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="order_id" value="${escapeHtml(order.id)}"><button type="submit">校验 SHA</button></form>
        <form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/open-directory" data-open-directory-form><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="order_id" value="${escapeHtml(order.id)}"><button type="submit" ${canOpen ? "" : "disabled"}>打开 STL 所在文件夹</button><span class="inline-note" data-open-directory-message aria-live="polite"></span></form>` : '<span class="danger">尚未生成同步任务</span>'}
    </div>
  </article>`;
}

function renderSliceSettings({ order, file, sliceResult, localChecks, csrfToken }) {
  const settings = sliceSettingsFromResult(sliceResult);
  const check = file ? localChecks.get(file.local_file_sync_job_id) || {} : {};
  const canSlice = file && canAttemptSlice(file, check) && order.is_test_account === true;
  const complete = isCompleteSlice(sliceResult);
  return `<section class="panel" id="slice-settings">
    <div class="section-head"><div><h3>切片设置</h3><p class="section-note">当前配置用于本地人工验证，不会自动修改报价或订单。</p></div><span class="pill">Bambu P1S</span></div>
    <form method="POST" action="/orders/${order.id}/local-slice/confirm" data-busy-form>
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <input type="hidden" name="sync_job_id" value="${escapeHtml(file?.local_file_sync_job_id || "")}">
      <input type="hidden" name="force_reslice" value="${complete ? "1" : "0"}">
      <div class="slice-settings">
        <label>材料<select disabled><option>${escapeHtml(order.material || "PLA")}</option></select></label>
        <label>颜色<input disabled value="${escapeHtml(order.color || "未填写")}"></label>
        <label>数量<input disabled value="${escapeHtml(order.quantity || 1)}"></label>
        <label>喷嘴直径<input disabled value="0.4 mm"></label>
        <label>层高<select name="layer_height_mm"><option value="0.12" ${settings.layerHeight === 0.12 ? "selected" : ""}>0.12 mm</option><option value="0.16" ${settings.layerHeight === 0.16 ? "selected" : ""}>0.16 mm</option><option value="0.2" ${settings.layerHeight === 0.2 ? "selected" : ""}>0.20 mm</option><option value="0.28" ${settings.layerHeight === 0.28 ? "selected" : ""}>0.28 mm</option></select></label>
        <label>填充率<input name="fill_density_percent" type="number" min="0" max="100" step="1" value="${escapeHtml(settings.fillDensity)}"></label>
        <label>支撑<select name="support_mode"><option value="none" ${settings.supportMode === "none" ? "selected" : ""}>不启用</option><option value="build_plate" ${settings.supportMode === "build_plate" ? "selected" : ""}>仅从热床生成</option><option value="everywhere" ${settings.supportMode === "everywhere" ? "selected" : ""}>所有位置</option></select></label>
        <label>裙边宽度<input name="brim_width_mm" type="number" min="0" max="20" step="0.1" value="${escapeHtml(settings.brimWidth)}"></label>
        <label>壁数<input disabled value="2（配置文件）"></label>
      </div>
      <details class="technical-details"><summary>高级参数</summary><p class="inline-note">配置 SHA ${escapeHtml(shortSha(sliceResult?.profile_sha256))} · 最大成型范围 256 × 256 × 256 mm · 解析器 ${escapeHtml(sliceResult?.parser_version || "phase05-c-parser-v1")}</p></details>
      <div class="action-row"><p class="inline-note">${canSlice ? "文件已验证，可以开始切片。" : order.is_test_account !== true ? "真实订单禁止切片。" : "文件尚未完成本地验证。"}</p><button class="primary" type="submit" ${canSlice ? "" : "disabled"}>${complete ? "进入重新切片确认" : sliceResult?.status === "failed" || sliceResult?.status === "partial" ? "修正后进入切片确认" : "进入切片确认"}</button></div>
    </form>
  </section>`;
}

function renderQuoteAndReplyPanel(order, review, csrfToken) {
  return `<section class="panel" id="quote-draft"><div class="section-head"><h3>修改价格和货期、准备客户回复</h3><span class="pill">仅本地</span></div><p class="section-note">本地草稿与线上正式数据分离，保存不会通知客户。</p>
    <form method="POST" action="/orders/${order.id}/local-review" data-local-save-form>
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <div class="info-grid">
        <label>参考价格（元）<input name="suggested_price_yuan" inputmode="decimal" value="${escapeHtml(formatCentsInput(review?.suggested_price_cents))}"></label>
        <label>确认价格（元）<input name="confirmed_price_yuan" inputmode="decimal" value="${escapeHtml(formatCentsInput(review?.confirmed_price_cents))}"></label>
        <label>最短货期（小时）<input name="lead_time_min_hours" inputmode="numeric" value="${escapeHtml(review?.lead_time_min_hours ?? "")}"></label>
        <label>最长货期（小时）<input name="lead_time_max_hours" inputmode="numeric" value="${escapeHtml(review?.lead_time_max_hours ?? "")}"></label>
        <label>预计发货时间<input name="estimated_ship_at" value="${escapeHtml(review?.estimated_ship_at ?? "")}" placeholder="YYYY-MM-DD HH:mm"></label>
        <label>客户回复模板<select name="reply_template">${["","FILE_RECEIVED","FILE_CONFIRMED","MODEL_PROBLEM_REUPLOAD","CONFIRM_MATERIAL_COLOR_QUANTITY","QUOTE_MANUAL_CONFIRM","LEAD_TIME_UPDATED","CONFIRM_SUPPORT_OR_APPEARANCE","PLAIN_TEXT"].map((value) => `<option value="${value}" ${review?.reply_template === value ? "selected" : ""}>${escapeHtml(formatReplyTemplate(value))}</option>`).join("")}</select></label>
      </div>
      <label>给客户的回复草稿<textarea name="reply_draft" maxlength="4000">${escapeHtml(review?.reply_draft || "")}</textarea></label>
      <button type="submit">保存报价与回复草稿</button>
    </form>
  </section>`;
}

function renderOperatorSidebar({ order, review, sliceResult, primaryFile, localChecks, csrfToken }) {
  const nextStep = nextStepMessage(order, review, sliceResult, primaryFile, localChecks);
  return `<section class="panel compact-form"><div class="section-head"><h3>当前处理</h3>${statusBadge(formatLocalState(review?.state || "UNREVIEWED"), localStateClass(review?.state))}</div>
    <p class="next-step"><strong>下一步建议</strong><br>${escapeHtml(nextStep)}</p>
    <form method="POST" action="/orders/${order.id}/local-review" data-local-save-form>
      <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
      <label>本地处理状态<select name="state">${["UNREVIEWED","REVIEWING","FILE_PROBLEM","READY_TO_SLICE","SLICING","SLICE_REVIEWED","SLICE_CONFIRMED","SLICE_NEEDS_FIX","QUOTE_DRAFTED","READY_FOR_ONLINE_SYNC","CLOSED"].map((value) => `<option value="${value}" ${review?.state === value ? "selected" : ""}>${escapeHtml(formatLocalState(value))}</option>`).join("")}</select></label>
      <label>内部处理备注<textarea name="operator_note" maxlength="2000">${escapeHtml(review?.operator_note || "")}</textarea></label>
      <button class="primary" type="submit">保存本地审核</button>
    </form>
  </section>`;
}

function renderPrimaryAction({ order, file, check, sliceResult, csrfToken }) {
  if (!file?.local_file_sync_job_id) return '<button disabled>无可用文件</button>';
  if (!check.exists || check.sha_matches !== true) return `<form class="inline" method="POST" action="/local/files/${file.local_file_sync_job_id}/pull" data-busy-form><input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}"><input type="hidden" name="order_id" value="${escapeHtml(order.id)}"><button class="primary" type="submit">拉取文件</button></form>`;
  if (isCompleteSlice(sliceResult)) return '<a class="button-link primary" href="#slice-result">查看切片结果</a>';
  return '<a class="button-link primary" href="#slice-settings">开始切片</a>';
}

function statusItem(label, value, className) {
  return `<div class="status-item"><span class="status-label">${escapeHtml(label)}</span><span class="status-value ${className}">${escapeHtml(value)}</span></div>`;
}

function statusBadge(value, className) {
  return `<span class="status-badge ${className}">${escapeHtml(value)}</span>`;
}

export function renderLocalSliceConfirmPage({ detail, file, csrfToken, profileName, profileKey, sliceParams, forceReslice = false }) {
  const order = detail.detail.order;
  const body = `
    <p class="breadcrumb"><a href="/orders/${order.id}">← 返回订单详情</a></p>
    <section class="panel" style="max-width:960px;margin-inline:auto">
      <div class="section-head"><div><h2>${forceReslice ? "确认重新切片" : "确认执行本地单次切片"}</h2><p class="section-note">浏览器将显示验证、切片、解析和保存阶段。</p></div>${renderOrderKindBadge(order)}</div>
      <p class="warn">本操作只运行本地 PrusaSlicer，不会同步价格、货期、订单状态、支付、退款或微信支付。</p>
      <div class="info-grid">
        <div class="info-item"><dt>订单号</dt><dd>${escapeHtml(order.order_no)}</dd></div>
        <div class="info-item"><dt>文件</dt><dd>${escapeHtml(file.original_filename || file.masked_filename)}</dd></div>
        <div class="info-item"><dt>文件大小</dt><dd>${escapeHtml(formatBytes(file.filesize))}</dd></div>
        <div class="info-item"><dt>材料 / 数量</dt><dd>${escapeHtml(order.material || "")} / ${escapeHtml(order.quantity)}</dd></div>
        <div class="info-item"><dt>切片配置</dt><dd>${escapeHtml(profileName)} · ${escapeHtml(profileKey)}</dd></div>
        <div class="info-item"><dt>参数</dt><dd>0.4 mm 喷嘴 / ${escapeHtml(sliceParams.layer_height_microns / 1000)} mm 层高 / ${escapeHtml(sliceParams.fill_density_percent)}% 填充 / ${escapeHtml(formatSupportMode(sliceParams.support_mode))} / ${escapeHtml(sliceParams.brim_width_microns / 1000)} mm 裙边</dd></div>
      </div>
      <div id="slice-progress" hidden>
        <div class="progress-track">
          <div class="progress-stage" data-stage="VALIDATING">验证 STL</div>
          <div class="progress-stage" data-stage="SLICING">生成 G-code</div>
          <div class="progress-stage" data-stage="PARSING">解析指标</div>
          <div class="progress-stage" data-stage="SUCCESS">保存结果</div>
        </div>
        <p id="slice-progress-message" class="next-step">等待开始</p>
        <div id="slice-live-result"></div>
      </div>
      <form method="POST" action="/orders/${order.id}/local-slice/run" data-slice-run-form data-order-id="${escapeHtml(order.id)}">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <input type="hidden" name="sync_job_id" value="${escapeHtml(file.local_file_sync_job_id)}">
        <input type="hidden" name="layer_height_mm" value="${escapeHtml(sliceParams.layer_height_microns / 1000)}">
        <input type="hidden" name="fill_density_percent" value="${escapeHtml(sliceParams.fill_density_percent)}">
        <input type="hidden" name="support_mode" value="${escapeHtml(sliceParams.support_mode)}">
        <input type="hidden" name="brim_width_mm" value="${escapeHtml(sliceParams.brim_width_microns / 1000)}">
        <input type="hidden" name="force_reslice" value="${forceReslice ? "1" : "0"}">
        <button class="primary" type="submit">${forceReslice ? "确认重新切片" : "确认并开始切片"}</button>
      </form>
    </section>`;
  return renderLayout({ title: `确认本地切片 - ${order.order_no}`, body, csrfToken });
}

export function renderOnlineSyncConfirmPage({ detail, payload, csrfToken }) {
  const order = detail.detail.order;
  const previous = detail.detail.latest_operator_confirmation;
  const body = `
    <p><a href="/orders/${order.id}">返回订单详情</a></p>
    <section class="panel">
      <h2>TEST 订单线上同步二次确认</h2>
      <p class="danger">仅限 TEST 订单。本操作将新增人工报价、预计货期和客户可见回复，不会修改订单状态、支付、退款、上传文件、报价引擎、微信支付或切片任务。</p>
      <div class="grid">
        <p><strong>订单号</strong><br>${escapeHtml(order.order_no)}</p>
        <p><strong>TEST 标识</strong><br>${order.is_test_account ? '<span class="ok">TEST 安全订单</span>' : '<span class="danger">不是 TEST 订单</span>'}</p>
        <p><strong>原人工报价</strong><br>${escapeHtml(previous ? formatCents(previous.confirmed_quote_amount_cents) : "无")}</p>
        <p><strong>新人工报价</strong><br>${escapeHtml(formatCents(payload.confirmed_quote_amount_cents))}</p>
        <p><strong>原预计货期</strong><br>${escapeHtml(previous ? formatHourRange(previous.lead_time_min_hours, previous.lead_time_max_hours) : "无")}</p>
        <p><strong>新预计货期</strong><br>${escapeHtml(formatHourRange(payload.lead_time_min_hours, payload.lead_time_max_hours))}</p>
        <p><strong>线上数据版本</strong><br><code>${escapeHtml(payload.expected_order_version)}</code></p>
      </div>
      <h3>客户回复预览</h3>
      <p><span class="pill">${escapeHtml(formatMessageType(payload.message_type))}</span></p>
      <pre>${escapeHtml(payload.message_body)}</pre>
      <form method="POST" action="/orders/${order.id}/online-sync/run">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        ${Object.entries(payload).map(([key, value]) =>
          `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value ?? "")}">`,
        ).join("")}
        <button class="primary" type="submit" ${order.is_test_account === true ? "" : "disabled"}>${order.is_test_account === true ? "确认并同步到 TEST 订单" : "真实订单禁止同步"}</button>
      </form>
    </section>`;
  return renderLayout({ title: `确认 TEST 订单同步 - ${order.order_no}`, body, csrfToken });
}

export function renderMessagePage({ title, message, backHref = "/" }) {
  return renderLayout({
    title,
    csrfToken: "",
    body: `<section class="panel"><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(backHref)}">返回</a></p></section>`,
  });
}

function renderNotice(notice) {
  if (!notice?.message) return "";
  const className = notice.kind === "success" ? "ok" : notice.kind === "warning" ? "warn" : "danger";
  const copyPath = notice.copyValue ? `
    <label>Windows 文件夹路径
      <input class="copy-path" readonly value="${escapeHtml(notice.copyValue)}">
    </label>
    <p class="muted">点击路径输入框后按 Ctrl+A、Ctrl+C，再粘贴到 Windows 文件资源管理器地址栏。</p>` : "";
  return `<section class="panel"><p class="${className}">${escapeHtml(notice.message)}</p>${copyPath}</section>`;
}

function renderOnlineSyncPreparation(order, review, orderVersion, csrfToken) {
  const canSync = order.is_test_account === true;
  return `
    <section class="panel">
      <h3>同步到线上 TEST 订单</h3>
      <p class="warn">请先核对人工报价、预计货期和客户回复。线上同步前还会显示一次完整预览并要求二次确认。</p>
      ${canSync ? "" : '<p class="danger">\u771f\u5b9e\u8ba2\u5355\u4ec5\u5141\u8bb8\u672c\u5730\u67e5\u770b\u548c\u8349\u7a3f\uff0c\u201c\u540c\u6b65\u7ebf\u4e0a\u201d\u5df2\u7981\u7528\u3002</p>'}
      <div class="grid">
        <p><strong>草稿报价</strong><br>${escapeHtml(formatCents(review?.confirmed_price_cents))}</p>
        <p><strong>草稿货期</strong><br>${escapeHtml(formatHourRange(review?.lead_time_min_hours, review?.lead_time_max_hours))}</p>
        <p><strong>线上数据版本</strong><br><code>${escapeHtml(orderVersion || "暂不可用")}</code></p>
      </div>
      <h4>客户回复预览</h4>
      <pre>${escapeHtml(review?.reply_draft || "")}</pre>
      <form method="POST" action="/orders/${order.id}/online-sync/prepare">
        <input type="hidden" name="csrf" value="${escapeHtml(csrfToken)}">
        <button class="primary" type="submit" ${canSync ? "" : "disabled"}>${canSync ? "预览并准备同步" : "真实订单禁止同步"}</button>
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

function renderSliceResult(slice) {
  if (!slice) {
    return `<section class="panel" id="slice-result"><div class="section-head"><h3>切片结果</h3>${statusBadge("未开始", "status-idle")}</div><p class="muted">暂无本地切片结果。完成切片后将在这里显示 G-code、打印时间和耗材重量。</p></section>`;
  }
  const metrics = parseMetricsJson(slice.metrics_json);
  const execution = metrics.execution || {};
  const complete = isCompleteSlice(slice);
  const partial = slice.status === "partial";
  const failed = slice.status === "failed";
  const statusText = complete ? "成功" : partial ? "部分完成" : failed ? "失败" : formatSliceStatus(slice.status);
  const statusClass = complete ? "status-success" : partial ? "status-warning" : failed ? "status-failed" : "status-progress";
  return `
    <section class="panel" id="slice-result">
      <div class="section-head"><div><h3>切片结果</h3><p class="section-note">仅供人工审核，不会自动修改线上价格。</p></div>${statusBadge(statusText, statusClass)}</div>
      ${partial ? '<p class="warn">G-code 已生成，但打印时间或耗材重量未完整解析，不能视为完整成功。</p>' : ""}
      ${failed ? `<p class="danger"><strong>失败阶段：</strong>${escapeHtml(formatFailureStage(metrics.failed_stage))}<br><strong>原因：</strong>${escapeHtml(slice.failure_summary || "未知错误")}</p>` : ""}
      <div class="result-grid">
        <div class="result-card"><span>预计打印时间</span><strong>${escapeHtml(formatDuration(slice.print_time_seconds))}</strong></div>
        <div class="result-card"><span>预计材料重量</span><strong>${slice.material_weight_grams ? `${escapeHtml(roundNumber(slice.material_weight_grams, 3))} g` : "暂不可用"}</strong></div>
        <div class="result-card"><span>G-code 大小</span><strong>${escapeHtml(formatBytes(slice.gcode_size_bytes))}</strong></div>
        <div class="result-card"><span>进程退出码</span><strong>${escapeHtml(execution.exit_code ?? (complete || partial ? 0 : "暂不可用"))}</strong></div>
        <div class="result-card"><span>切片器版本</span><strong>${escapeHtml(slice.slicer_version || "暂不可用")}</strong></div>
        <div class="result-card"><span>切片配置</span><strong>${escapeHtml(slice.profile_name || "暂不可用")}</strong></div>
        <div class="result-card"><span>开始时间</span><strong>${escapeHtml(slice.started_at || "暂不可用")}</strong></div>
        <div class="result-card"><span>完成时间</span><strong>${escapeHtml(slice.completed_at || "暂不可用")}</strong></div>
        <div class="result-card"><span>上传模型尺寸</span><strong>${escapeHtml(formatUploadDimensions(slice))}</strong></div>
        <div class="result-card"><span>切片输出范围</span><strong>${escapeHtml(formatSlicingDimensions(slice))}</strong></div>
        <div class="result-card"><span>重量数据来源</span><strong>${escapeHtml(formatWeightSource(slice))}</strong></div>
        <div class="result-card"><span>可用于人工报价</span><strong>${slice.parser_quote_ready && complete ? "是" : "否"}</strong></div>
      </div>
      <div class="path-box"><span class="status-label">G-code 路径</span><code class="path-value" title="${escapeHtml(execution.gcode_absolute_path || "")}">${escapeHtml(execution.gcode_absolute_path || (slice.gcode_relative_path ? `/srv/make3d-worker/${slice.gcode_relative_path}` : "未生成"))}</code>${execution.gcode_absolute_path ? `<button type="button" class="text-button" data-copy-value="${escapeHtml(execution.gcode_absolute_path)}">复制</button>` : ""}</div>
      <div class="path-box"><span class="status-label">G-code SHA</span><code class="path-value" title="${escapeHtml(slice.gcode_sha256 || "")}">${escapeHtml(slice.gcode_sha256 || "暂不可用")}</code></div>
      <details class="technical-details"><summary>技术详情</summary><p><strong>PrusaSlicer：</strong>${escapeHtml(execution.binary_path || "/usr/bin/prusa-slicer")}</p><p><strong>配置路径：</strong>${escapeHtml(execution.profile_path || "暂不可用")}</p><pre>${escapeHtml(Array.isArray(execution.command) ? execution.command.map(shellQuoteDisplay).join(" ") : "命令暂不可用")}</pre>${renderWarnings(slice.warnings_json)}</details>
    </section>`;
}

function renderAuditEvents(events) {
  return events.map((event) => `<li><strong>${escapeHtml(event.created_at)}</strong> <span class="pill">${escapeHtml(formatAuditAction(event.action))}</span> ${escapeHtml(formatAuditResult(event.result))}</li>`).join("")
    || '<li class="muted">暂无本地操作记录</li>';
}

function renderSyncSummary(summary = {}) {
  const status = summary.status || "unknown";
  const className = status === "verified" ? "ok" : status === "failed" ? "danger" : "muted";
  return `<span class="${className}">${escapeHtml(formatSyncStatus(status))}</span><br><span class="muted">已验证 ${escapeHtml(summary.verified_count || 0)}/${escapeHtml(summary.file_count || 0)}</span>`;
}

function canAttemptSlice(file, check) {
  const ext = String(file.relative_path || file.masked_filename || "").toLowerCase().split(".").pop();
  return (file.sync_status === "verified" || file.sync_status === "local_synced")
    && check.exists === true
    && check.size_matches === true
    && (ext === "stl" || ext === "3mf");
}

function formatMoney(value) {
  if (value == null || value === "") return "未确认";
  const amount = Number(value);
  return Number.isFinite(amount) ? `¥${amount.toFixed(2)}` : "未确认";
}

function formatCents(value) {
  if (value == null || value === "") return "未确认";
  const cents = Number(value);
  return Number.isSafeInteger(cents) ? `¥${(cents / 100).toFixed(2)}` : "未确认";
}

function formatCentsInput(value) {
  if (value == null || value === "") return "";
  const cents = Number(value);
  return Number.isSafeInteger(cents) ? (cents / 100).toFixed(2) : "";
}

function formatHourRange(min, max) {
  if (min == null || max == null || min === "" || max === "") return "未确认";
  const minHours = Number(min);
  const maxHours = Number(max);
  if (!Number.isSafeInteger(minHours) || !Number.isSafeInteger(maxHours)) return "未确认";
  return minHours === maxHours ? `${minHours} 小时` : `${minHours}-${maxHours} 小时`;
}

function formatLeadTime(order) {
  if (order.final_lead_time_hours) return `${order.final_lead_time_hours} 小时`;
  const min = order.estimated_lead_time_min_hours;
  const max = order.estimated_lead_time_max_hours;
  if (min && max) return `${min}-${max} 小时`;
  return "未确认";
}

function formatUploadDimensions(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  const dimensions = metrics.dimension_sources?.upload_model_dimensions;
  return formatDimensionObject(dimensions, "暂不可用");
}

function formatWeightSource(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  return formatMetricSource(metrics.metric_sources?.filament_weight_source);
}

function formatSlicingDimensions(slice) {
  const metrics = parseMetricsJson(slice.metrics_json);
  const dimensions = metrics.dimension_sources?.parser_dimensions || {
    x_mm: slice.dimensions_x,
    y_mm: slice.dimensions_y,
    z_mm: slice.dimensions_z,
    source: metrics.dimension_sources?.parser_dimensions_source,
  };
  return `${formatDimensionObject(dimensions, "暂不可用")}（${formatMetricSource(dimensions?.source)}）`;
}

function formatDimensionObject(dimensions, fallback) {
  if (!dimensions) return fallback;
  const x = dimensions.x_mm == null ? "暂不可用" : `${dimensions.x_mm}mm`;
  const y = dimensions.y_mm == null ? "暂不可用" : `${dimensions.y_mm}mm`;
  const z = dimensions.z_mm == null ? "暂不可用" : `${dimensions.z_mm}mm`;
  return `${x} / ${y} / ${z}`;
}

function renderWarnings(value) {
  let warnings = [];
  try {
    warnings = JSON.parse(value || "[]");
  } catch {
    warnings = [];
  }
  if (!warnings.length) return '<h4>解析器提示（级别 / 代码 / 内容）</h4><p class="muted">没有解析器提示</p>';
  return `<h4>解析器提示（级别 / 代码 / 内容）</h4><ul>${warnings.map((warning) => {
    const parsed = parseWarning(warning);
    return `<li class="warn"><strong>${escapeHtml(parsed.severity)}</strong> ${escapeHtml(parsed.code)}: ${escapeHtml(parsed.message)}</li>`;
  }).join("")}</ul>`;
}

function isCompleteSlice(slice) {
  return slice?.status === "parsed"
    && Number(slice.gcode_size_bytes) > 0
    && Number(slice.print_time_seconds) > 0
    && Number(slice.material_weight_grams) > 0;
}

function displaySliceStage(slice) {
  if (isCompleteSlice(slice)) return "成功";
  if (slice?.status === "partial") return "部分完成";
  if (slice?.status === "failed") return "失败";
  if (slice?.status === "slicing") return "进行中";
  return "未开始";
}

function sliceStatusClass(slice) {
  if (isCompleteSlice(slice)) return "status-success";
  if (slice?.status === "partial") return "status-warning";
  if (slice?.status === "failed") return "status-failed";
  if (slice?.status === "slicing") return "status-progress";
  return "status-idle";
}

function localStateClass(value) {
  if (["SLICING", "REVIEWING"].includes(String(value || ""))) return "status-progress";
  if (["SLICE_REVIEWED", "SLICE_CONFIRMED", "READY_FOR_ONLINE_SYNC", "CLOSED"].includes(String(value || ""))) return "status-success";
  if (["FILE_PROBLEM", "SLICE_NEEDS_FIX"].includes(String(value || ""))) return "status-failed";
  if (["READY_TO_SLICE", "QUOTE_DRAFTED"].includes(String(value || ""))) return "status-warning";
  return "status-idle";
}

function paymentStatusClass(value) {
  const key = String(value || "").toLowerCase();
  if (key === "paid") return "status-success";
  if (["pending"].includes(key)) return "status-progress";
  if (["partially_refunded", "refunded"].includes(key)) return "status-warning";
  if (["failed", "closed"].includes(key)) return "status-failed";
  return "status-idle";
}

function fileStatusClass(file, localChecks) {
  if (!file) return "status-idle";
  const check = localChecks instanceof Map ? localChecks.get(file.local_file_sync_job_id) || {} : {};
  if (["verified", "local_synced"].includes(String(file.sync_status || "")) && check.exists === true && check.sha_matches === true) return "status-success";
  if (file.sync_status === "failed" || check.sha_matches === false) return "status-failed";
  if (["locked", "downloaded", "pending"].includes(String(file.sync_status || ""))) return "status-progress";
  return "status-idle";
}

function sliceSettingsFromResult(slice) {
  const params = parseMetricsJson(slice?.metrics_json).slice_params || {};
  return {
    layerHeight: Number(params.layer_height_microns || 200) / 1000,
    fillDensity: Number(params.fill_density_percent ?? 50),
    supportMode: String(params.support_mode || "none"),
    brimWidth: Number(params.brim_width_microns || 0) / 1000,
  };
}

function nextStepMessage(order, review, slice, file, localChecks) {
  if (order?.is_test_account !== true) return "真实订单保持只读，不能从本地工作台启动切片或同步线上。";
  if (!file) return "订单没有可用文件，请先检查线上订单。";
  const check = localChecks.get(file.local_file_sync_job_id) || {};
  if (!check.exists || check.sha_matches !== true) return "文件尚未通过本地存在、大小和 SHA 校验，请先拉取或重新检查。";
  if (slice?.status === "failed") return `切片失败：${slice.failure_summary || "请展开切片结果查看技术详情"}`;
  if (slice?.status === "partial") return "G-code 已生成，但指标不完整，请检查解析器提示后重新切片。";
  if (isCompleteSlice(slice)) return "切片结果完整，可以审核打印时间、耗材重量和报价草稿。";
  if (review?.state === "SLICING") return "切片正在运行，请等待页面阶段状态更新。";
  return "文件已验证，可以开始切片。";
}

function formatSupportMode(value) {
  return ({ none: "不启用支撑", build_plate: "仅从热床生成支撑", everywhere: "所有位置生成支撑" })[value] || String(value || "不启用支撑");
}

function formatDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "暂不可用";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remain = Math.floor(total % 60);
  return [hours ? `${hours}小时` : "", minutes ? `${minutes}分` : "", `${remain}秒`].filter(Boolean).join(" ");
}

function roundNumber(value, decimals) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(decimals).replace(/\.?0+$/, "") : "暂不可用";
}

function formatFailureStage(value) {
  const map = { VALIDATING: "验证 STL", SLICING: "运行 PrusaSlicer", PARSING: "解析 G-code", SAVING: "保存结果" };
  return map[String(value || "")] || "运行 PrusaSlicer";
}

function shellQuoteDisplay(value) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_./:%+-]+$/.test(text) ? text : `'${text.replace(/'/g, "'\\''")}'`;
}

function formatOrderStatus(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    pending: "待处理",
    pending_confirmation: "待确认",
    confirmed: "已确认",
    processing: "处理中",
    printing: "打印中",
    shipped: "已发货",
    completed: "已完成",
    cancelled: "已取消",
    canceled: "已取消",
  };
  return map[key] || String(value || "未填写");
}

function formatPaymentStatus(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    unpaid: "未支付",
    pending: "支付处理中",
    paid: "已支付",
    partially_refunded: "部分退款",
    refunded: "已退款",
    failed: "支付失败",
    closed: "已关闭",
  };
  return map[key] || String(value || "未填写");
}

function isPaidOrder(value) {
  return ["paid", "partially_refunded", "refunded"].includes(String(value || "").trim().toLowerCase());
}

function formatCustomerServiceStatus(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    pending: "待处理",
    processing: "处理中",
    replied: "已回复",
    resolved: "已解决",
    closed: "已关闭",
  };
  return map[key] || String(value || "暂未填写");
}

function formatSyncStatus(value) {
  const key = String(value || "").trim().toLowerCase();
  const map = {
    verified: "已同步并验证",
    local_synced: "本地已同步",
    downloaded: "已下载",
    locked: "同步中",
    syncing: "同步中",
    pending: "等待同步",
    failed: "同步失败",
    missing_sync_job: "未生成同步任务",
    no_files: "无文件",
    unknown: "未知",
  };
  return map[key] || String(value || "未知");
}

function localStateOptions() {
  return [["", "全部"], ...[
    "UNREVIEWED", "REVIEWING", "FILE_PROBLEM", "READY_TO_SLICE", "SLICING",
    "SLICE_REVIEWED", "SLICE_CONFIRMED", "SLICE_NEEDS_FIX", "QUOTE_DRAFTED",
    "READY_FOR_ONLINE_SYNC", "CLOSED",
  ].map((value) => [value, formatLocalState(value)])];
}

function fileStatusOptions() {
  return [["", "全部"], ...["verified", "syncing", "failed", "missing_sync_job", "no_files", "unknown"].map((value) => [value, formatSyncStatus(value)])];
}

function sliceStatusOptions() {
  return [["", "全部"], ...["not_started", "slicing", "parsed", "partial", "failed"].map((value) => [value, formatSliceStatus(value)])];
}

function paymentStatusOptions() {
  return [["", "全部"], ...["unpaid", "pending", "paid", "partially_refunded", "refunded", "failed", "closed"].map((value) => [value, formatPaymentStatus(value)])];
}

function sliceListStatusClass(value) {
  if (value === "parsed") return "status-success";
  if (value === "failed") return "status-failed";
  if (value === "partial") return "status-warning";
  if (value === "slicing") return "status-progress";
  return "status-idle";
}

function formatCompactDate(value) {
  if (!value) return "暂不可用";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(date).replaceAll("/", "-");
}

function formatLocalCheckError(value) {
  const map = {
    "not-found": "本地文件不存在",
    "not-file": "目标不是普通文件",
    "root-escape": "路径超出本地订单文件根目录",
    "realpath-failed": "无法解析本地真实路径",
    "sha256-mismatch": "SHA-256 不一致",
    "missing-expected-sha256": "云端缺少预期 SHA-256",
    "stat-failed": "无法读取本地文件状态",
  };
  return map[String(value || "")] || String(value || "未知错误");
}

function formatLocalState(value) {
  const map = {
    UNREVIEWED: "未处理",
    REVIEWING: "处理中",
    FILE_PROBLEM: "文件存在问题",
    READY_TO_SLICE: "可以切片",
    SLICING: "切片中",
    SLICE_REVIEWED: "切片结果已查看",
    SLICE_CONFIRMED: "切片结果已确认",
    SLICE_NEEDS_FIX: "切片需要调整",
    QUOTE_DRAFTED: "报价草稿已填写",
    READY_FOR_ONLINE_SYNC: "可以同步 TEST 订单",
    CLOSED: "已关闭",
  };
  return map[String(value || "")] || String(value || "未处理");
}

function formatReplyTemplate(value) {
  const map = {
    "": "不使用模板",
    FILE_RECEIVED: "已收到文件",
    FILE_CONFIRMED: "文件已确认",
    MODEL_PROBLEM_REUPLOAD: "模型有问题，需要重新上传",
    CONFIRM_MATERIAL_COLOR_QUANTITY: "确认材料、颜色和数量",
    QUOTE_MANUAL_CONFIRM: "人工报价确认",
    LEAD_TIME_UPDATED: "预计货期更新",
    CONFIRM_SUPPORT_OR_APPEARANCE: "确认支撑或外观要求",
    PLAIN_TEXT: "普通文本回复",
  };
  return map[value] || String(value || "不使用模板");
}

function formatMessageType(value) {
  const map = {
    FILE_RECEIVED: "已收到文件",
    FILE_CONFIRMED: "文件已确认",
    REUPLOAD_REQUIRED: "需要重新上传",
    MATERIAL_CONFIRM_REQUIRED: "需要确认材料信息",
    QUOTE_CONFIRMATION: "人工报价确认",
    LEAD_TIME_CONFIRMATION: "预计货期确认",
    GENERAL_REPLY: "普通回复",
    TEXT: "文本回复",
  };
  return map[value] || String(value || "普通回复");
}

function formatSliceStatus(value) {
  const map = {
    pending: "等待处理",
    slicing: "切片中",
    sliced: "切片完成",
    parsing: "解析中",
    parsed: "解析完成",
    completed: "已完成",
    partial: "部分完成",
    warning: "有提示",
    ok: "正常",
    failed: "失败",
    error: "错误",
    not_started: "未开始",
  };
  const key = String(value || "").toLowerCase();
  return map[key] || String(value || "暂不可用");
}

function formatAuditAction(value) {
  const map = {
    CREATE_REVIEW: "创建本地处理记录",
    UPDATE_REVIEW: "更新本地草稿",
    CREATE_SLICE: "创建本地切片记录",
    UPDATE_SLICE: "更新本地切片记录",
  };
  return map[value] || String(value || "本地操作");
}

function formatAuditResult(value) {
  const map = { success: "成功", failed: "失败", ok: "成功" };
  return map[String(value || "").toLowerCase()] || String(value || "");
}

function formatMetricSource(value) {
  const map = {
    calculated_from_length_density: "按耗材长度和密度计算",
    direct_gcode_weight: "G-code 直接提供",
    filament_used_g: "G-code 耗材重量",
    project_material_default_density: "项目材料默认密度",
    cloud_file_geometry: "上传文件几何数据",
    gcode_bounds: "G-code 运动范围",
  };
  return map[value] || String(value || "暂不可用");
}

function formatBytes(value) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes < 0) return "暂不可用";
  if (bytes < 1024) return `${bytes} 字节`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
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
