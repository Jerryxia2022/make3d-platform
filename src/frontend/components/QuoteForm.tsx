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
const DEVICE_COUNT = 6;
const PACKAGING_FEE = 3;
const PACKAGING_TIME_HOURS = 2;
const ORDER_MIN_PRICE = 20;

type SelectedModelFile = {
  id: string;
  file: File;
  material: string;
  color: string;
  dimensions: {
    x: string;
    y: string;
    z: string;
  };
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
        dimensions: { x: "", y: "", z: "" },
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

  function updateFileDimension(id: string, axis: "x" | "y" | "z", value: string) {
    setFiles((currentFiles) =>
      currentFiles.map((item) =>
        item.id === id
          ? { ...item, dimensions: { ...item.dimensions, [axis]: value } }
          : item,
      ),
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
            const estimate = estimateFileBySize(
              item.file.size,
              item.material,
              parseDimensions(item.dimensions),
            );

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
                          预估价格区间：{formatPriceRange(estimate.priceMin, estimate.priceMax)}
                        </p>
                        <p className="mt-1 text-sm text-graphite">
                          预估工期：
                          {formatLeadTimeRange(
                            estimate.leadTimeMinHours,
                            estimate.leadTimeMaxHours,
                          )}
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

                    <div className="grid gap-3 sm:grid-cols-3">
                      <DimensionField
                        axis="x"
                        id={item.id}
                        label="X 尺寸 mm"
                        name="fileDimensionX"
                        onChange={updateFileDimension}
                        value={item.dimensions.x}
                      />
                      <DimensionField
                        axis="y"
                        id={item.id}
                        label="Y 尺寸 mm"
                        name="fileDimensionY"
                        onChange={updateFileDimension}
                        value={item.dimensions.y}
                      />
                      <DimensionField
                        axis="z"
                        id={item.id}
                        label="Z 尺寸 mm"
                        name="fileDimensionZ"
                        onChange={updateFileDimension}
                        value={item.dimensions.z}
                      />
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
          <SummaryItem label="包装费" value={`${PACKAGING_FEE} 元`} />
          <SummaryItem label="运费" value={shippingFeeEstimate} />
          <SummaryItem
            label="预估总价"
            value={formatPriceRange(orderSummary.priceMin, orderSummary.priceMax)}
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

function DimensionField({
  axis,
  id,
  label,
  name,
  onChange,
  value,
}: {
  axis: "x" | "y" | "z";
  id: string;
  label: string;
  name: string;
  onChange: (id: string, axis: "x" | "y" | "z", value: string) => void;
  value: string;
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
        min={0}
        name={name}
        onChange={(event) => onChange(id, axis, event.target.value)}
        placeholder="可选"
        type="number"
        value={value}
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

function estimateFileBySize(filesize: number, material: string, dimensions = {}) {
  const bucket = getSizeBucket(filesize);
  const risk = getDimensionRisk(dimensions);
  const salesRate = getMaterialSalesRate(material);
  const laborMin = Math.max(bucket.leadTimeMinHours * 1.5, 5);
  const laborMax = Math.max(bucket.leadTimeMaxHours * 1.5, 5);
  const riskMultiplier = (material === "ABS" ? 1.15 : 1) * risk.priceMultiplier;

  return {
    priceMin: Math.ceil((bucket.weightMinGrams * salesRate + laborMin) * riskMultiplier),
    priceMax: Math.ceil((bucket.weightMaxGrams * salesRate + laborMax) * riskMultiplier),
    leadTimeMinHours: bucket.leadTimeMinHours,
    leadTimeMaxHours: bucket.leadTimeMaxHours,
    riskNotice: risk.notice,
    riskLevel: risk.level,
  };
}

function estimateOrderSummary(files: SelectedModelFile[], shippingMethod: string) {
  const estimates = files.map((item) =>
    estimateFileBySize(item.file.size, item.material, parseDimensions(item.dimensions)),
  );
  const shipping = getShippingEstimate(shippingMethod);
  const shippingAmount = shipping.includedInAutoPrice ? shipping.amount || 0 : 0;
  const printMin = estimates.reduce((total, estimate) => total + estimate.leadTimeMinHours, 0);
  const printMax = estimates.reduce((total, estimate) => total + estimate.leadTimeMaxHours, 0);

  return {
    priceMin: Math.max(
      Math.ceil(
        estimates.reduce((total, estimate) => total + estimate.priceMin, 0) +
          PACKAGING_FEE +
          shippingAmount,
      ),
      ORDER_MIN_PRICE,
    ),
    priceMax: Math.max(
      Math.ceil(
        estimates.reduce((total, estimate) => total + estimate.priceMax, 0) +
          PACKAGING_FEE +
          shippingAmount,
      ),
      ORDER_MIN_PRICE,
    ),
    leadTimeMinHours: Math.ceil(printMin / DEVICE_COUNT + PACKAGING_TIME_HOURS),
    leadTimeMaxHours: Math.ceil(printMax / DEVICE_COUNT + PACKAGING_TIME_HOURS),
    shippingFeeEstimate: shipping.label,
  };
}

function getSizeBucket(filesize: number) {
  if (filesize < 5 * MB) {
    return { weightMinGrams: 65, weightMaxGrams: 169, leadTimeMinHours: 4, leadTimeMaxHours: 8 };
  }

  if (filesize < 20 * MB) {
    return { weightMinGrams: 35, weightMaxGrams: 250, leadTimeMinHours: 8, leadTimeMaxHours: 24 };
  }

  return { weightMinGrams: 300, weightMaxGrams: 700, leadTimeMinHours: 24, leadTimeMaxHours: 48 };
}

function getDimensionRisk(dimensions: { x?: number | null; y?: number | null; z?: number | null }) {
  const values = [dimensions.x, dimensions.y, dimensions.z].filter(
    (value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0,
  );

  if (values.some((value) => value > 256)) {
    return {
      notice: "模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。",
      level: "danger",
      priceMultiplier: 1.1,
    };
  }

  if (values.some((value) => value > 240)) {
    return {
      notice: "模型接近设备成型极限，可能需要调整摆放或拆件。",
      level: "warning",
      priceMultiplier: 1.1,
    };
  }

  if (values.some((value) => value < 10)) {
    return {
      notice: "模型尺寸较小，可能无法稳定打印，需要人工确认。",
      level: "warning",
      priceMultiplier: 1.15,
    };
  }

  return { notice: "", level: "none", priceMultiplier: 1 };
}

function getShippingEstimate(method: string) {
  switch (method) {
    case "顺丰快递":
      return { label: "18 元", amount: 18, includedInAutoPrice: true };
    case "西安本地跑腿":
      return { label: "人工确认", amount: null, includedInAutoPrice: false };
    case "到店自取":
      return { label: "0 元", amount: 0, includedInAutoPrice: true };
    case "普通快递":
    default:
      return { label: "10 元", amount: 10, includedInAutoPrice: true };
  }
}

function getMaterialSalesRate(material: string) {
  switch (material) {
    case "PETG":
      return 0.2;
    case "ABS":
      return 0.35;
    case "PLA":
    default:
      return 0.25;
  }
}

function parseDimensions(dimensions: SelectedModelFile["dimensions"]) {
  return {
    x: parsePositiveNumber(dimensions.x),
    y: parsePositiveNumber(dimensions.y),
    z: parsePositiveNumber(dimensions.z),
  };
}

function parsePositiveNumber(value: string) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
  return min === max ? `${min} 元` : `${min}-${max} 元`;
}

function formatLeadTimeRange(min: number, max: number) {
  return min === 0 && max === 0 ? "-" : `预计 ${min}-${max} 小时`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024 / 1024).toFixed(2)} MB`;
}
