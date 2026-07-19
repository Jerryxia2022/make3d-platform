(() => {
  "use strict";

  const terminalStages = new Set(["SUCCESS", "PARTIAL", "FAILED"]);
  const stageOrder = ["VALIDATING", "SLICING", "PARSING", "SUCCESS"];

  document.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-copy-value]");
    if (!button) return;
    const value = button.getAttribute("data-copy-value") || "";
    try {
      await copyText(value);
      showTemporaryButtonText(button, "已复制");
    } catch {
      showTemporaryButtonText(button, "复制失败");
    }
  });

  for (const form of document.querySelectorAll("form[data-busy-form]")) {
    form.addEventListener("submit", () => setFormBusy(form, "处理中…"));
  }

  const listForm = document.querySelector("form[data-order-list-form]");
  if (listForm) {
    listForm.addEventListener("submit", () => {
      listForm.closest("main")?.setAttribute("aria-busy", "true");
      setFormBusy(listForm, "加载中…");
    });
  }

  document.querySelector("[data-local-refresh]")?.addEventListener("click", (event) => {
    event.currentTarget.disabled = true;
    document.querySelector("main")?.setAttribute("aria-busy", "true");
    location.reload();
  });

  for (const form of document.querySelectorAll("form[data-open-directory-form]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      const message = form.querySelector("[data-open-directory-message]");
      setFormBusy(form, "正在打开…", button);
      if (message) {
        message.textContent = "正在定位 Windows 文件资源管理器窗口…";
        message.className = "inline-note";
      }
      try {
        const response = await postFormJson(form);
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(payload.message || `打开失败（HTTP ${response.status}）`);
        const focused = payload.status === "directory-focused" && payload.foregroundVerified === true;
        if (message) {
          message.dataset.status = payload.status || "unknown";
          message.dataset.targetHwnd = String(payload.targetHwnd || "");
          message.dataset.foregroundHwnd = String(payload.foregroundHwnd || "");
          message.dataset.foregroundHwndBefore = String(payload.diagnostics?.foregroundHwndBefore || "");
          message.dataset.restored = String(payload.restored === true);
          message.textContent = focused
            ? "已打开并切换到前台"
            : payload.message || "文件夹已打开，但没有取得前台焦点";
          message.className = focused ? "ok" : "warn";
        }
      } catch (error) {
        if (message) {
          message.dataset.status = "directory-open-failed";
          message.textContent = error.message || "打开文件夹失败";
          message.className = "danger";
        }
      } finally {
        setFormBusy(form, null, button);
      }
    });
  }

  for (const form of document.querySelectorAll("form[data-local-save-form]")) {
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = form.querySelector("button[type='submit']");
      setFormBusy(form, "保存中…");
      try {
        const response = await postFormJson(form);
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(payload.message || `保存失败（HTTP ${response.status}）`);
        showFormMessage(form, payload.message, "status-success");
        setTimeout(() => location.reload(), 350);
      } catch (error) {
        showFormMessage(form, error.message || "保存失败", "status-failed");
      } finally {
        setFormBusy(form, null, button);
      }
    });
  }

  const generateReplyButton = document.querySelector("[data-generate-reply]");
  if (generateReplyButton) {
    const form = generateReplyButton.closest("form");
    const price = form?.querySelector("[data-confirmed-price]");
    const shipDate = form?.querySelector("[data-expected-ship-date]");
    const reason = form?.querySelector("[data-price-reason]");
    const reply = form?.querySelector("[data-reply-draft]");
    const stale = form?.querySelector("[data-reply-stale]");
    const markStale = () => {
      if (!reply?.value.trim()) return;
      stale.textContent = "价格或日期已经变化，当前回复可能过期。";
      stale.className = "warn";
    };
    price?.addEventListener("input", markStale);
    shipDate?.addEventListener("input", markStale);
    reason?.addEventListener("input", markStale);
    generateReplyButton.addEventListener("click", () => {
      const amount = price?.value.trim() ? `¥${Number(price.value).toFixed(2)}` : "待人工确认";
      const date = shipDate?.value || "待确认";
      const material = generateReplyButton.dataset.material || "待确认";
      const color = generateReplyButton.dataset.color || "待确认";
      const quantity = generateReplyButton.dataset.quantity || "1";
      const reasonText = reason?.value.trim();
      reply.value = [
        "您好，您的 Make3D 订单已完成人工核对。",
        `人工确认价格：${amount}`,
        `预计发货时间：${date}`,
        `材料 / 颜色 / 数量：${material} / ${color} / ${quantity}`,
        reasonText ? `人工核价说明：${reasonText}` : "",
        "请登录订单详情查看并确认，如需调整请回复订单消息。",
      ].filter(Boolean).join("\n");
      stale.textContent = "已根据当前信息重新生成，可继续人工编辑。";
      stale.className = "ok";
      reply.focus();
    });
  }

  const sliceForm = document.querySelector("form[data-slice-run-form]");
  if (sliceForm) {
    sliceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const progress = document.querySelector("#slice-progress");
      const message = document.querySelector("#slice-progress-message");
      const result = document.querySelector("#slice-live-result");
      const button = sliceForm.querySelector("button[type='submit']");
      progress.hidden = false;
      result.replaceChildren();
      updateProgress("VALIDATING", "正在提交切片任务并校验 STL 文件…");
      setFormBusy(sliceForm, "切片中…");

      try {
        const response = await postFormJson(sliceForm);
        const payload = await readJsonResponse(response);
        if (!response.ok) throw new Error(payload.message || `切片未启动（HTTP ${response.status}）`);
        updateProgress(payload.stage || "VALIDATING", payload.message || "切片任务已开始");
        await pollSliceStatus(payload.statusUrl, result);
      } catch (error) {
        updateProgress("FAILED", error.message || "切片任务失败");
        renderTerminalResult(result, {
          stage: "FAILED",
          message: error.message || "切片任务失败",
          result: null,
        });
      } finally {
        setFormBusy(sliceForm, null, button);
        message.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
  }

  async function pollSliceStatus(statusUrl, resultElement) {
    if (!statusUrl || !statusUrl.startsWith("/api/local/orders/")) {
      throw new Error("切片状态地址无效");
    }
    const deadline = Date.now() + 15 * 60 * 1000;
    while (Date.now() < deadline) {
      await delay(500);
      const response = await fetch(statusUrl, {
        method: "GET",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      const payload = await readJsonResponse(response);
      if (!response.ok) throw new Error(payload.message || `状态查询失败（HTTP ${response.status}）`);
      updateProgress(payload.stage, payload.message);
      if (payload.terminal || terminalStages.has(payload.stage)) {
        renderTerminalResult(resultElement, payload);
        return payload;
      }
    }
    throw new Error("切片超过 15 分钟仍未结束，请查看服务日志后再重试");
  }

  function updateProgress(stage, text) {
    const normalized = terminalStages.has(stage) ? stage : String(stage || "VALIDATING");
    const effectiveStage = normalized === "PARTIAL" || normalized === "FAILED" ? "SUCCESS" : normalized;
    const activeIndex = stageOrder.indexOf(effectiveStage);
    for (const element of document.querySelectorAll(".progress-stage")) {
      const index = stageOrder.indexOf(element.dataset.stage);
      const terminalComplete = terminalStages.has(normalized)
        && normalized !== "FAILED"
        && index === activeIndex;
      element.classList.toggle("done", index >= 0 && (activeIndex > index || terminalComplete));
      element.classList.toggle("active", index === activeIndex && !terminalStages.has(normalized));
      element.classList.toggle("failed", normalized === "FAILED" && index === activeIndex);
      element.classList.toggle("warning", normalized === "PARTIAL" && index === activeIndex);
    }
    const message = document.querySelector("#slice-progress-message");
    if (message) {
      message.textContent = text || stageLabel(normalized);
      message.className = `next-step ${normalized === "FAILED" ? "danger" : normalized === "PARTIAL" ? "warn" : normalized === "SUCCESS" ? "ok" : ""}`;
    }
  }

  function renderTerminalResult(container, payload) {
    const result = payload.result || {};
    const complete = payload.stage === "SUCCESS"
      && result.gcodeSizeBytes > 0
      && result.printTimeSeconds > 0
      && result.materialWeightGrams > 0
      && result.exitCode === 0;
    const isPartial = payload.stage === "PARTIAL" || (!complete && payload.stage === "SUCCESS");
    const isFailure = payload.stage === "FAILED";
    const heading = complete ? "切片完整成功" : isPartial ? "切片未完整完成" : "切片失败";
    const className = complete ? "status-success" : isPartial ? "status-warning" : "status-failed";
    const fields = isFailure ? [
      ["失败阶段", result.failureStage || "未知"],
      ["退出码", valueOrUnavailable(result.exitCode)],
      ["失败原因", result.failureSummary || payload.message || "未知错误"],
    ] : [
      ["预计打印时间", formatDuration(result.printTimeSeconds)],
      ["耗材重量", result.materialWeightGrams > 0 ? `${round(result.materialWeightGrams, 3)} g` : "未解析"],
      ["G-code 大小", formatBytes(result.gcodeSizeBytes)],
      ["退出码", valueOrUnavailable(result.exitCode)],
      ["切片器版本", result.slicerVersion || "暂不可用"],
      ["配置", result.profileName || "暂不可用"],
    ];
    const detailRows = fields.map(([label, value]) => `<div class="result-card"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`).join("");
    const path = result.gcodePath ? `<div class="path-box"><span class="status-label">G-code 路径</span><code class="path-value" title="${escapeHtml(result.gcodePath)}">${escapeHtml(result.gcodePath)}</code><button type="button" class="text-button" data-copy-value="${escapeHtml(result.gcodePath)}">复制</button></div>` : "";
    container.innerHTML = `<section class="live-result ${className}"><h3>${heading}</h3><p>${escapeHtml(payload.message || stageLabel(payload.stage))}</p><div class="result-grid">${detailRows}</div>${path}<p><a class="button-link primary" href="${escapeHtml(location.pathname.replace(/\/local-slice\/confirm$/, ""))}">返回订单详情查看完整结果</a></p></section>`;
  }

  async function postFormJson(form) {
    return fetch(form.action, {
      method: "POST",
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      },
      body: new URLSearchParams(new FormData(form)),
    });
  }

  async function readJsonResponse(response) {
    const text = await response.text();
    try {
      return JSON.parse(text);
    } catch {
      return { message: text.trim() || `HTTP ${response.status}` };
    }
  }

  function setFormBusy(form, text, originalButton) {
    const button = originalButton || form.querySelector("button[type='submit']");
    if (!button) return;
    if (text) {
      button.dataset.originalText ||= button.textContent;
      button.textContent = text;
      button.disabled = true;
      form.setAttribute("aria-busy", "true");
      return;
    }
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
    form.removeAttribute("aria-busy");
  }

  function showFormMessage(form, text, className) {
    let message = form.querySelector("[data-form-message]");
    if (!message) {
      message = document.createElement("p");
      message.dataset.formMessage = "true";
      form.append(message);
    }
    message.className = className;
    message.textContent = text;
  }

  function showTemporaryButtonText(button, text) {
    const original = button.textContent;
    button.textContent = text;
    setTimeout(() => { button.textContent = original; }, 1200);
  }

  async function copyText(value) {
    if (navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(value);
        return;
      } catch {
        // Local Chrome sessions may deny the async clipboard API.
      }
    }
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    if (!copied) throw new Error("clipboard unavailable");
  }

  function stageLabel(stage) {
    return ({ VALIDATING: "验证 STL", SLICING: "生成 G-code", PARSING: "解析指标", SUCCESS: "切片完成", PARTIAL: "切片未完整完成", FAILED: "切片失败" })[stage] || "处理中";
  }

  function formatDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return "未解析";
    const hours = Math.floor(value / 3600);
    const minutes = Math.floor((value % 3600) / 60);
    const rest = Math.round(value % 60);
    return `${hours ? `${hours} 小时 ` : ""}${minutes} 分 ${rest} 秒`;
  }

  function formatBytes(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "未生成";
    if (value >= 1024 * 1024) return `${round(value / 1024 / 1024, 2)} MB`;
    if (value >= 1024) return `${round(value / 1024, 2)} KB`;
    return `${value} B`;
  }

  function valueOrUnavailable(value) {
    return value === null || value === undefined || value === "" ? "暂不可用" : String(value);
  }

  function round(value, decimals) {
    return Math.round(Number(value) * (10 ** decimals)) / (10 ** decimals);
  }

  function delay(milliseconds) {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }
})();
