"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createQuoteFileId,
  estimateDisplayDimensions,
  estimateFiles,
  estimateOrderSummary,
  formatBytes,
  formatDimensions,
  formatLeadTimeRange,
  formatOptionSummary,
  formatPrice,
  safeFileSize,
  type QuoteDimensions,
  type SelectedQuoteFile,
} from "@/frontend/lib/quote-estimates";

const materials = ["PLA", "PETG", "ABS"];
const colors = ["黑", "白", "红", "蓝"];
const shippingMethods = ["普通快递", "顺丰快递", "西安本地跑腿", "到店自取"];
const allowedExtensions = [".stl", ".step", ".stp", ".3mf"];
const MAX_FILE_COUNT = 5;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const customerNamePattern = "(?:[\\u4e00-\\u9fa5]{2,}|[A-Za-z][A-Za-z\\s'-]{3,})";

type SelectedModelFile = SelectedQuoteFile & {
  file: File;
};

export function QuoteForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedModelFile[]>([]);
  const [shippingMethod, setShippingMethod] = useState("普通快递");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileEstimates = useMemo(() => estimateFiles(files), [files]);
  const orderSummary = useMemo(
    () => estimateOrderSummary(fileEstimates, shippingMethod),
    [fileEstimates, shippingMethod],
  );

  function addFiles(nextFiles: FileList | File[]) {
    setError("");
    const incomingFiles = Array.from(nextFiles);

    if (files.length + incomingFiles.length > MAX_FILE_COUNT) {
      setError("一次最多上传 5 个模型文件");
      return;
    }

    const invalidFile = incomingFiles.find((file) => !isAllowedFile(file));

    if (invalidFile) {
      setError("仅支持 .stl / .step / .stp / .3mf，单文件最大 50MB");
      return;
    }

    setFiles((currentFiles) => [
      ...currentFiles,
      ...incomingFiles.map((file) => ({
        id: createQuoteFileId(file),
        file,
        material: "PLA",
        color: "黑",
      })),
    ]);
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    addFiles(event.dataTransfer.files);
  }

  function updateFileOption(id: string, option: "material" | "color", value: string) {
    setFiles((currentFiles) =>
      currentFiles.map((item) => (item.id === id ? { ...item, [option]: value } : item)),
    );
  }

  function removeFile(id: string) {
    setFiles((currentFiles) => currentFiles.filter((item) => item.id !== id));
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (files.length === 0) {
      setError("请先上传模型文件");
      return;
    }

    setIsSubmitting(true);

    try {
      const formData = new FormData(event.currentTarget);
      formData.delete("modelFiles");
      formData.delete("fileMaterials");
      formData.delete("fileColors");
      formData.delete("fileDimensionX");
      formData.delete("fileDimensionY");
      formData.delete("fileDimensionZ");
      formData.set("recipientName", getRequiredFormValue(formData, "customerName"));
      formData.set("recipientPhone", getRequiredFormValue(formData, "phone"));
      formData.set("addressRegion", "-");
      formData.set("shippingRemark", "");

      for (const item of files) {
        const dimensions = estimateDisplayDimensions(item.file);

        formData.append("modelFiles", item.file);
        formData.append("fileMaterials", item.material);
        formData.append("fileColors", item.color);
        formData.append("fileDimensionX", formatDimensionFormValue(dimensions?.x));
        formData.append("fileDimensionY", formatDimensionFormValue(dimensions?.y));
        formData.append("fileDimensionZ", formatDimensionFormValue(dimensions?.z));
      }

      const response = await fetch("/api/orders", {
        method: "POST",
        body: formData,
      });
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || "提交失败，请稍后再试");
      }

      router.push("/success");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "提交失败，请稍后再试");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      className="space-y-6 border border-ink/10 bg-white/75 p-6 shadow-sm"
      onSubmit={handleSubmit}
    >
      <section>
        <div
          className="flex min-h-56 flex-col items-center justify-center border border-dashed border-ink/25 bg-white/70 px-6 py-10 text-center"
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
        >
          <p className="text-lg font-bold">拖拽模型文件到这里</p>
          <p className="mt-3 max-w-md text-sm leading-6 text-graphite">
            支持 .stl / .step / .stp / .3mf，最多一次上传 5 个文件，单文件最大 50MB。
          </p>
        </div>
        <input
          accept={allowedExtensions.join(",")}
          className="sr-only"
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
          onClick={() => fileInputRef.current?.click()}
          type="button"
        >
          选择文件
        </button>
      </section>

      {fileEstimates.length > 0 ? (
        <section className="space-y-3">
          {fileEstimates.map(({ item, dimensions, estimate }) => (
            <article className="border border-ink/10 bg-white/80 p-4" key={item.id}>
              <input
                name="fileDimensionX"
                type="hidden"
                value={formatDimensionFormValue(dimensions?.x)}
              />
              <input
                name="fileDimensionY"
                type="hidden"
                value={formatDimensionFormValue(dimensions?.y)}
              />
              <input
                name="fileDimensionZ"
                type="hidden"
                value={formatDimensionFormValue(dimensions?.z)}
              />
              <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                <div>
                  <div className="flex aspect-square items-center justify-center border border-ink/10 bg-ash text-xs font-semibold uppercase tracking-[0.16em] text-graphite">
                    占位缩略图
                  </div>
                  <p className="mt-2 text-xs leading-5 text-graphite">
                    {formatDimensions(dimensions)}
                  </p>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold">{item.file.name || "未命名模型文件"}</p>
                      <p className="mt-1 text-sm text-graphite">
                        {formatBytes(item.file.size)} · {getFileType(item.file.name)}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        预估价格：{formatPrice(estimate.priceMax)}
                      </p>
                      <p className="mt-1 text-sm text-graphite">
                        预估工期：
                        {formatLeadTimeRange(
                          estimate.leadTimeMinHours,
                          estimate.leadTimeMaxHours,
                        )}
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
                        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
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
                        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
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
                  </div>
                </div>
              </div>
            </article>
          ))}
        </section>
      ) : null}

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">联系与收货信息</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="name"
            label="姓名"
            name="customerName"
            pattern={customerNamePattern}
            required
            title="姓名必填：至少2个汉字，或至少4个英文字母"
          />
          <TextField
            autoComplete="tel"
            inputMode="tel"
            label="手机号"
            name="phone"
            pattern="1[3-9]\\d{9}"
            required
            title="必须填写11位中国大陆手机号"
            type="tel"
          />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField
            autoComplete="off"
            helpText="微信很重要，请填写常用微信，方便确认报价和生产细节。"
            label="微信"
            name="wechat"
            required
          />
          <TextField autoComplete="email" label="邮箱" name="email" type="email" />
        </div>

        <label className="mt-4 block text-sm font-semibold" htmlFor="shippingMethod">
          配送方式
          <select
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
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
            className="mt-2 min-h-24 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="addressDetail"
            placeholder="填写省市区、详细地址、收件说明等"
            required
          />
        </label>

        <label className="mt-4 block text-sm font-semibold">
          备注
          <textarea
            className="mt-2 min-h-28 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="remark"
            placeholder="补充特殊层高、强度、表面效果、支撑方式、分件打印、加急等要求"
          />
        </label>
      </section>

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">订单汇总</h2>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryItem label="文件数量" value={`${files.length} 个`} />
          <SummaryItem label="运费" value={orderSummary.shippingFeeEstimate} />
          <SummaryItem
            label="预估总价"
            value={formatPrice(orderSummary.priceMax)}
          />
          <SummaryItem
            label="预估总货期"
            value={formatLeadTimeRange(
              orderSummary.leadTimeMinHours,
              orderSummary.leadTimeMaxHours,
            )}
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
        disabled={isSubmitting}
        type="submit"
      >
        {isSubmitting ? "提交中..." : "提交订单"}
      </button>
    </form>
  );
}

function TextField({
  autoComplete,
  helpText,
  inputMode,
  label,
  name,
  pattern,
  required,
  title,
  type = "text",
}: {
  autoComplete?: string;
  helpText?: string;
  inputMode?: "email" | "numeric" | "search" | "tel" | "text" | "url";
  label: string;
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
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
        inputMode={inputMode}
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

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white/80 px-4 py-3">
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd className="mt-1 font-semibold text-ink">{value}</dd>
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
