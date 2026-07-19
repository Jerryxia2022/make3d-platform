import { resolve } from "node:path";

import { loadWorkerConfig, processJob } from "../../make3d-file-sync-worker.mjs";
import { verifyLocalFileSha256 } from "./localFiles.mjs";

export async function pullOrReuseLocalFile(file, options = {}) {
  const rootDir = options.rootDir;
  const before = await verifyLocalFileSha256(file, { rootDir });
  if (isVerified(before)) {
    return buildResult(file, before, {
      ok: true,
      status: "verified",
      alreadyExisted: true,
      message: "文件已存在且大小、SHA-256 均一致，未重复下载。",
    });
  }

  const jobId = Number(file?.local_file_sync_job_id);
  if (!Number.isInteger(jobId) || jobId <= 0) {
    return buildResult(file, before, {
      ok: false,
      status: "missing_sync_job",
      errorCode: "SYNC_JOB_NOT_FOUND",
      message: "该文件尚未生成同步任务，无法从本地工作台拉取。",
    });
  }

  if (!["pending", "failed"].includes(String(file?.sync_status || ""))) {
    return buildResult(file, before, {
      ok: false,
      status: String(file?.sync_status || "not_downloaded"),
      errorCode: String(file?.sync_status || "") === "verified"
        ? "VERIFIED_LOCAL_FILE_MISSING"
        : "SYNC_JOB_NOT_AVAILABLE",
      message: String(file?.sync_status || "") === "verified"
        ? "云端任务已完成但本地文件缺失或校验失败；为保留同步审计，本地工作台不会擅自重置该任务。"
        : "文件同步任务正在处理中，请稍后刷新页面。",
    });
  }

  const pullJobImpl = options.pullJobImpl || runFileSyncJobOnce;
  const workerResult = await pullJobImpl(jobId, { rootDir });
  const after = await verifyLocalFileSha256(file, { rootDir });
  if (!isVerified(after)) {
    return buildResult(file, after, {
      ok: false,
      status: workerResult?.status || "failed",
      errorCode: "LOCAL_FILE_PULL_FAILED",
      message: localPullFailureMessage(workerResult, after),
    });
  }

  return buildResult(file, after, {
    ok: true,
    status: "verified",
    alreadyExisted: Boolean(workerResult?.reused),
    message: workerResult?.reused
      ? "本地已有相同文件，校验通过，未重复写入。"
      : "文件已从云端 Worker API 拉取并完成大小、SHA-256 校验。",
  });
}

export async function runFileSyncJobOnce(jobId, options = {}) {
  const config = await loadWorkerConfig();
  if (resolve(config.rootDir, "files") !== resolve(options.rootDir)) {
    throw new Error("file sync worker root does not match LOCAL_ORDER_FILES_ROOT");
  }
  return processJob(config, { job_id: jobId });
}

function isVerified(value) {
  return value?.exists === true && value?.size_matches !== false && value?.sha_matches === true;
}

function buildResult(file, check, values) {
  return {
    orderId: Number(file?.order_id || 0) || null,
    status: values.status,
    originalFilename: file?.original_filename || file?.masked_filename || null,
    savedFilename: check?.path ? String(check.path).split(/[\\/]/).pop() : null,
    savedDirectory: check?.directory || null,
    savedPath: check?.path || null,
    sizeBytes: Number(check?.size || 0) || null,
    downloadedAt: file?.local_synced_at || check?.modified_at || null,
    alreadyExisted: Boolean(values.alreadyExisted),
    fileExists: check?.exists === true,
    sizeMatches: check?.size_matches ?? null,
    shaMatches: check?.sha_matches ?? null,
    errorCode: values.errorCode || null,
    detail: check?.error || file?.last_error_summary || null,
    message: values.message,
    ok: values.ok,
  };
}

function localPullFailureMessage(workerResult, check) {
  if (workerResult?.reason === "lock-not-available") {
    return "同步任务已被文件同步服务领取，请稍后刷新页面。";
  }
  if (check?.error === "sha256-mismatch") return "文件已下载但 SHA-256 不一致，已按失败处理。";
  if (check?.error === "not-found") return "下载流程未生成最终文件，请查看文件同步 Worker 日志。";
  return `文件拉取未完成：${workerResult?.reason || check?.error || "未知错误"}`;
}
