"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const materials = [
  { name: "PLA", price: "0.15元/克" },
  { name: "PETG", price: "0.25元/克" },
  { name: "ABS", price: "0.30元/克" },
];

export function QuoteForm() {
  const router = useRouter();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        body: new FormData(event.currentTarget),
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
      <div>
        <label className="block text-sm font-semibold" htmlFor="modelFile">
          模型文件
        </label>
        <input
          accept=".stl,.step,.stp,.3mf"
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm"
          id="modelFile"
          name="modelFile"
          required
          type="file"
        />
        <p className="mt-2 text-xs text-graphite">支持 STL、STEP、STP、3MF，最大 50MB。</p>
      </div>

      <div>
        <label className="block text-sm font-semibold" htmlFor="material">
          材料
        </label>
        <select
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-3"
          defaultValue="PLA"
          id="material"
          name="material"
        >
          {materials.map((material) => (
            <option key={material.name} value={material.name}>
              {material.name} - {material.price}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          颜色
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="color"
            placeholder="例如：白色"
          />
        </label>
        <label className="block text-sm font-semibold">
          数量
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            defaultValue={1}
            min={1}
            name="quantity"
            type="number"
          />
        </label>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          姓名
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="customerName"
            required
          />
        </label>
        <label className="block text-sm font-semibold">
          电话
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="phone"
            required
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        微信
        <input
          className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
          name="wechat"
          required
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold">
          邮箱
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="email"
            type="email"
          />
        </label>
        <label className="block text-sm font-semibold">
          公司名称
          <input
            className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
            name="company"
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        备注
        <textarea
          className="mt-2 min-h-28 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
          name="remark"
          placeholder="补充尺寸、强度、交期等要求"
        />
      </label>

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
