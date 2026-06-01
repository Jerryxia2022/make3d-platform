import { QuoteForm } from "@/frontend/components/QuoteForm";

const materials = [
  { name: "PLA", price: "0.15元/克" },
  { name: "PETG", price: "0.25元/克" },
  { name: "ABS", price: "0.30元/克" },
];

const supportedFormats = ["STL", "3MF", "STEP", "STP"];

export default function QuotePage() {
  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto grid w-full max-w-6xl gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
            上传模型获取报价
          </p>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">打印报价</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-graphite">
            上传模型并填写联系方式，系统会保存订单和模型文件，提交后进入成功页面。
          </p>
          <div className="mt-8 space-y-4">
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">支持格式</h2>
              <p className="mt-3 text-graphite">{supportedFormats.join(" / ")}</p>
              <p className="mt-2 text-sm text-graphite">单文件最大 50MB</p>
            </div>
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">报价说明</h2>
              <p className="mt-3 text-graphite">
                价格 = 材料费 + 设备费 + 人工费，最低消费 20 元，人工处理费 10 元。
              </p>
              <p className="mt-3 text-sm text-graphite">
                {materials.map((material) => `${material.name} ${material.price}`).join(" / ")}
              </p>
              <p className="mt-3 font-semibold text-coral">
                此价格为系统预估，最终价格以人工确认为准。
              </p>
            </div>
          </div>
        </div>

        <QuoteForm />
      </section>
    </main>
  );
}
