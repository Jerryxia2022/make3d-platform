#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const baseUrl = "http://127.0.0.1:5177";
const targetLocationUrl = "file://wsl.localhost/Ubuntu-24.04/srv/make3d-worker/files/M3D20260718175603009";
const otherDirectory = "\\\\wsl.localhost\\Ubuntu-24.04\\srv\\make3d-worker\\files\\M3D20260714062902874827";
const otherLocationUrl = "file://wsl.localhost/Ubuntu-24.04/srv/make3d-worker/files/M3D20260714062902874827";
const evidenceDir = resolve("reports/evidence/phase06-order-list-and-explorer");
const profileDir = await mkdtemp(join(tmpdir(), "make3d-workbench-acceptance-"));
const port = 9223;
const results = { startedAt: new Date().toISOString(), browser: {}, list: {}, explorer: {} };
let chrome;
let cdp;

try {
  await mkdir(evidenceDir, { recursive: true });
  chrome = await launchChrome();
  const target = await waitForPageTarget();
  cdp = await createCdpClient(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await navigate(`${baseUrl}/orders`);

  results.browser = {
    headless: false,
    isolatedProfile: profileDir,
    debuggingPort: port,
    chromePid: chrome.pid,
  };

  await setViewport(1366, 768);
  await screenshot("orders-default-1366x768.png");
  results.list.default = await listSnapshot();

  await setViewport(1920, 1080);
  results.list.viewport1920 = await viewportEvidence();
  await screenshot("orders-default-1920x1080.png");

  await setViewport(1024, 768);
  results.list.viewport1024 = await viewportEvidence();
  await screenshot("orders-default-1024x768.png");

  await setViewport(1366, 768);
  await setFormValues({ q: "42" });
  await submitListForm();
  results.list.search = await listSnapshot();
  await screenshot("orders-search-order42.png");

  await navigate(`${baseUrl}/orders`);
  results.list.searchCleared = await listSnapshot();
  await setFormValues({ local_state: "UNREVIEWED", customer_type: "test", sort: "created_desc" });
  await submitListForm();
  results.list.filters = await listSnapshot();
  await screenshot("orders-filter-test-unreviewed.png");

  await navigate(`${baseUrl}/orders?file_status=verified`);
  results.list.fileFilter = await listSnapshot();
  await navigate(`${baseUrl}/orders?slice_status=failed`);
  results.list.sliceFailureFilter = await listSnapshot();
  await navigate(`${baseUrl}/orders?customer_type=test`);
  results.list.testFilter = await listSnapshot();
  await navigate(`${baseUrl}/orders?date=30d`);
  results.list.dateFilter = await listSnapshot();
  const refreshUrl = await evaluate("location.href");
  await navigate(refreshUrl);
  results.list.refreshPreserved = await listSnapshot();

  await navigate(`${baseUrl}/orders?exception=file`);
  results.list.exceptions = await listSnapshot();
  await screenshot("orders-file-exceptions.png");

  await navigate(`${baseUrl}/orders?q=__NO_SUCH_ORDER__`);
  results.list.empty = await evaluate(`({ text: document.body.innerText, rows: document.querySelectorAll('tbody tr').length })`);
  await screenshot("orders-empty-result.png");

  await navigate(`${baseUrl}/orders?page=2&page_size=20&sort=priority`);
  results.list.page2 = await listSnapshot();
  await navigate(`${baseUrl}/orders?page=1&page_size=20&sort=priority`);
  results.list.page1 = await listSnapshot();
  await navigate(`${baseUrl}/orders?page_size=50&sort=priority`);
  results.list.pageSize50 = await listSnapshot();

  await navigate(`${baseUrl}/orders?q=42&customer_type=test&page_size=20&sort=priority`);
  const openedOrder42 = await evaluate(`(() => { const link=document.querySelector('a[href="/orders/42"]'); if (!link) return false; link.click(); return true; })()`);
  if (!openedOrder42) throw new Error("order 42 link was not present in the dedicated browser result");
  await waitForUrl(/\/orders\/42$/);
  results.list.order42Detail = await evaluate(`({ url: location.href, text: document.body.innerText })`);
  await evaluate("history.back(); true");
  await waitForUrl(/q=42.*customer_type=test/);
  results.list.backPreserved = await evaluate(`({ url: location.href, customerType: document.querySelector('[name="customer_type"]')?.value })`);

  await navigate(`${baseUrl}/orders/42`);
  await waitForSelector("[data-open-directory-form]");
  await runExplorerScenarios();

  results.finishedAt = new Date().toISOString();
  await writeFile(join(evidenceDir, "acceptance-results.json"), `${JSON.stringify(results, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
} finally {
  try { cdp?.close(); } catch { }
  try { chrome?.kill(); } catch { }
  await new Promise((resolvePromise) => setTimeout(resolvePromise, 500));
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

async function launchChrome() {
  const { spawn } = await import("node:child_process");
  const child = spawn(chromePath, [
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--new-window",
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-sync",
    "--disable-extensions",
    "--window-size=1366,768",
    `${baseUrl}/orders`,
  ], { stdio: "ignore", windowsHide: false });
  child.unref();
  return child;
}

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const targets = await response.json();
      const page = targets.find((item) => item.type === "page" && item.url.startsWith(baseUrl));
      if (page?.webSocketDebuggerUrl) return page;
    } catch { }
    await delay(100);
  }
  throw new Error("dedicated Chrome did not expose the workbench page over CDP");
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  let sequence = 0;
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const item = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result || {});
  });
  return {
    send(method, params = {}) {
      return new Promise((resolvePromise, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve: resolvePromise, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() { socket.close(); },
  };
}

async function navigate(url) {
  await cdp.send("Page.navigate", { url });
  await waitForUrl(new RegExp(escapeRegExp(url.replace(baseUrl, ""))));
  await waitForSelector("main");
}

async function setViewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false, screenWidth: width, screenHeight: height });
  await delay(100);
  const evidence = await viewportEvidence();
  if (evidence.width !== width || evidence.height !== height) throw new Error(`viewport mismatch: ${JSON.stringify(evidence)}`);
}

async function viewportEvidence() {
  return evaluate(`({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio, url: location.href })`);
}

async function screenshot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(evidenceDir, name), Buffer.from(result.data, "base64"));
}

async function desktopScreenshot(name) {
  const path = join(evidenceDir, name);
  const ps = `
Add-Type -AssemblyName System.Drawing
$bounds = [System.Windows.Forms.SystemInformation]::VirtualScreen
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Left, $bounds.Top, 0, 0, $bounds.Size)
$bitmap.Save('${escapePowerShell(path)}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
`;
  await runPowerShell(`Add-Type -AssemblyName System.Windows.Forms; ${ps}`);
}

async function setFormValues(values) {
  await evaluate(`(() => { const values = ${JSON.stringify(values)}; for (const [name,value] of Object.entries(values)) { const input=document.querySelector('[name="'+name+'"]'); if (!input) throw new Error('missing field '+name); input.value=String(value); input.dispatchEvent(new Event('change',{bubbles:true})); } return true; })()`);
}

async function submitListForm() {
  await evaluate(`document.querySelector('[data-order-list-form]').requestSubmit()`);
  await waitForSelector(".orders-table, .state-view");
  await delay(300);
}

async function listSnapshot() {
  return evaluate(`({
    url: location.href,
    viewport: { width: innerWidth, height: innerHeight },
    totalText: document.querySelector('.list-meta')?.innerText || '',
    rows: document.querySelectorAll('tbody tr').length,
    firstOrder: document.querySelector('tbody tr .order-cell a')?.textContent?.trim() || null,
    stats: [...document.querySelectorAll('.stat-card')].map(item => item.innerText.trim()),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`);
}

async function runExplorerScenarios() {
  await closeExplorerTarget();
  const scenario1Before = await explorerWindows();
  const scenario1BrowserHwnd = await focusDedicatedChrome();
  await desktopScreenshot("explorer-s1-before.png");
  const first = await clickOpenDirectory();
  await desktopScreenshot("explorer-s1-after-focused.png");
  const scenario1After = await explorerState();
  assertFocused("scenario1", first, scenario1After, scenario1BrowserHwnd);

  const scenario2BrowserHwnd = await focusDedicatedChrome();
  const existingBefore = await explorerState();
  const second = await clickOpenDirectory();
  const existingAfter = await explorerState();
  assertFocused("scenario2", second, existingAfter, scenario2BrowserHwnd);
  if (existingAfter.targetHwnd !== existingBefore.targetHwnd || existingAfter.targetCount !== existingBefore.targetCount) throw new Error("scenario2 created or selected a different Explorer window");

  await minimizeWindow(existingAfter.targetHwnd);
  const scenario3BrowserHwnd = await focusDedicatedChrome();
  await desktopScreenshot("explorer-s3-minimized.png");
  const third = await clickOpenDirectory();
  await desktopScreenshot("explorer-s3-restored-focused.png");
  const minimizedAfter = await explorerState();
  assertFocused("scenario3", third, minimizedAfter, scenario3BrowserHwnd);
  if (third.restored !== "true") throw new Error("scenario3 did not report restored=true");

  const multiBefore = await openOtherDirectory();
  if (!multiBefore.some((item) => normalizeUrl(item.locationUrl) === normalizeUrl(otherLocationUrl))) throw new Error("scenario4 did not open the second Explorer directory");
  if (!multiBefore.some((item) => normalizeUrl(item.locationUrl) === normalizeUrl(targetLocationUrl))) throw new Error("scenario4 lost the order 42 Explorer directory before activation");
  const scenario4BrowserHwnd = await focusDedicatedChrome();
  const fourth = await clickOpenDirectory();
  await desktopScreenshot("explorer-s4-correct-multi-window.png");
  const multiAfter = await explorerState();
  assertFocused("scenario4", fourth, multiAfter, scenario4BrowserHwnd);
  if (multiAfter.targetLocationUrl !== targetLocationUrl) throw new Error("scenario4 focused the wrong Explorer directory");

  const scenario5BrowserHwndA = await focusDedicatedChrome();
  const fifthA = await clickOpenDirectory();
  const scenario5BrowserHwndB = await focusDedicatedChrome();
  const fifthB = await clickOpenDirectory();
  const repeatAfter = await explorerState();
  assertFocused("scenario5a", fifthA, repeatAfter, scenario5BrowserHwndA);
  assertFocused("scenario5b", fifthB, repeatAfter, scenario5BrowserHwndB);
  if (repeatAfter.targetCount !== 1) throw new Error(`scenario5 target window count is ${repeatAfter.targetCount}`);

  results.explorer = {
    scenario1: { browserHwndBefore: scenario1BrowserHwnd, before: scenario1Before, button: first, after: scenario1After },
    scenario2: { browserHwndBefore: scenario2BrowserHwnd, before: existingBefore, button: second, after: existingAfter },
    scenario3: { browserHwndBefore: scenario3BrowserHwnd, button: third, after: minimizedAfter },
    scenario4: { browserHwndBefore: scenario4BrowserHwnd, before: multiBefore, button: fourth, after: multiAfter },
    scenario5: { browserHwndBeforeA: scenario5BrowserHwndA, browserHwndBeforeB: scenario5BrowserHwndB, first: fifthA, second: fifthB, after: repeatAfter },
  };
}

async function clickOpenDirectory() {
  await evaluate(`(() => { const message=document.querySelector('[data-open-directory-message]'); for (const key of ['status','targetHwnd','foregroundHwnd','foregroundHwndBefore','restored']) delete message.dataset[key]; document.querySelector('[data-open-directory-form] button').click(); return true; })()`);
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const result = await evaluate(`(() => { const el=document.querySelector('[data-open-directory-message]'); return { status:el?.dataset.status||'', targetHwnd:el?.dataset.targetHwnd||'', foregroundHwnd:el?.dataset.foregroundHwnd||'', foregroundHwndBefore:el?.dataset.foregroundHwndBefore||'', restored:el?.dataset.restored||'', text:el?.textContent||'' }; })()`);
    if (result.status) return result;
    await delay(100);
  }
  throw new Error("open-directory button did not return a terminal status");
}

function assertFocused(label, button, desktop, browserHwndBefore) {
  if (button.status !== "directory-focused") throw new Error(`${label}: ${JSON.stringify(button)}`);
  if (Number(button.foregroundHwndBefore) !== Number(browserHwndBefore)) throw new Error(`${label}: click-time foreground HWND was not the dedicated Chrome window ${JSON.stringify({ button, browserHwndBefore })}`);
  if (Number(browserHwndBefore) === Number(button.targetHwnd)) throw new Error(`${label}: Explorer was not obscured before activation`);
  if (!desktop.targetHwnd || desktop.foregroundHwnd !== desktop.targetHwnd) throw new Error(`${label}: foreground HWND mismatch ${JSON.stringify(desktop)}`);
}

async function explorerWindows() {
  const output = await runPowerShell(`
$shell = New-Object -ComObject Shell.Application
$items = @($shell.Windows()) | ForEach-Object { try { [pscustomobject]@{ hwnd=[int64]$_.HWND; locationUrl=[string]$_.LocationURL; path=[string]$_.Document.Folder.Self.Path } } catch {} }
@($items) | ConvertTo-Json -Compress
`);
  if (!output.trim()) return [];
  const parsed = JSON.parse(output.trim());
  return Array.isArray(parsed) ? parsed : [parsed];
}

async function explorerState() {
  const windows = await explorerWindows();
  const targetWindows = windows.filter((item) => normalizeUrl(item.locationUrl) === normalizeUrl(targetLocationUrl));
  const foregroundHwnd = Number((await runPowerShell(`
Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class F { [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }\n'@
[F]::GetForegroundWindow().ToInt64()
`)).trim());
  return {
    targetCount: targetWindows.length,
    targetHwnd: Number(targetWindows[0]?.hwnd || 0),
    targetLocationUrl: targetWindows[0]?.locationUrl || null,
    foregroundHwnd,
    windows: windows.map((item) => ({ hwnd: Number(item.hwnd), locationUrl: item.locationUrl })),
  };
}

async function closeExplorerTarget() {
  await runPowerShell(`$shell=New-Object -ComObject Shell.Application; @($shell.Windows()) | ForEach-Object { try { if ([string]$_.LocationURL -eq '${targetLocationUrl}') { $_.Quit() } } catch {} }; Start-Sleep -Milliseconds 400`);
}

async function minimizeWindow(hwnd) {
  await runPowerShell(`Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class W { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h, int c); }\n'@; [void][W]::ShowWindowAsync([IntPtr]${Number(hwnd)},6); Start-Sleep -Milliseconds 250`);
}

async function openOtherDirectory() {
  await runPowerShell(`if (Test-Path -LiteralPath '${otherDirectory}') { Start-Process explorer.exe -ArgumentList @('/n,','${otherDirectory}'); Start-Sleep -Milliseconds 600 }`);
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const windows = await explorerWindows();
    if (windows.some((item) => normalizeUrl(item.locationUrl) === normalizeUrl(otherLocationUrl))) return windows;
    await delay(150);
  }
  return explorerWindows();
}

async function focusDedicatedChrome() {
  await cdp.send("Page.bringToFront");
  const pid = chrome.pid;
  const output = await runPowerShell(`
Add-Type @'\nusing System; using System.Runtime.InteropServices; public static class W { [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr h,int c); [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h,IntPtr a,int x,int y,int w,int h2,uint f); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h); [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr h); [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr h); [DllImport("user32.dll")] public static extern void SwitchToThisWindow(IntPtr h,bool alt); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p); [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint a,uint b,bool attach); [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId(); }\n'@
$all=@(Get-CimInstance Win32_Process)
$ids=New-Object 'System.Collections.Generic.HashSet[int]'
[void]$ids.Add(${pid})
do { $added=$false; foreach($item in $all) { if($ids.Contains([int]$item.ParentProcessId) -and -not $ids.Contains([int]$item.ProcessId)) { [void]$ids.Add([int]$item.ProcessId); $added=$true } } } while($added)
$p=@($ids | ForEach-Object { Get-Process -Id $_ -ErrorAction SilentlyContinue } | Where-Object { $_.MainWindowHandle -ne 0 } | Sort-Object StartTime | Select-Object -First 1)
if (-not $p) { throw 'Dedicated Chrome window was not found.' }
$h=[IntPtr]$p.MainWindowHandle
$focused=$false
for($attempt=0; $attempt -lt 3 -and -not $focused; $attempt++) {
  $before=[W]::GetForegroundWindow(); $beforePid=0; $targetPid=0
  $beforeThread=[W]::GetWindowThreadProcessId($before,[ref]$beforePid)
  $targetThread=[W]::GetWindowThreadProcessId($h,[ref]$targetPid)
  $currentThread=[W]::GetCurrentThreadId()
  $attachBefore=$beforeThread -ne 0 -and $beforeThread -ne $currentThread -and [W]::AttachThreadInput($currentThread,$beforeThread,$true)
  $attachTarget=$targetThread -ne 0 -and $targetThread -ne $currentThread -and [W]::AttachThreadInput($currentThread,$targetThread,$true)
  try { [void](New-Object -ComObject WScript.Shell).AppActivate([int]$p.Id) } catch {}
  [void][W]::ShowWindowAsync($h,5); [void][W]::SetWindowPos($h,[IntPtr](-1),0,0,0,0,0x13)
  [void][W]::BringWindowToTop($h); [void][W]::SetForegroundWindow($h); [W]::SwitchToThisWindow($h,$true)
  [void][W]::SetActiveWindow($h); [void][W]::SetFocus($h); [void][W]::SetWindowPos($h,[IntPtr](-2),0,0,0,0,0x13)
  Start-Sleep -Milliseconds 180
  $focused=[W]::GetForegroundWindow() -eq $h
  if($attachTarget) { [void][W]::AttachThreadInput($currentThread,$targetThread,$false) }
  if($attachBefore) { [void][W]::AttachThreadInput($currentThread,$beforeThread,$false) }
}
if (-not $focused) { throw 'Dedicated Chrome did not become the foreground window.' }
$h.ToInt64()
`);
  const hwnd = Number(output.trim());
  if (!hwnd) throw new Error("dedicated Chrome foreground HWND was not returned");
  await delay(200);
  return hwnd;
}

async function runPowerShell(script) {
  const { stdout } = await execFileAsync("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 20_000, maxBuffer: 1024 * 1024 });
  return String(stdout || "");
}

async function waitForSelector(selector) {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(50);
  }
  throw new Error(`selector did not appear: ${selector}`);
}

async function waitForUrl(pattern) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const url = await evaluate("location.href");
    if (pattern.test(url)) return url;
    await delay(50);
  }
  throw new Error(`URL did not match ${pattern}`);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
  return result.result?.value;
}

function normalizeUrl(value) { return String(value || "").replace(/\/$/, "").toLowerCase(); }
function escapeRegExp(value) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function escapePowerShell(value) { return String(value).replaceAll("'", "''"); }
function delay(milliseconds) { return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds)); }
