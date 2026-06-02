import { QuoteForm } from "@/frontend/components/QuoteForm";
import { ContactSection } from "@/frontend/components/ContactSection";

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
            上传模型并填写联系与收货信息，系统会保存订单和模型文件，提交后由人工确认最终报价与生产安排。
          </p>
          <div className="mt-8 space-y-4">
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">支持格式</h2>
              <p className="mt-3 text-graphite">{supportedFormats.join(" / ")}</p>
              <p className="mt-2 text-sm text-graphite">单文件最大 50MB</p>
            </div>
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">FDM 工艺说明</h2>
              <p className="mt-3 text-graphite">
                FDM 是通过热熔材料逐层堆叠成型的3D打印工艺，适合结构验证、外壳打样、毕业设计、小批量试制。
              </p>
            </div>
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">基础打印标准</h2>
              <p className="mt-3 text-graphite">
                默认按 0.4mm 喷嘴、0.2mm 层高、50% 填充进行预估。
              </p>
              <p className="mt-3 text-sm leading-6 text-graphite">
                如需特殊层高、强度、表面效果、支撑方式、分件打印等，请在备注中说明，最终由人工确认。
              </p>
            </div>
          </div>
        </div>

        <QuoteForm />
      </section>
      <ContactSection />
    </main>
  );
}
