"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createQuoteFileId,
  estimateDisplayDimensions,
  estimateFiles,
  estimateOrderSummary,
  formatBytes,
  formatDimensions,
  formatOptionSummary,
  getSafeQuantity,
  safeFileSize,
  type QuoteDimensions,
  type QuoteFileLike,
  type SelectedQuoteFile,
} from "@/frontend/lib/quote-estimates";
import {
  isValidMainlandPhone,
  mainlandPhoneErrorMessage,
  mainlandPhoneHtmlPattern,
} from "@/shared/phoneValidation";
import { StlModelPreview } from "@/frontend/components/StlModelPreview";

const materials = ["PLA", "PETG", "ABS"];
const colors = ["黑", "白", "红", "蓝"];
const shippingMethods = ["普通快递", "顺丰快递", "西安本地跑腿"];
const allowedExtensions = [".stl", ".step", ".stp"];
const SLICE_MATERIAL = "PETG";
const DEFAULT_COLOR = "白";
const MAX_FILE_COUNT = 5;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const customerNamePattern = "(?:[\\u4e00-\\u9fa5]{2,}|[A-Za-z][A-Za-z\\s'-]{3,})";
const guestUploadGateMessage = "请先登录后使用在线上传和自动报价功能。";

type SelectedModelFile = SelectedQuoteFile & {
  file: File | QuoteFileLike;
  draftFileId?: number;
  fileUrl?: string;
};

type SliceQuoteStatus = "waiting" | "calculating" | "success" | "failed" | "manual";

type SliceQuoteResult = {
  filamentWeightG: number;
  printTimeSeconds: number;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: string | null;
  materialDensity: number | null;
  materialFee: number;
  timeFee: number;
  basePrintPrice: number;
};

type SavedUploadInfo = {
  filename: string;
  filepath: string;
  filesize: number;
};

type QuoteDraftFile = {
  id: number;
  originalFilename: string;
  filename: string;
  filepath: string;
  filesize: number;
  material: string | null;
  color: string | null;
  quantity: number;
  boundingBoxX: number | null;
  boundingBoxY: number | null;
  boundingBoxZ: number | null;
  sliceStatus: SliceQuoteStatus;
  errorMessage: string | null;
  filamentWeightG: number | null;
  printTimeSeconds: number | null;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: string | null;
  materialDensity: number | null;
  materialFee: number | null;
  timeFee: number | null;
  basePrintPrice: number | null;
};

type QuoteDraftResponse = {
  draft?: {
    id: number;
    expiresAt: number;
    files: QuoteDraftFile[];
  } | null;
};

type SliceQuoteState = {
  status: SliceQuoteStatus;
  message?: string;
  material?: string;
  progress: number;
  phase: string;
  startedAt?: number;
  elapsedSeconds: number;
  quantity: number;
  result?: SliceQuoteResult;
  savedUpload?: SavedUploadInfo;
};

type QuoteFormCustomer = {
  name: string;
  phone: string;
  wechat: string;
  email: string | null;
};

export function QuoteForm({
  customer,
  disabled = false,
}: {
  customer?: QuoteFormCustomer | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedModelFile[]>([]);
  const [stlDimensions, setStlDimensions] = useState<Record<string, QuoteDimensions>>({});
  const [sliceQuotes, setSliceQuotes] = useState<Record<string, SliceQuoteState>>({});
  const filesRef = useRef<SelectedModelFile[]>([]);
  const stlDimensionsRef = useRef<Record<string, QuoteDimensions>>({});
  const sliceQuotesRef = useRef<Record<string, SliceQuoteState>>({});
  const [shippingMethod, setShippingMethod] = useState("普通快递");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const fileEstimates = useMemo(() => estimateFiles(files), [files]);
  const orderSummary = useMemo(
    () => buildOrderSummary(files, fileEstimates, sliceQuotes, shippingMethod),
    [files, fileEstimates, sliceQuotes, shippingMethod],
  );
  const hasPendingQuotes = useMemo(
    () =>
      files.some((file) => {
        const quote = getVisibleSliceQuote(file, sliceQuotes[file.id]);
        return quote.status === "waiting" || quote.status === "calculating";
      }),
    [files, sliceQuotes],
  );
  const hasManualQuotes = useMemo(
    () =>
      files.some((file) => {
        const quote = getVisibleSliceQuote(file, sliceQuotes[file.id]);
        return quote.status === "manual" || quote.status === "failed";
      }),
    [files, sliceQuotes],
  );
  useEffect(() => {
    sliceQuotesRef.current = sliceQuotes;
  }, [sliceQuotes]);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  useEffect(() => {
    stlDimensionsRef.current = stlDimensions;
  }, [stlDimensions]);

  useEffect(() => {
    if (disabled) {
      return;
    }

    let cancelled = false;

    fetch("/api/quote/draft", { credentials: "same-origin", cache: "no-store" })
      .then((response) => (response.ok ? response.json() as Promise<QuoteDraftResponse> : { draft: null }))
      .then((data) => {
        if (cancelled || filesRef.current.length > 0 || !data.draft?.files?.length) {
          return;
        }

        restoreQuoteDraft(data.draft.files);
      })
      .catch((error) => {
        console.error("Quote draft restore failed", error);
      });

    return () => {
      cancelled = true;
    };
  }, [disabled]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setSliceQuotes((quotes) => {
        let changed = false;
        const nextQuotes = { ...quotes };

        for (const [id, quote] of Object.entries(quotes)) {
          if (quote.status !== "calculating" || !quote.startedAt) {
            continue;
          }

          const elapsedSeconds = Math.floor((Date.now() - quote.startedAt) / 1000);

          if (elapsedSeconds >= 120) {
            nextQuotes[id] = {
              ...quote,
              status: "failed",
              message: "切片超时",
              phase: "计算超时，需人工确认",
              progress: 100,
              elapsedSeconds,
            };
            changed = true;
            continue;
          }

          const progress = Math.min(70, Math.max(25, 45 + Math.floor((elapsedSeconds / 90) * 25)));
          nextQuotes[id] = {
            ...quote,
            elapsedSeconds,
            phase: getSliceProgressPhase(progress),
            progress,
          };
          changed = true;
        }

        return changed ? nextQuotes : quotes;
      });
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  function restoreQuoteDraft(draftFiles: QuoteDraftFile[]) {
    const restoredFiles = draftFiles.map(createDraftModelFile);
    const restoredQuotes: Record<string, SliceQuoteState> = {};
    const restoredDimensions: Record<string, QuoteDimensions> = {};

    for (const draftFile of draftFiles) {
      const id = createDraftModelFileId(draftFile.id);
      restoredQuotes[id] = createDraftQuoteState(draftFile);

      if (
        typeof draftFile.boundingBoxX === "number" &&
        typeof draftFile.boundingBoxY === "number" &&
        typeof draftFile.boundingBoxZ === "number"
      ) {
        restoredDimensions[id] = {
          x: draftFile.boundingBoxX,
          y: draftFile.boundingBoxY,
          z: draftFile.boundingBoxZ,
        };
      }
    }

    setFiles(restoredFiles);
    setSliceQuotes(restoredQuotes);
    setStlDimensions(restoredDimensions);
  }

  function addFiles(nextFiles: FileList | File[]) {
    if (disabled) {
      setError(guestUploadGateMessage);
      return;
    }

    setError("");
    const incomingFiles = Array.from(nextFiles);

    if (files.length + incomingFiles.length > MAX_FILE_COUNT) {
      setError("一次最多上传 5 个模型文件");
      return;
    }

    const invalidFile = incomingFiles.find((file) => !isAllowedFile(file));

    if (invalidFile) {
      setError("仅支持 .stl / .step / .stp，单文件最大 50MB");
      return;
    }

    const selectedFiles = incomingFiles.map((file) => ({
      id: createQuoteFileId(file),
      file,
      material: SLICE_MATERIAL,
      color: DEFAULT_COLOR,
      quantity: 1,
    }));

    setFiles((currentFiles) => [
      ...currentFiles,
      ...selectedFiles,
    ]);
    setSliceQuotes((quotes) => {
      const nextQuotes = { ...quotes };
      for (const item of selectedFiles) {
        nextQuotes[item.id] = createUploadedQuoteState(SLICE_MATERIAL, item.quantity);
      }
      return nextQuotes;
    });
    for (const item of selectedFiles) {
      void runSliceForFile(item);
    }
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    if (disabled) {
      setError(guestUploadGateMessage);
      return;
    }
    addFiles(event.dataTransfer.files);
  }

  function rememberDraftFile(id: string, draftFileId: number | undefined) {
    if (!draftFileId) {
      return;
    }

    setFiles((currentFiles) =>
      currentFiles.map((item) =>
        item.id === id
          ? {
              ...item,
              draftFileId,
              fileUrl: `/api/quote/draft/files/${draftFileId}/download`,
            }
          : item,
      ),
    );

    const currentFile = filesRef.current.find((item) => item.id === id);
    const dimensions = stlDimensionsRef.current[id];
    void updateQuoteDraftFile(draftFileId, {
      material: currentFile?.material,
      color: currentFile?.color,
      quantity: currentFile?.quantity,
      boundingBoxX: dimensions?.x,
      boundingBoxY: dimensions?.y,
      boundingBoxZ: dimensions?.z,
    });
  }

  async function runSliceForFile(item: SelectedModelFile) {
    if (!(item.file instanceof File)) {
      return;
    }

    const current = sliceQuotesRef.current[item.id];

    if (current && ["calculating", "success", "failed"].includes(current.status)) {
      return;
    }

    setSliceQuotes((quotes) => ({
      ...quotes,
      [item.id]: {
        status: "calculating",
        material: SLICE_MATERIAL,
        message: "正在计算",
        progress: 25,
        phase: "正在准备切片任务",
        startedAt: Date.now(),
        elapsedSeconds: 0,
        quantity: item.quantity,
      },
    }));

    try {
      setSliceQuotes((quotes) => ({
        ...quotes,
        [item.id]: {
          ...(quotes[item.id] || createUploadedQuoteState(SLICE_MATERIAL, item.quantity)),
          status: "calculating",
          material: SLICE_MATERIAL,
          message: "正在计算",
          progress: 45,
          phase: "正在调用 PrusaSlicer",
          startedAt: quotes[item.id]?.startedAt || Date.now(),
          elapsedSeconds: quotes[item.id]?.elapsedSeconds || 0,
          quantity: item.quantity,
        },
      }));

      const formData = new FormData();
      formData.append("modelFile", item.file);
      formData.append("material", SLICE_MATERIAL);
      formData.append("color", item.color);
      formData.append("quantity", String(item.quantity));

      const response = await fetch("/api/quote/slice", {
        method: "POST",
        body: formData,
      });
      const result = await readSliceQuoteResponse(response);
      const quoteResult = result.result;
      const savedUpload = normalizeSavedUploadInfo(result.saved_upload);
      const draftFileId = normalizeDraftFileId(result.draft_file_id);

      rememberDraftFile(item.id, draftFileId);

      if (savedUpload && !quoteResult) {
        setSliceQuotes((quotes) => ({
          ...quotes,
          [item.id]: {
            ...createManualQuoteState(item.quantity, savedUpload),
            material: SLICE_MATERIAL,
            message: result.message || "需人工确认",
          },
        }));
        return;
      }

      if (!response.ok || !result.success || !quoteResult) {
        console.error("Auto quote API failed", {
          file: item.file.name,
          status: response.status,
          result,
        });
        setSliceQuotes((quotes) => ({
          ...quotes,
          [item.id]: {
            ...(quotes[item.id] || createUploadedQuoteState(SLICE_MATERIAL, item.quantity)),
            status: "failed",
            material: SLICE_MATERIAL,
            message: getSliceFailureReason(result),
            phase: "计算失败，需人工确认",
            progress: 100,
            quantity: item.quantity,
            savedUpload,
          },
        }));
        return;
      }

      setSliceQuotes((quotes) => ({
        ...quotes,
        [item.id]:
          quotes[item.id]?.status === "failed" && quotes[item.id]?.message === "切片超时"
            ? quotes[item.id]
            : {
                status: "success",
                material: SLICE_MATERIAL,
                message: "已完成",
                progress: 100,
                phase: "报价完成",
                elapsedSeconds: quotes[item.id]?.elapsedSeconds || 0,
                quantity: item.quantity,
                result: normalizeSliceQuoteResult(quoteResult),
                savedUpload,
              },
      }));
    } catch (error) {
      console.error("Auto quote API failed", {
        file: item.file.name,
        error,
      });
      setSliceQuotes((quotes) => ({
        ...quotes,
        [item.id]: {
          ...(quotes[item.id] || createUploadedQuoteState(SLICE_MATERIAL, item.quantity)),
          status: "failed",
          material: SLICE_MATERIAL,
          message: getSliceFailureReason({
            error: error instanceof Error ? error.message : "Unknown auto quote error",
          }),
          phase: "计算失败，需人工确认",
          progress: 100,
          quantity: item.quantity,
          savedUpload: quotes[item.id]?.savedUpload,
        },
      }));
    }
  }

  function updateFileOption(id: string, option: "material" | "color", value: string) {
    const currentFile = filesRef.current.find((item) => item.id === id);

    setFiles((currentFiles) =>
      currentFiles.map((item) => (item.id === id ? { ...item, [option]: value } : item)),
    );

    if (currentFile?.draftFileId) {
      void updateQuoteDraftFile(currentFile.draftFileId, { [option]: value });
    }
  }

  function updateFileQuantity(id: string, value: string) {
    const quantity = Number(value);

    if (!isValidQuantity(quantity)) {
      setError("数量必须是 1-1000 的整数");
      return;
    }

    setError("");
    const currentFile = filesRef.current.find((item) => item.id === id);

    setFiles((currentFiles) =>
      currentFiles.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );

    if (currentFile?.draftFileId) {
      void updateQuoteDraftFile(currentFile.draftFileId, { quantity });
    }
  }

  function removeFile(id: string) {
    const currentFile = filesRef.current.find((item) => item.id === id);

    setFiles((currentFiles) => currentFiles.filter((item) => item.id !== id));
    setStlDimensions((dimensions) => {
      const nextDimensions = { ...dimensions };
      delete nextDimensions[id];
      return nextDimensions;
    });
    setSliceQuotes((quotes) => {
      const nextQuotes = { ...quotes };
      delete nextQuotes[id];
      return nextQuotes;
    });

    if (currentFile?.draftFileId) {
      void deleteQuoteDraftFile(currentFile.draftFileId);
    }
  }

  const updatePreviewDimensions = useCallback((id: string, dimensions: QuoteDimensions) => {
    const currentFile = filesRef.current.find((item) => item.id === id);

    setStlDimensions((currentDimensions) => {
      const current = currentDimensions[id];

      if (
        current?.x === dimensions.x &&
        current.y === dimensions.y &&
        current.z === dimensions.z
      ) {
        return currentDimensions;
      }

      return {
        ...currentDimensions,
        [id]: dimensions,
      };
    });

    if (currentFile?.draftFileId) {
      void updateQuoteDraftFile(currentFile.draftFileId, {
        boundingBoxX: dimensions.x,
        boundingBoxY: dimensions.y,
        boundingBoxZ: dimensions.z,
      });
    }
  }, []);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitted(false);

    if (disabled) {
      setError(guestUploadGateMessage);
      return;
    }

    if (files.length === 0) {
      setError("请先上传模型文件");
      return;
    }

    if (hasPendingQuotes) {
      setError("请等待报价完成后提交");
      return;
    }

    if (!validateFileQuantities(files)) {
      setError("数量必须是 1-1000 的整数");
      return;
    }

    const formData = new FormData(event.currentTarget);
    const phone = getRequiredFormValue(formData, "phone");

    if (!isValidMainlandPhone(phone)) {
      setError(mainlandPhoneErrorMessage);
      return;
    }

    setIsSubmitting(true);
    try {
      formData.delete("modelFiles");
      formData.delete("fileMaterials");
      formData.delete("fileColors");
      formData.delete("fileDimensionX");
      formData.delete("fileDimensionY");
      formData.delete("fileDimensionZ");
      formData.delete("fileSliceStatus");
      formData.delete("fileFilamentWeightG");
      formData.delete("filePrintTimeSeconds");
      formData.delete("fileRawFilamentUsedMm");
      formData.delete("fileRawFilamentUsedCm3");
      formData.delete("fileRawFilamentUsedG");
      formData.delete("fileFilamentWeightSource");
      formData.delete("fileMaterialDensity");
      formData.delete("fileMaterialFee");
      formData.delete("fileTimeFee");
      formData.delete("fileQuantities");
      formData.delete("fileUnitPrice");
      formData.delete("fileSubtotalPrice");
      formData.delete("savedFilenames");
      formData.delete("savedFilepaths");
      formData.delete("savedFilesizes");
      formData.set("recipientName", getRequiredFormValue(formData, "customerName"));
      formData.set("phone", phone);
      formData.set("recipientPhone", phone);
      formData.set("addressRegion", "-");
      formData.set("shippingRemark", "");

      for (const item of files) {
        const dimensions = stlDimensions[item.id] || estimateDisplayDimensions(item.file);
        const quote = getVisibleSliceQuote(item, sliceQuotes[item.id]);
        const savedUpload = quote.savedUpload;

        if (!savedUpload) {
          throw new Error("文件仍在上传或保存失败，请稍后重试");
        }

        formData.append("savedFilenames", savedUpload.filename);
        formData.append("savedFilepaths", savedUpload.filepath);
        formData.append("savedFilesizes", String(savedUpload.filesize));
        formData.append("fileMaterials", item.material);
        formData.append("fileColors", item.color);
        formData.append("fileDimensionX", formatDimensionFormValue(dimensions?.x));
        formData.append("fileDimensionY", formatDimensionFormValue(dimensions?.y));
        formData.append("fileDimensionZ", formatDimensionFormValue(dimensions?.z));
        formData.append("fileQuantities", String(getSafeQuantity(item.quantity)));
        formData.append("fileUnitPrice", formatNullableNumber(getFileDisplayPrice(quote, files.length, item.material)));
        formData.append("fileSubtotalPrice", formatNullableNumber(getFileSubtotalPrice(quote, files.length, item.quantity, item.material)));
        appendSliceQuoteFormData(formData, quote, item.material);
      }

      const response = await fetch("/api/orders", {
        credentials: "same-origin",
        method: "POST",
        body: formData,
      });
      const result = await readOrderSubmitResponse(response);

      if (!response.ok) {
        throw new Error(result.error || "提交失败，请稍后再试");
      }

      if (typeof result.id !== "number") {
        throw new Error("订单已提交但返回信息异常，请到我的订单中查看");
      }

      setIsSubmitted(true);
      router.push(`/account/orders/${result.id}/confirm`);
    } catch (submitError) {
      setError(getSubmitFailureMessage(submitError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="grid gap-5 border border-ink/10 bg-white/85 p-4 shadow-sm xl:grid-cols-[minmax(0,1fr)_20rem] xl:p-5"
      onSubmit={handleSubmit}
    >
      <div className="space-y-5">
      <section>
        <div
          className="relative flex min-h-44 flex-col items-center justify-center border border-dashed border-ink/25 bg-white/70 px-5 py-7 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <p className="text-lg font-bold">拖拽模型文件到这里</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-graphite">
            支持 .stl / .step / .stp，最多一次上传 5 个文件，单文件最大 50MB。
          </p>
          {disabled ? (
            <div className="absolute inset-0 flex items-center justify-center bg-white/85 px-6 text-center">
              <p className="max-w-sm text-base font-bold text-ink">
                {guestUploadGateMessage}
              </p>
            </div>
          ) : null}
        </div>
        <input
          accept={allowedExtensions.join(",")}
          className="sr-only"
          disabled={disabled}
          id="modelFiles"
          multiple
          name="modelFiles"
          onChange={(event) => {
            if (event.target.files) {
              addFiles(event.target.files);
              event.target.value = "";
            }
          }}
          ref={fileInputRef}
          type="file"
        />
        <button
          className="mt-4 w-full border border-ink/20 bg-white px-5 py-3 font-semibold text-ink transition hover:border-ink"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              setError(guestUploadGateMessage);
              return;
            }
            fileInputRef.current?.click();
          }}
          type="button"
        >
          选择文件
        </button>
      </section>

      {fileEstimates.length > 0 ? (
        <section className="space-y-3">
          {fileEstimates.map(({ item, dimensions, estimate }) => {
            const quote = getVisibleSliceQuote(item, sliceQuotes[item.id]);
            const displayDimensions = stlDimensions[item.id] || dimensions;
            const filePrice = getFileDisplayPrice(quote, files.length, item.material);
            const fileSubtotal = getFileSubtotalPrice(quote, files.length, item.quantity, item.material);

            return (
            <article className="border border-ink/10 bg-white/90 p-3" key={item.id}>
              <input
                name="fileDimensionX"
                type="hidden"
                value={formatDimensionFormValue(displayDimensions?.x)}
              />
              <input
                name="fileDimensionY"
                type="hidden"
                value={formatDimensionFormValue(displayDimensions?.y)}
              />
              <input
                name="fileDimensionZ"
                type="hidden"
                value={formatDimensionFormValue(displayDimensions?.z)}
              />
              <div className="grid gap-4 sm:grid-cols-[9.75rem_1fr]">
                <StlModelPreview
                  color={item.color}
                  dimensions={displayDimensions}
                  file={item.file instanceof File ? item.file : undefined}
                  fileUrl={item.fileUrl}
                  filename={item.file.name || ""}
                  filesize={item.file.size || 0}
                  material={item.material}
                  onDimensions={(nextDimensions) => updatePreviewDimensions(item.id, nextDimensions)}
                  quantity={item.quantity}
                  quoteStatus={formatSliceStatus(quote)}
                />
                <div className="hidden">
                  <div className="flex aspect-square items-center justify-center border border-ink/10 bg-ash text-xs font-semibold uppercase tracking-[0.16em] text-graphite">
                    占位缩略图
                  </div>
                  <p className="mt-2 text-xs leading-5 text-graphite">
                    {formatDimensions(dimensions)}
                  </p>
                </div>
                <div className="space-y-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.file.name || "未命名模型文件"}</p>
                      <p className="mt-1 text-sm text-graphite">
                        {formatBytes(item.file.size)} · {getFileType(item.file.name)}
                      </p>
                      <p className="mt-1 text-sm text-graphite">
                        如需加急，请在备注中说明，加急可能产生额外费用。
                      </p>
                      {estimate.riskNotice ? (
                        <p
                          className={
                            estimate.riskLevel === "danger"
                              ? "mt-2 border border-red-500/30 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                              : "mt-2 border border-coral/30 bg-coral/10 px-3 py-2 text-sm font-semibold text-coral"
                          }
                        >
                          {estimate.riskNotice}
                        </p>
                      ) : null}
                    </div>
                    <button
                      className="self-start text-sm font-semibold text-coral"
                      disabled={disabled}
                      onClick={() => removeFile(item.id)}
                      type="button"
                    >
                      删除该文件
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="block text-sm font-semibold">
                      材料
                      <select
                        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
                        disabled={disabled}
                        name="fileMaterials"
                        onChange={(event) =>
                          updateFileOption(item.id, "material", event.target.value)
                        }
                        value={item.material}
                      >
                        {materials.map((material) => (
                          <option key={material} value={material}>
                            {material}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      颜色
                      <select
                        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
                        disabled={disabled}
                        name="fileColors"
                        onChange={(event) => updateFileOption(item.id, "color", event.target.value)}
                        value={item.color}
                      >
                        {colors.map((color) => (
                          <option key={color} value={color}>
                            {color}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block text-sm font-semibold">
                      数量
                      <input
                        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
                        disabled={disabled}
                        inputMode="numeric"
                        max="1000"
                        min="1"
                        name="fileQuantities"
                        onChange={(event) => updateFileQuantity(item.id, event.target.value)}
                        step="1"
                        type="number"
                        value={item.quantity}
                      />
                    </label>
                  </div>
                  <SliceQuoteDetails
                    material={item.material}
                    quantity={item.quantity}
                    quote={quote}
                    subtotalPrice={fileSubtotal}
                    unitPrice={filePrice}
                  />
                </div>
              </div>
            </article>
            );
          })}
        </section>
      ) : (
        <section className="border border-ink/10 bg-white/70 p-5">
          <h2 className="text-lg font-bold">文件卡片区域</h2>
          <p className="mt-3 text-sm text-graphite">
            上传模型后会在这里显示文件名、尺寸、材料、颜色、数量、报价状态和单件打印价。
          </p>
        </section>
      )}

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">收货地址信息</h2>
        <input name="wechat" type="hidden" defaultValue={customer?.wechat || ""} />
        <input name="email" type="hidden" defaultValue={customer?.email || ""} />
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="name"
            defaultValue={customer?.name || ""}
            disabled={disabled}
            label="姓名"
            name="customerName"
            pattern={customerNamePattern}
            required
            title="姓名必填：至少2个汉字，或至少4个英文字母"
          />
          <TextField
            autoComplete="tel"
            defaultValue={customer?.phone || ""}
            disabled={disabled}
            inputMode="numeric"
            label="手机号"
            maxLength={11}
            name="phone"
            pattern={mainlandPhoneHtmlPattern}
            required
            title={mainlandPhoneErrorMessage}
            type="tel"
          />
        </div>

        <label className="mt-4 block text-sm font-semibold" htmlFor="shippingMethod">
          配送方式
          <select
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
            disabled={disabled}
            id="shippingMethod"
            name="shippingMethod"
            onChange={(event) => setShippingMethod(event.target.value)}
            value={shippingMethod}
          >
            {shippingMethods.map((method) => (
              <option key={method} value={method}>
                {method}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block text-sm font-semibold">
          收货地址
          <textarea
          className="mt-2 min-h-20 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
            disabled={disabled}
            name="addressDetail"
            placeholder="填写省市区、详细地址、收件说明等"
            required
          />
        </label>

        <label className="mt-4 block text-sm font-semibold">
          备注
          <textarea
          className="mt-2 min-h-24 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
            disabled={disabled}
            name="remark"
            placeholder="补充特殊层高、强度、表面效果、支撑方式、分件打印、加急等要求"
          />
        </label>
      </section>

      </div>

      <aside className="space-y-4 xl:sticky xl:top-6 xl:self-start">
      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">订单汇总</h2>
        {hasPendingQuotes ? (
          <p className="mt-3 border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            文件正在自动切片，完成后将更新总价。调整材料和颜色不会重新切片。
          </p>
        ) : null}
        {!hasPendingQuotes && hasManualQuotes ? (
          <p className="mt-3 border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
            部分文件需人工确认
          </p>
        ) : null}
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryItem label="文件数量" value={`${files.length} 个`} />
          <SummaryItem label="打印费合计" value={formatMoney(orderSummary.printFeeTotal)} />
          <SummaryItem label="配送方式" value={shippingMethod} />
          <SummaryItem label="配送费" value={orderSummary.shippingFeeLabel} />
          <SummaryItem
            highlight
            label="应付总价"
            value={orderSummary.payableLabel}
          />
          <SummaryItem
            label="预计交货期"
            value={orderSummary.leadTimeLabel}
          />
          <SummaryItem label="材料和颜色摘要" value={formatOptionSummary(files)} />
        </dl>
        <p className="mt-4 text-sm font-semibold text-coral">最终价格以人工确认为准。</p>
        <p className="mt-2 text-sm text-graphite">
          如需加急，请在备注中说明，加急可能产生额外费用。
        </p>
      </section>

      {error ? (
        <p className="border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
          {error}
        </p>
      ) : null}

      <button
        className="w-full bg-ink px-5 py-3 font-semibold text-white transition hover:bg-graphite disabled:cursor-not-allowed disabled:bg-graphite/60"
        disabled={isSubmitting || isSubmitted || hasPendingQuotes || disabled}
        type="submit"
      >
        {isSubmitted
          ? "已提交"
          : hasPendingQuotes
            ? "报价计算中..."
            : isSubmitting
              ? "提交中..."
              : "提交订单"}
      </button>
      </aside>
    </form>
  );
}

function SliceQuoteDetails({
  material,
  quantity,
  quote,
  subtotalPrice,
  unitPrice,
}: {
  material: string;
  quantity: number;
  quote: SliceQuoteState;
  subtotalPrice: number | null;
  unitPrice: number | null;
}) {
  return (
    <div className="mt-3 space-y-3">
      <div>
        <div className="flex items-center justify-between text-xs font-semibold text-graphite">
          <span>{quote.phase || formatSliceStatus(quote)}</span>
          <span>{quote.progress}%</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden bg-ash">
          <div
            className="h-full bg-coral transition-all"
            style={{ width: `${Math.min(Math.max(quote.progress, 0), 100)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-graphite">已等待 {quote.elapsedSeconds} 秒</p>
        {quote.elapsedSeconds > 30 && quote.elapsedSeconds < 120 && quote.status === "calculating" ? (
          <p className="mt-1 text-xs font-semibold text-coral">
            模型较复杂，正在继续计算，请稍候
          </p>
        ) : null}
      </div>
      <div className="grid gap-2 text-sm sm:grid-cols-2">
        <QuoteMetric label="报价状态" value={formatSliceStatus(quote)} />
        <QuoteMetric label="材料" value={material} />
        <QuoteMetric
          emphasis
          label="打印单价"
          value={unitPrice == null ? "需人工确认" : formatMoney(unitPrice)}
        />
        <QuoteMetric label="数量" value={String(getSafeQuantity(quantity))} />
        <QuoteMetric
          emphasis
          label="文件小计"
          value={subtotalPrice == null ? "需人工确认" : formatMoney(subtotalPrice)}
        />
      </div>
    </div>
  );
}

function QuoteMetric({
  emphasis = false,
  label,
  value,
}: {
  emphasis?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className="border border-ink/10 bg-white px-3 py-2">
      <dt className="text-xs font-semibold text-graphite">{label}</dt>
      <dd className={emphasis ? "mt-1 font-bold text-coral" : "mt-1 font-semibold text-ink"}>
        {value}
      </dd>
    </div>
  );
}

function TextField({
  autoComplete,
  defaultValue,
  disabled,
  helpText,
  inputMode,
  label,
  maxLength,
  name,
  pattern,
  required,
  title,
  type = "text",
}: {
  autoComplete?: string;
  defaultValue?: string;
  disabled?: boolean;
  helpText?: string;
  inputMode?: "email" | "numeric" | "search" | "tel" | "text" | "url";
  label: string;
  maxLength?: number;
  name: string;
  pattern?: string;
  required?: boolean;
  title?: string;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-2.5 font-normal"
        defaultValue={defaultValue}
        disabled={disabled}
        inputMode={inputMode}
        maxLength={maxLength}
        name={name}
        pattern={pattern}
        required={required}
        title={title}
        type={type}
      />
      {helpText ? <span className="mt-2 block text-xs leading-5 text-graphite">{helpText}</span> : null}
    </label>
  );
}

function SummaryItem({
  highlight = false,
  label,
  value,
}: {
  highlight?: boolean;
  label: string;
  value: string;
}) {
  return (
    <div className={highlight ? "border border-coral/40 bg-coral/10 px-4 py-3" : "border border-ink/10 bg-white/80 px-4 py-3"}>
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd className={highlight ? "mt-1 text-2xl font-bold text-coral" : "mt-1 font-semibold text-ink"}>
        {value}
      </dd>
    </div>
  );
}

function getRequiredFormValue(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formatDimensionFormValue(value: QuoteDimensions["x"] | undefined) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? String(value) : "";
}

function isAllowedFile(file: File) {
  const fileName = file.name.toLowerCase();
  return (
    allowedExtensions.some((extension) => fileName.endsWith(extension)) &&
    safeFileSize(file) <= MAX_FILE_BYTES
  );
}

function getFileType(filename: string | null | undefined) {
  return filename?.split(".").pop()?.toUpperCase() || "UNKNOWN";
}

function createUploadedQuoteState(material: string, quantity = 1): SliceQuoteState {
  return {
    status: "waiting",
    material,
    message: "等待计算",
    progress: 10,
    phase: "文件已上传",
    elapsedSeconds: 0,
    quantity: getSafeQuantity(quantity),
  };
}

function createManualQuoteState(quantity = 1, savedUpload?: SavedUploadInfo): SliceQuoteState {
  return {
    status: "manual",
    message: "文件格式不支持",
    progress: 100,
    phase: "需人工确认",
    elapsedSeconds: 0,
    quantity: getSafeQuantity(quantity),
    savedUpload,
  };
}

function createDraftModelFile(draftFile: QuoteDraftFile): SelectedModelFile {
  const displayName = draftFile.originalFilename || draftFile.filename;

  return {
    id: createDraftModelFileId(draftFile.id),
    draftFileId: draftFile.id,
    fileUrl: `/api/quote/draft/files/${draftFile.id}/download`,
    file: {
      name: displayName,
      size: draftFile.filesize,
      lastModified: Date.now(),
    },
    material: draftFile.material || SLICE_MATERIAL,
    color: draftFile.color || DEFAULT_COLOR,
    quantity: getSafeQuantity(draftFile.quantity),
  };
}

function createDraftQuoteState(draftFile: QuoteDraftFile): SliceQuoteState {
  const savedUpload = {
    filename: draftFile.filename,
    filepath: draftFile.filepath,
    filesize: draftFile.filesize,
  };
  const baseState = {
    material: draftFile.material || SLICE_MATERIAL,
    progress: 100,
    elapsedSeconds: 0,
    quantity: getSafeQuantity(draftFile.quantity),
    savedUpload,
  };

  if (draftFile.sliceStatus === "success" && draftFile.filamentWeightG != null && draftFile.printTimeSeconds != null) {
    return {
      ...baseState,
      status: "success",
      message: "已恢复草稿报价",
      phase: "已恢复切片结果",
      result: {
        filamentWeightG: draftFile.filamentWeightG,
        printTimeSeconds: draftFile.printTimeSeconds,
        rawFilamentUsedMm: draftFile.rawFilamentUsedMm,
        rawFilamentUsedCm3: draftFile.rawFilamentUsedCm3,
        rawFilamentUsedG: draftFile.rawFilamentUsedG,
        filamentWeightSource: draftFile.filamentWeightSource,
        materialDensity: draftFile.materialDensity,
        materialFee: draftFile.materialFee || 0,
        timeFee: draftFile.timeFee || 0,
        basePrintPrice: draftFile.basePrintPrice || 0,
      },
    };
  }

  if (draftFile.sliceStatus === "failed") {
    return {
      ...baseState,
      status: "failed",
      message: draftFile.errorMessage || "计算失败，需人工确认",
      phase: "已恢复草稿，需人工确认",
    };
  }

  return {
    ...createManualQuoteState(draftFile.quantity, savedUpload),
    material: draftFile.material || SLICE_MATERIAL,
    message: draftFile.errorMessage || "需人工确认",
    phase: "已恢复草稿，需人工确认",
  };
}

function createDraftModelFileId(id: number) {
  return `draft-${id}`;
}

function getVisibleSliceQuote(
  item: SelectedQuoteFile,
  quote: SliceQuoteState | undefined,
): SliceQuoteState {
  if (!isStlFile(item.file.name)) {
    return quote ? { ...quote, quantity: getSafeQuantity(item.quantity) } : createManualQuoteState(item.quantity);
  }

  return (
    quote ? { ...quote, quantity: getSafeQuantity(item.quantity) } : {
      status: "waiting",
      material: item.material,
      message: "等待计算",
      progress: 0,
      phase: "等待上传完成",
      elapsedSeconds: 0,
      quantity: getSafeQuantity(item.quantity),
    }
  );
}

function getFileDisplayPrice(
  quote: SliceQuoteState,
  fileCount: number,
  material: string,
) {
  const packagingShare = fileCount > 0 ? 3 / fileCount : 0;

  if (quote.status === "success" && quote.result) {
    return roundMoney(
      calculateMaterialFee(quote.result.filamentWeightG, material) +
        quote.result.timeFee +
        packagingShare,
    );
  }

  if (quote.status !== "success") {
    return null;
  }

  return null;
}

function getFileSubtotalPrice(
  quote: SliceQuoteState,
  fileCount: number,
  quantity: number,
  material: string,
) {
  const unitPrice = getFileDisplayPrice(quote, fileCount, material);

  if (unitPrice == null) {
    return null;
  }

  return roundMoney(unitPrice * getSafeQuantity(quantity));
}

function calculateMaterialFee(filamentWeightG: number, material: string) {
  return roundMoney(filamentWeightG * getMaterialRate(material));
}

function isValidQuantity(value: number) {
  return Number.isInteger(value) && value >= 1 && value <= 1000;
}

function validateFileQuantities(files: SelectedModelFile[]) {
  return files.every((file) => isValidQuantity(file.quantity));
}

function buildOrderSummary(
  files: SelectedModelFile[],
  fileEstimates: ReturnType<typeof estimateFiles>,
  sliceQuotes: Record<string, SliceQuoteState>,
  shippingMethod: string,
) {
  const fallbackSummary = estimateOrderSummary(fileEstimates, shippingMethod);
  const shipping = getShippingFee(shippingMethod);
  const shippingAmount = shipping.includedInAutoPrice ? shipping.amount : 0;
  const visibleQuotes = files.map((file) => getVisibleSliceQuote(file, sliceQuotes[file.id]));
  const hasManualFile = visibleQuotes.some((quote) =>
    ["manual", "failed"].includes(quote.status),
  );
  const isCalculating = visibleQuotes.some((quote) =>
    ["waiting", "calculating"].includes(quote.status),
  );
  const successfulQuotes = visibleQuotes.filter(
    (quote): quote is SliceQuoteState & { result: SliceQuoteResult } =>
      quote.status === "success" && Boolean(quote.result),
  );
  const printFeeTotal = files.reduce((total, file, index) => {
    const quote = visibleQuotes[index];
    const price = getFileSubtotalPrice(quote, files.length, file.quantity, file.material);
    return total + (price || 0);
  }, 0);
  const payable =
    !hasManualFile && !isCalculating
      ? roundMoney(Math.max(printFeeTotal + shippingAmount, 20))
      : null;
  const leadTimeLabel =
    successfulQuotes.length > 0
      ? `约${calculateLeadTimeHours(successfulQuotes.map((quote) => quote.result.printTimeSeconds * quote.quantity))}小时`
      : hasManualFile || isCalculating
        ? "需人工确认"
        : `约${fallbackSummary.leadTimeMaxHours}小时`;

  return {
    printFeeTotal,
    shippingFeeLabel: shipping.label,
    payableLabel: payable == null ? "需人工确认" : formatMoney(payable),
    leadTimeLabel,
  };
}

function appendSliceQuoteFormData(
  formData: FormData,
  quote: SliceQuoteState | undefined,
  material: string,
) {
  const result = quote?.status === "success" ? quote.result : null;
  formData.append("fileSliceStatus", quote?.status || "manual");
  formData.append("fileFilamentWeightG", formatNullableNumber(result?.filamentWeightG));
  formData.append("filePrintTimeSeconds", formatNullableNumber(result?.printTimeSeconds));
  formData.append("fileRawFilamentUsedMm", formatNullableNumber(result?.rawFilamentUsedMm));
  formData.append("fileRawFilamentUsedCm3", formatNullableNumber(result?.rawFilamentUsedCm3));
  formData.append("fileRawFilamentUsedG", formatNullableNumber(result?.rawFilamentUsedG));
  formData.append("fileFilamentWeightSource", result?.filamentWeightSource || "");
  formData.append("fileMaterialDensity", formatNullableNumber(result?.materialDensity));
  formData.append(
    "fileMaterialFee",
    formatNullableNumber(result ? calculateMaterialFee(result.filamentWeightG, material) : null),
  );
  formData.append("fileTimeFee", formatNullableNumber(result?.timeFee));
}

async function readSliceQuoteResponse(response: Response) {
  try {
    return await response.json() as {
      success?: boolean;
      message?: string;
      error?: string;
      result?: Record<string, unknown>;
      saved_upload?: Record<string, unknown>;
      draft_file_id?: unknown;
    };
  } catch (error) {
    console.error("Auto quote API response JSON parse failed", error);
    return {
      success: false,
      message: "计算失败，需人工确认",
      error: `HTTP ${response.status}`,
    };
  }
}

function normalizeSavedUploadInfo(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  const filename = typeof value.filename === "string" ? value.filename : "";
  const filepath = typeof value.filepath === "string" ? value.filepath : "";
  const filesize = typeof value.filesize === "number" ? value.filesize : 0;

  return filename && filepath && filesize > 0 ? { filename, filepath, filesize } : undefined;
}

function normalizeDraftFileId(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : undefined;
}

async function updateQuoteDraftFile(
  draftFileId: number,
  input: {
    material?: string;
    color?: string;
    quantity?: number;
    boundingBoxX?: number | null;
    boundingBoxY?: number | null;
    boundingBoxZ?: number | null;
  },
) {
  try {
    await fetch(`/api/quote/draft/files/${draftFileId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "same-origin",
      body: JSON.stringify(input),
    });
  } catch (error) {
    console.error("Quote draft update failed", error);
  }
}

async function deleteQuoteDraftFile(draftFileId: number) {
  try {
    await fetch(`/api/quote/draft/files/${draftFileId}`, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch (error) {
    console.error("Quote draft delete failed", error);
  }
}

async function readOrderSubmitResponse(response: Response) {
  try {
    return (await response.json()) as { id?: number; error?: string };
  } catch {
    return {
      error: response.ok ? "" : `服务器返回异常（HTTP ${response.status}），请稍后重试`,
    };
  }
}

function getSubmitFailureMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "";

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return "订单提交失败，网络或服务器暂时无响应，请检查网络后重试。";
  }

  return message || "提交失败，请稍后再试";
}

function normalizeSliceQuoteResult(value: Record<string, unknown>): SliceQuoteResult {
  return {
    filamentWeightG: readNumber(value.filament_weight_g),
    printTimeSeconds: readNumber(value.print_time_seconds),
    rawFilamentUsedMm: readNullableNumber(value.raw_filament_used_mm),
    rawFilamentUsedCm3: readNullableNumber(value.raw_filament_used_cm3),
    rawFilamentUsedG: readNullableNumber(value.raw_filament_used_g),
    filamentWeightSource:
      typeof value.filament_weight_source === "string" ? value.filament_weight_source : null,
    materialDensity: readNullableNumber(value.material_density),
    materialFee: readNumber(value.material_fee),
    timeFee: readNumber(value.time_fee),
    basePrintPrice: readNumber(value.base_print_price),
  };
}

function formatSliceStatus(quote: SliceQuoteState) {
  switch (quote.status) {
    case "calculating":
      return "正在计算";
    case "success":
      return "已完成";
    case "failed":
      return "计算失败，需人工确认";
    case "manual":
      return "需人工确认";
    case "waiting":
    default:
      return "等待计算";
  }
}

function getSliceProgressPhase(progress: number) {
  if (progress <= 0) {
    return "等待上传完成";
  }

  if (progress <= 10) {
    return "文件已上传";
  }

  if (progress <= 25) {
    return "正在准备切片任务";
  }

  if (progress < 70) {
    return "正在调用 PrusaSlicer";
  }

  if (progress < 90) {
    return "正在解析 G-code";
  }

  if (progress < 100) {
    return "正在计算价格";
  }

  return "报价完成";
}

function getSliceFailureReason(result: { message?: string; error?: string }) {
  const text = `${result.message || ""} ${result.error || ""}`;

  if (/timeout|timed out|超时/i.test(text)) {
    return "切片超时";
  }

  if (/Unauthorized|请先登录|401/i.test(text)) {
    return "请先登录后使用自动报价";
  }

  if (/disabled|未启用/i.test(text)) {
    return "本地未启用切片，需人工确认";
  }

  if (/not found|not installed|ENOENT|spawn|command not found|未安装/i.test(text)) {
    return "计算失败，需人工确认";
  }

  if (/profile|配置/i.test(text)) {
    return "切片配置缺失";
  }

  if (/save|upload|write|保存/i.test(text)) {
    return "文件未保存成功";
  }

  if (/Only STL|format|格式|unsupported|support automatic slicing/i.test(text)) {
    return "文件格式暂不支持";
  }

  if (/busy|繁忙|queue/i.test(text)) {
    return "服务器繁忙";
  }

  if (result.message && result.message !== "计算失败，需人工确认") {
    return result.message;
  }

  return "需人工确认";
}

function formatMoney(value: number) {
  return `${value.toFixed(2)} 元`;
}

function calculateLeadTimeHours(printTimeSecondsList: number[]) {
  const printHours = printTimeSecondsList
    .filter((seconds) => Number.isFinite(seconds) && seconds > 0)
    .map((seconds) => seconds / 3600);

  if (printHours.length === 0) {
    return 24;
  }

  const longestPrintHours = Math.max(...printHours);
  const remainingPrintHours = printHours.reduce((total, hours) => total + hours, 0) - longestPrintHours;
  const sharedRemainingHours = printHours.length > 1 ? remainingPrintHours / 6 : 0;

  return Math.ceil(longestPrintHours + sharedRemainingHours + 24);
}

function getShippingFee(method: string) {
  switch (method) {
    case "顺丰快递":
      return { label: "18.00 元", amount: 18, includedInAutoPrice: true };
    case "西安本地跑腿":
      return { label: "人工确认", amount: 0, includedInAutoPrice: false };
    case "普通快递":
    default:
      return { label: "10.00 元", amount: 10, includedInAutoPrice: true };
  }
}

function isStlFile(filename: string | null | undefined) {
  return filename?.toLowerCase().endsWith(".stl") || false;
}

function formatNullableNumber(value: number | null | undefined) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function readNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function readNullableNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getMaterialRate(material: string) {
  switch (material.toUpperCase()) {
    case "PETG":
      return 0.2;
    case "ABS":
      return 0.35;
    case "PLA":
    default:
      return 0.25;
  }
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}
