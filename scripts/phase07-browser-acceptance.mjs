#!/usr/bin/env node
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const baseUrl = process.env.PHASE07_BASE_URL || "http://127.0.0.1:3107";
const stepPath = process.env.PHASE07_STEP_PATH || "C:\\Users\\21899\\Desktop\\04NF12.STEP";
const stlPath = resolve(process.env.PHASE07_STL_PATH || "tests/fixtures/prusaslicer/20mm-cube.stl");
const cookieJarPath = resolve(process.env.PHASE07_COOKIE_JAR || "tmp/phase07-browser/cookies.txt");
const loginPhone = process.env.PHASE07_LOGIN_PHONE;
const loginPassword = process.env.PHASE07_LOGIN_PASSWORD;
const evidenceDir = resolve("reports/evidence/phase07-a2");
const chromePath = process.env.CHROME_PATH || "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const profileDir = await mkdtemp(join(tmpdir(), "make3d-phase07-browser-"));
const invalidStepPath = resolve("tmp/phase07-browser/invalid-part21.step");
const port = 9237;
const evidence = {
  startedAt: new Date().toISOString(),
  baseUrl,
  stepPath,
  stlPath,
  home: {},
  quote: {},
  network: { gcodeRequests: [] },
  consoleErrors: [],
};
let chrome;
let cdp;

if (!loginPhone || !loginPassword) {
  throw new Error("PHASE07_LOGIN_PHONE and PHASE07_LOGIN_PASSWORD are required for isolated browser acceptance");
}

try {
  progress("prepare evidence");
  await mkdir(evidenceDir, { recursive: true });
  await writeFile(invalidStepPath, "ISO-10303-21;\nHEADER;\nENDSEC;\nDATA;\nENDSEC;\n", "utf8");
  chrome = launchChrome();
  progress("launch Chrome");
  const target = await waitForPageTarget();
  cdp = await createCdpClient(target.webSocketDebuggerUrl);
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  await cdp.send("Network.enable");
  cdp.on("Runtime.consoleAPICalled", (event) => {
    if (event.type === "error") evidence.consoleErrors.push(event.args.map((item) => item.value || item.description || "").join(" "));
  });
  cdp.on("Network.requestWillBeSent", (event) => {
    if (/\.gcode(?:$|\?)/i.test(event.request.url)) evidence.network.gcodeRequests.push(event.request.url);
  });

  await setViewport(1440, 900);
  progress("capture desktop home");
  await navigate("/");
  await screenshot("home-desktop.png");
  evidence.home.desktop = await evaluate(`({
    title: document.title,
    h1: document.querySelector('h1')?.innerText || '',
    quoteLinks: [...document.querySelectorAll('a')].filter((item) => item.getAttribute('href') === '/quote').length,
    text: document.body.innerText.slice(0, 1800),
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth
  })`);

  await setViewport(390, 844, true);
  progress("capture mobile home");
  await screenshot("home-mobile.png");
  evidence.home.mobile = await evaluate(`({
    width: innerWidth,
    horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    h1Box: (() => { const box=document.querySelector('h1')?.getBoundingClientRect(); return box ? {left:box.left,right:box.right,width:box.width} : null; })()
  })`);

  await setViewport(1440, 900);
  await installCustomerCookie();
  progress("open empty quote workbench");
  await navigate("/quote");
  await waitForSelector("#modelFiles");
  evidence.quote.initial = await quoteSnapshot();

  progress("upload and slice synthetic STL");
  const stlResponsePromise = waitForResponse(/\/api\/quote\/slice$/, 120_000);
  await setFileInput(stlPath);
  evidence.quote.stlSlicing = await waitForSlicingState();
  const stlResponse = await stlResponsePromise;
  await waitForReadyCanvasCount(1);
  evidence.quote.stlUploadSuccess = { response: stlResponse, snapshot: await quoteSnapshot() };
  await screenshot("quote-stl-after-slice-success.png");

  progress("refresh STL preview");
  const stlRestorePromise = waitForOptionalResponse(/\/api\/quote\/draft\/files\/\d+\/download/, 15_000);
  await navigate("/quote");
  const stlRestoreResponse = await stlRestorePromise;
  await waitForReadyCanvasCount(1);
  evidence.quote.stlRefreshed = { previewResponse: stlRestoreResponse, snapshot: await quoteSnapshot() };

  progress("logout and login again");
  await evaluate(`fetch('/api/account/logout?next=/account/login', { method: 'POST', credentials: 'same-origin' }).then((response) => response.status)`);
  await navigate("/account/login");
  await waitForSelector("main form");
  await evaluate(`(() => {
    const setValue = (input, value) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    };
    setValue(document.querySelector('[name="phone"]'), ${JSON.stringify(loginPhone)});
    setValue(document.querySelector('[name="password"]'), ${JSON.stringify(loginPassword)});
    document.querySelector('main form').requestSubmit();
    return true;
  })()`);
  await waitForUrl(/\/quote$/);
  await waitForSelector("#modelFiles");
  await waitForReadyCanvasCount(1);
  evidence.quote.relogin = { url: await evaluate("location.href"), authenticated: true };

  progress("upload, convert, preview, and slice real STEP");
  const successResponsePromise = waitForResponse(/\/api\/quote\/slice$/, 120_000);
  await setFileInput(stepPath);
  evidence.quote.slicing = await waitForSlicingState();
  const successResponse = await successResponsePromise;
  await waitForReadyCanvasCount(2);
  evidence.quote.uploadSuccess = { response: successResponse, snapshot: await quoteSnapshot() };
  await screenshot("quote-step-upload-success.png");

  progress("refresh restored STEP preview");
  const refreshedPreviewPromise = waitForOptionalResponse(/\/api\/quote\/draft\/files\/\d+\/download\?artifact=preview/, 15_000);
  await navigate("/quote");
  const refreshedPreviewResponse = await refreshedPreviewPromise;
  await waitForReadyCanvasCount(2);
  evidence.quote.refreshed = { previewResponse: refreshedPreviewResponse, snapshot: await quoteSnapshot() };

  progress("reslice real STEP");
  const resliceResponsePromise = waitForResponse(/\/api\/quote\/slice$/, 120_000);
  await setFileInput(stepPath);
  evidence.quote.reslice = { response: await resliceResponsePromise };
  await waitForReadyCanvasCount(3);
  evidence.quote.reslice.snapshot = await quoteSnapshot();

  progress("verify invalid STEP failure");
  const failedResponsePromise = waitForResponse(/\/api\/quote\/slice$/, 30_000);
  await setFileInput(invalidStepPath);
  evidence.quote.invalidUpload = { response: await failedResponsePromise, snapshot: await quoteSnapshot() };
  await screenshot("quote-invalid-step-failure.png");

  progress("write acceptance evidence");
  evidence.finishedAt = new Date().toISOString();
  evidence.passed =
    evidence.home.desktop.quoteLinks > 0 &&
    !evidence.home.desktop.horizontalOverflow &&
    !evidence.home.mobile.horizontalOverflow &&
    evidence.quote.initial.canvasCount === 0 &&
    evidence.quote.stlUploadSuccess.response.status === 200 &&
    evidence.quote.stlUploadSuccess.response.body?.success === true &&
    evidence.quote.stlUploadSuccess.snapshot.readyCanvasCount > 0 &&
    evidence.quote.stlRefreshed.snapshot.readyCanvasCount > 0 &&
    evidence.quote.uploadSuccess.response.status === 200 &&
    evidence.quote.uploadSuccess.response.body?.success === true &&
    evidence.quote.uploadSuccess.response.body?.preview_available === true &&
    evidence.quote.refreshed.snapshot.readyCanvasCount > 0 &&
    evidence.quote.reslice.response.status === 200 &&
    evidence.quote.reslice.snapshot.readyCanvasCount === 3 &&
    !evidence.quote.reslice.snapshot.files.some((text) => text.includes("模型尺寸较小")) &&
    evidence.quote.invalidUpload.response.status === 400 &&
    !evidence.quote.invalidUpload.snapshot.files.at(-1).includes("XYZ 8.00") &&
    !evidence.quote.invalidUpload.snapshot.files.at(-1).includes("模型尺寸较小") &&
    evidence.network.gcodeRequests.length === 0;
  await writeFile(join(evidenceDir, "browser-acceptance.json"), `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
  if (!evidence.passed) process.exitCode = 1;
} finally {
  try { cdp?.close(); } catch {}
  try { chrome?.kill(); } catch {}
  await delay(300);
  await rm(profileDir, { recursive: true, force: true }).catch(() => {});
}

function launchChrome() {
  const child = spawn(chromePath, [
    "--headless=new",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profileDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-extensions",
    "--disable-gpu",
    "--enable-unsafe-swiftshader",
    `${baseUrl}/`,
  ], { stdio: "ignore", windowsHide: true });
  child.unref();
  return child;
}

async function installCustomerCookie() {
  const jar = await readFile(cookieJarPath, "utf8");
  const line = jar.split(/\r?\n/).find((item) => item.includes("customer_session"));
  if (!line) throw new Error("customer_session is missing from the local acceptance cookie jar");
  const value = line.split("\t").at(-1);
  const result = await cdp.send("Network.setCookie", {
    name: "customer_session",
    value,
    url: baseUrl,
    httpOnly: true,
    sameSite: "Lax",
  });
  if (!result.success) throw new Error("Chrome rejected the local acceptance cookie");
}

async function setFileInput(path) {
  const document = await cdp.send("DOM.getDocument", { depth: -1, pierce: true });
  const input = await cdp.send("DOM.querySelector", { nodeId: document.root.nodeId, selector: "#modelFiles" });
  if (!input.nodeId) throw new Error("quote file input was not found");
  await cdp.send("DOM.setFileInputFiles", { nodeId: input.nodeId, files: [path] });
}

async function waitForSlicingState() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const snapshot = await quoteSnapshot();
    if (snapshot.text.includes("计算") || snapshot.text.includes("切片") || snapshot.canvasCount > 0) return snapshot;
    await delay(100);
  }
  throw new Error("quote page never exposed an upload or slicing state");
}

async function waitForReadyCanvasCount(minimum) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const ready = await evaluate(`document.querySelectorAll('canvas:not(.opacity-0)').length`);
    if (ready >= minimum) return;
    await delay(100);
  }
  throw new Error(`STL preview canvas count did not reach ${minimum}`);
}

async function quoteSnapshot() {
  return evaluate(`({
    url: location.href,
    text: document.body.innerText.slice(0, 4000),
    canvasCount: document.querySelectorAll('canvas').length,
    readyCanvasCount: document.querySelectorAll('canvas:not(.opacity-0)').length,
    dimensions: [...document.querySelectorAll('p')].map((item) => item.innerText).find((text) => text.startsWith('XYZ ')) || null,
    files: [...document.querySelectorAll('article')].map((item) => item.innerText.slice(0, 800))
  })`);
}

async function waitForResponse(pattern, timeoutMs) {
  const event = await cdp.waitFor("Network.responseReceived", (item) => pattern.test(item.response.url), timeoutMs);
  let body = null;
  try {
    const result = await cdp.send("Network.getResponseBody", { requestId: event.requestId });
    body = JSON.parse(result.body);
  } catch {}
  return { url: event.response.url, status: event.response.status, mimeType: event.response.mimeType, body };
}

async function waitForOptionalResponse(pattern, timeoutMs) {
  try {
    return await waitForResponse(pattern, timeoutMs);
  } catch {
    return null;
  }
}

async function screenshot(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true, captureBeyondViewport: false });
  await writeFile(join(evidenceDir, name), Buffer.from(result.data, "base64"));
}

async function navigate(path) {
  await cdp.send("Page.navigate", { url: path.startsWith("http") ? path : `${baseUrl}${path}` });
  await waitForUrl(new RegExp(path === "/" ? `${escapeRegExp(baseUrl)}/?$` : escapeRegExp(path)));
  await waitForSelector("main");
}

async function waitForPageTarget() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      const targets = await fetch(`http://127.0.0.1:${port}/json/list`).then((response) => response.json());
      const page = targets.find((item) => item.type === "page" && item.url.startsWith(baseUrl));
      if (page?.webSocketDebuggerUrl) return page;
    } catch {}
    await delay(100);
  }
  throw new Error("Chrome DevTools target did not become ready");
}

async function createCdpClient(url) {
  const socket = new WebSocket(url);
  const pending = new Map();
  const listeners = new Map();
  let sequence = 0;
  await new Promise((resolvePromise, reject) => {
    socket.addEventListener("open", resolvePromise, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id && pending.has(message.id)) {
      const item = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) item.reject(new Error(message.error.message));
      else item.resolve(message.result || {});
      return;
    }
    if (!message.method) return;
    for (const listener of listeners.get(message.method) || []) listener(message.params || {});
  });
  return {
    send(method, params = {}) {
      return new Promise((resolvePromise, reject) => {
        const id = ++sequence;
        pending.set(id, { resolve: resolvePromise, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    on(method, listener) {
      if (!listeners.has(method)) listeners.set(method, new Set());
      listeners.get(method).add(listener);
    },
    waitFor(method, predicate, timeoutMs) {
      return new Promise((resolvePromise, reject) => {
        const listener = (event) => {
          if (!predicate(event)) return;
          clearTimeout(timer);
          listeners.get(method)?.delete(listener);
          resolvePromise(event);
        };
        if (!listeners.has(method)) listeners.set(method, new Set());
        listeners.get(method).add(listener);
        const timer = setTimeout(() => {
          listeners.get(method)?.delete(listener);
          reject(new Error(`Timed out waiting for ${method}`));
        }, timeoutMs);
      });
    },
    close() { socket.close(); },
  };
}

async function setViewport(width, height, mobile = false) {
  await cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
    screenWidth: width,
    screenHeight: height,
  });
  await delay(100);
}

async function waitForSelector(selector) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for selector ${selector}`);
}

async function waitForUrl(pattern) {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const url = await evaluate("location.href").catch(() => "");
    if (pattern.test(url)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for URL ${pattern}`);
}

async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || "browser evaluation failed");
  return result.result.value;
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function progress(message) {
  process.stderr.write(`[phase07-browser] ${message}\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
