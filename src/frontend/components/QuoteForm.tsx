"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const materials = ["PLA", "PETG", "ABS"];
const colors = ["黑", "白", "红", "蓝"];
const shippingMethods = ["普通快递", "顺丰快递", "西安本地跑腿", "到店自取"];
const allowedExtensions = [".stl", ".step", ".stp", ".3mf"];
const MAX_FILE_COUNT = 5;
const MAX_FILE_BYTES = 50 * 1024 * 1024;
const MB = 1024 * 1024;
const MANUAL_ORDER_FEE = 10;

type SelectedModelFile = {
  id: string;
  file: File;
  material: string;
  color: string;
};

export function QuoteForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<SelectedModelFile[]>([]);
  const [shippingMethod, setShippingMethod] = useState("普通快递");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const orderSummary = useMemo(
    () => estimateOrderSummary(files, shippingMethod),
    [files, shippingMethod],
  );
  const shippingFeeEstimate = orderSummary.shippingFeeEstimate;

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
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
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

      for (const item of files) {
        formData.append("modelFiles", item.file);
        formData.append("fileMaterials", item.material);
        formData.append("fileColors", item.color);
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

      {files.length > 0 ? (
        <section className="space-y-3">
          {files.map((item) => {
            const estimate = estimateFileBySize(item.file.size, item.material);

            return (
              <article className="border border-ink/10 bg-white/80 p-4" key={item.id}>
                <div className="grid gap-4 sm:grid-cols-[8rem_1fr]">
                  <div className="flex aspect-square items-center justify-center border border-ink/10 bg-ash text-xs font-semibold uppercase tracking-[0.16em] text-graphite">
                    占位缩略图
                  </div>
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold">{item.file.name}</p>
                        <p className="mt-1 text-sm text-graphite">
                          {formatBytes(item.file.size)} · {getFileType(item.file.name)}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-ink">
                          预估价格：{formatPriceRange(estimate.priceMin, estimate.priceMax)}
                        </p>
                        <p className="mt-1 text-sm text-graphite">
                          预估打印时间：
                          {formatLeadTimeRange(
                            estimate.leadTimeMinHours,
                            estimate.leadTimeMaxHours,
                          )}
                        </p>
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
                          onChange={(event) =>
                            updateFileOption(item.id, "color", event.target.value)
                          }
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
            );
          })}
        </section>
      ) : null}

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">订单汇总</h2>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <SummaryItem label="文件数量" value={`${files.length} 个`} />
          <SummaryItem
            label="预估总价区间"
            value={formatPriceRange(orderSummary.priceMin, orderSummary.priceMax)}
          />
          <SummaryItem
            label="预估总工期区间"
            value={formatLeadTimeRange(
              orderSummary.leadTimeMinHours,
              orderSummary.leadTimeMaxHours,
            )}
          />
          <SummaryItem label="材料和颜色摘要" value={formatOptionSummary(files)} />
        </dl>
        <p className="mt-4 text-sm font-semibold text-coral">
          此价格为系统预估，最终价格以人工确认为准。
        </p>
      </section>

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">配送方式</h2>
        <label className="mt-4 block text-sm font-semibold" htmlFor="shippingMethod">
          选择配送方式
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
        <p className="mt-3 text-sm text-graphite">运费估算：{shippingFeeEstimate}</p>
        <p className="mt-2 text-sm font-semibold text-coral">
          运费为预估，最终以实际发货为准。
        </p>
      </section>

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">收货地址</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField autoComplete="name" label="收件人" name="recipientName" required />
          <TextField autoComplete="tel" label="手机号" name="recipientPhone" required type="tel" />
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField label="省市区" name="addressRegion" required />
          <TextField label="详细地址" name="addressDetail" required />
        </div>
        <label className="mt-4 block text-sm font-semibold">
          配送备注
          <textarea
            className="mt-2 min-h-24 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="shippingRemark"
            placeholder="补充配送时间、门牌号、取件说明等"
          />
        </label>
      </section>

      <section className="border border-ink/10 bg-white/70 p-5">
        <h2 className="text-lg font-bold">联系方式</h2>
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <TextField autoComplete="name" label="姓名" name="customerName" required />
          <TextField autoComplete="tel" label="电话" name="phone" required type="tel" />
        </div>

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <TextField autoComplete="off" label="微信" name="wechat" required />
          <TextField autoComplete="email" label="邮箱" name="email" type="email" />
        </div>

        <label className="mt-4 block text-sm font-semibold">
          备注
          <textarea
            className="mt-2 min-h-28 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="remark"
            placeholder="补充尺寸、强度、交期等要求"
          />
        </label>
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
  label,
  name,
  required,
  type = "text",
}: {
  autoComplete?: string;
  label: string;
  name: string;
  required?: boolean;
  type?: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        autoComplete={autoComplete}
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
        name={name}
        required={required}
        type={type}
      />
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

function estimateFileBySize(filesize: number, material: string) {
  const bucket =
    filesize < 5 * MB
      ? { priceMin: 20, priceMax: 50, leadTimeMinHours: 4, leadTimeMaxHours: 8 }
      : filesize < 20 * MB
        ? { priceMin: 50, priceMax: 120, leadTimeMinHours: 8, leadTimeMaxHours: 24 }
        : { priceMin: 120, priceMax: 300, leadTimeMinHours: 24, leadTimeMaxHours: 48 };

  return { ...bucket, materialRate: getMaterialRate(material) };
}

function estimateOrderSummary(files: SelectedModelFile[], shippingMethod: string) {
  const estimates = files.map((item) => estimateFileBySize(item.file.size, item.material));

  return {
    priceMin: estimates.reduce((total, estimate) => total + estimate.priceMin, MANUAL_ORDER_FEE),
    priceMax: estimates.reduce((total, estimate) => total + estimate.priceMax, MANUAL_ORDER_FEE),
    leadTimeMinHours: estimates.reduce(
      (total, estimate) => total + estimate.leadTimeMinHours,
      0,
    ),
    leadTimeMaxHours: estimates.reduce(
      (total, estimate) => total + estimate.leadTimeMaxHours,
      0,
    ),
    shippingFeeEstimate: getShippingEstimate(shippingMethod),
  };
}

function getShippingEstimate(method: string) {
  switch (method) {
    case "顺丰快递":
      return "18 元起";
    case "西安本地跑腿":
      return "需人工确认";
    case "到店自取":
      return "0 元";
    case "普通快递":
    default:
      return "10 元起";
  }
}

function getMaterialRate(material: string) {
  switch (material) {
    case "PETG":
      return 0.25;
    case "ABS":
      return 0.3;
    case "PLA":
    default:
      return 0.15;
  }
}

function formatOptionSummary(files: SelectedModelFile[]) {
  if (files.length === 0) {
    return "-";
  }

  return files.map((item) => `${item.material}/${item.color}`).join("，");
}

function isAllowedFile(file: File) {
  const fileName = file.name.toLowerCase();
  return (
    allowedExtensions.some((extension) => fileName.endsWith(extension)) &&
    file.size <= MAX_FILE_BYTES
  );
}

function getFileType(filename: string) {
  return filename.split(".").pop()?.toUpperCase() || "UNKNOWN";
}

function formatPriceRange(min: number, max: number) {
  return `${min}-${max} 元`;
}

function formatLeadTimeRange(min: number, max: number) {
  return min === 0 && max === 0 ? "-" : `${min}-${max} 小时`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
