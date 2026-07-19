export const WORKBENCH_DESIGN_STYLES = `
  :root {
    --page-bg: #f3f5f7;
    --surface: #ffffff;
    --surface-subtle: #f7f9fb;
    --surface-strong: #e9eef4;
    --ink: #182230;
    --muted: #667085;
    --border: #d7dee7;
    --border-strong: #aab4c2;
    --primary: #0f5f9e;
    --primary-strong: #084f86;
    --success: #087443;
    --warning: #8a4b08;
    --danger: #b42318;
    --radius: 6px;
    --space-1: 4px;
    --space-2: 8px;
    --space-3: 12px;
    --space-4: 16px;
    --space-5: 20px;
  }
  body { background: var(--page-bg); }
  .panel, .surface { background: var(--surface); border-color: var(--border); border-radius: var(--radius); }
  button, .button-link, input, select, textarea { border-radius: var(--radius); }
  .page-heading { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:14px; }
  .page-heading h2 { margin-bottom:2px; }
  .page-heading p { color:var(--muted); margin:0; }
  .stat-strip { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:8px; margin-bottom:14px; }
  .stat-card { display:block; min-width:0; border:1px solid var(--border); border-radius:var(--radius); background:var(--surface); padding:10px 12px; color:var(--ink); }
  .stat-card:hover { border-color:#7aa7c7; background:#f8fbfe; }
  .stat-card strong { display:block; font-size:20px; line-height:1.2; }
  .stat-card span { color:var(--muted); font-size:12px; }
  .filter-panel { padding:14px 16px; }
  .search-row { display:grid; grid-template-columns:minmax(280px,2fr) repeat(2,minmax(150px,1fr)) auto; gap:10px; align-items:end; }
  .filter-grid { display:grid; grid-template-columns:repeat(8,minmax(108px,1fr)); gap:10px; margin-top:10px; }
  .filter-field { min-width:0; margin:0; color:var(--muted); font-size:12px; }
  .filter-field input, .filter-field select { width:100%; max-width:none; margin-top:4px; color:var(--ink); background:#fff; }
  .filter-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .list-meta { display:flex; justify-content:space-between; align-items:center; gap:12px; margin:0 0 10px; color:var(--muted); }
  .orders-table { min-width:1260px; table-layout:fixed; }
  .orders-table th { position:sticky; top:0; z-index:1; white-space:nowrap; }
  .orders-table tbody tr:hover { background:#f8fafc; }
  .orders-table .col-order { width:180px; }
  .orders-table .col-customer { width:112px; }
  .orders-table .col-time { width:134px; }
  .orders-table .col-files { width:128px; }
  .orders-table .col-slice { width:104px; }
  .orders-table .col-state { width:120px; }
  .orders-table .col-payment { width:100px; }
  .orders-table .col-money { width:104px; }
  .orders-table .col-lead { width:112px; }
  .orders-table .col-next { width:180px; }
  .orders-table .col-action { width:112px; }
  .order-cell a { display:block; font-size:12px; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .orders-table .order-kind { margin-left:0; white-space:nowrap; }
  .order-cell small, .cell-subtext { display:block; color:var(--muted); font-size:12px; margin-top:2px; }
  .next-action { display:block; font-weight:700; }
  .next-action.blocker { color:var(--danger); }
  .next-action.waiting { color:var(--warning); }
  .next-action.done { color:var(--success); }
  .row-actions { display:flex; align-items:center; gap:6px; }
  .row-actions .button-link { min-height:32px; padding:5px 10px; }
  .row-more { position:relative; }
  .row-more summary { cursor:pointer; color:var(--primary); list-style:none; }
  .row-more summary::-webkit-details-marker { display:none; }
  .row-more div { position:absolute; right:0; top:26px; z-index:3; width:150px; padding:8px; border:1px solid var(--border); background:#fff; box-shadow:0 6px 18px rgba(16,24,40,.12); }
  .pagination { display:flex; justify-content:space-between; align-items:center; gap:12px; padding-top:12px; }
  .pagination-links { display:flex; align-items:center; gap:6px; }
  .pagination .button-link[aria-disabled='true'] { pointer-events:none; color:#98a2b3; background:#f2f4f7; border-color:#d0d5dd; }
  .state-view { padding:32px 20px; text-align:center; border:1px dashed var(--border-strong); background:var(--surface-subtle); }
  .state-view h3 { margin-bottom:4px; }
  .state-view p { color:var(--muted); margin-bottom:12px; }
  .state-view.error { border-color:#f0aaa4; background:#fff5f4; }
  .refresh-indicator { display:none; align-items:center; gap:8px; color:var(--primary); }
  [aria-busy='true'] .refresh-indicator { display:inline-flex; }
  [aria-busy='true'] .orders-table-wrap { opacity:.58; }
  .list-notice { margin-bottom:14px; }
  @media (max-width: 1180px) {
    .stat-strip { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .search-row { grid-template-columns:minmax(260px,2fr) repeat(2,minmax(140px,1fr)); }
    .search-row .filter-actions { grid-column:1 / -1; }
    .filter-grid { grid-template-columns:repeat(4,minmax(120px,1fr)); }
  }
  @media (max-width: 760px) {
    .page-heading { flex-direction:column; }
    .stat-strip { grid-template-columns:repeat(2,minmax(0,1fr)); }
    .search-row, .filter-grid { grid-template-columns:1fr; }
    .search-row .filter-actions { grid-column:auto; }
    .filter-actions > * { flex:1 1 auto; }
    .list-meta, .pagination { align-items:flex-start; flex-direction:column; }
  }
`;
