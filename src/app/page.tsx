import Link from "next/link";
import { ContactSection } from "@/frontend/components/ContactSection";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

const capabilityItems = [
  { label: "标准打印", value: "STL 自动报价" },
  { label: "模型处理", value: "改尺寸 / 拆件 / 加孔" },
  { label: "研发咨询", value: "结构 / 电路 / 样机" },
];

const serviceCards = [
  {
    button: "立即上传报价",
    description: "已有 STL 模型，直接上传，系统自动报价并下单。",
    href: "/quote",
    label: "标准3D打印",
    meta: "在线自动报价",
    title: "上传模型自动报价",
  },
  {
    button: "提交修改需求",
    description: "已有模型但需要改尺寸、改结构、拆件、加孔、加厚、优化打印等。",
    href: "/request/design",
    label: "模型修改与打印",
    meta: "人工评估后报价",
    title: "模型修改与打印",
  },
  {
    button: "提交研发需求",
    description: "需要机械结构设计、外壳设计、PCB、电路、程序、样机制作、小型工装夹具等。",
    href: "/request/development",
    label: "工装夹具/研发咨询",
    meta: "复杂项目人工评估",
    title: "工装夹具 / 研发咨询",
  },
];

const process = ["上传/提交需求", "自动报价或人工评估", "确认付款", "生产交付"];
const scenarios = ["毕业设计", "工业结构件", "改装零件", "工装夹具", "外壳样机", "小批量试产"];
const faqs = [
  { q: "自动报价是否等于最终价格？", a: "标准打印订单可在线自动报价，最终价格仍以人工确认为准。" },
  { q: "模型修改多久反馈？", a: "通常 24 小时内评估，复杂项目建议提供图纸、样品或关键尺寸。" },
  { q: "研发类需求怎么报价？", a: "研发类需求需人工评估后报价，工作日晚上和周末优先处理复杂沟通。" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-ink">
      <section className="px-4 py-5 sm:px-6 lg:px-8">
        <CustomerAuthBar />
        <div className="mx-auto grid w-full max-w-7xl items-center gap-6 py-8 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="eyebrow">
              Make3D Manufacturing Service
            </p>
            <h1 className="mt-4 max-w-3xl text-3xl font-bold leading-[1.12] sm:text-4xl lg:text-[42px]">
              从模型上传到样机交付，Make3D 提供快速 3D 打印、模型修改和小型研发制造服务。
            </h1>
            <p className="mt-5 max-w-2xl text-base leading-7 text-graphite">
              标准打印可在线自动报价；模型修改、工装夹具和研发类需求由人工评估后报价，适合结构验证、外壳样机和小批量试产。
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link className="btn-primary px-5 py-3" href="/quote">
                上传模型报价
              </Link>
              <Link className="btn-secondary px-5 py-3" href="/request/development">
                提交研发需求
              </Link>
            </div>
          </div>

          <div className="surface-card p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              {capabilityItems.map((item) => (
                <Metric key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
            <div className="surface-soft mt-5 p-5">
              <p className="text-sm font-semibold text-coral">需求分流</p>
              <div className="mt-4 grid gap-3">
                {serviceCards.map((service, index) => (
                  <div className="grid grid-cols-[2.5rem_1fr] items-center gap-3" key={service.href}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-md border border-ink/10 bg-white text-sm font-bold shadow-sm">
                      0{index + 1}
                    </span>
                    <div>
                      <p className="font-bold">{service.label}</p>
                      <p className="text-sm text-graphite">{service.meta}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-band px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Service Intake" title="选择你的需求类型" />
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            {serviceCards.map((service, index) => (
              <article className="surface-card hover-lift flex min-h-56 flex-col p-5" key={service.href}>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold text-coral">{service.meta}</p>
                  {index === 0 ? (
                    <span className="status-pill status-orange">最快</span>
                  ) : null}
                </div>
                <h2 className="mt-3 text-2xl font-bold">{service.title}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-graphite">{service.description}</p>
                <Link className={index === 0 ? "btn-primary mt-5" : "btn-secondary mt-5"} href={service.href}>
                  {service.button}
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Workflow" title="服务流程" />
          <div className="mt-6 grid gap-3 md:grid-cols-4">
            {process.map((step, index) => (
              <div className="surface-card p-4" key={step}>
                <p className="text-sm font-bold text-coral">0{index + 1}</p>
                <p className="mt-2 font-bold">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-band px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-7xl gap-6 lg:grid-cols-[280px_1fr]">
          <SectionTitle eyebrow="Use Cases" title="常见适用场景" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {scenarios.map((scenario) => (
              <div className="surface-card px-4 py-3 font-semibold" key={scenario}>
                {scenario}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="FAQ" title="常见问题" />
          <div className="mt-5 grid gap-3 lg:grid-cols-3">
            {faqs.map((item) => (
              <details className="surface-card p-4" key={item.q}>
                <summary className="cursor-pointer font-bold">{item.q}</summary>
                <p className="mt-3 text-sm leading-6 text-graphite">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <div className="px-4 pb-10 sm:px-6 lg:px-8">
        <ContactSection />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-3">
      <p className="text-xs font-semibold text-graphite">{label}</p>
      <p className="mt-1 text-sm font-bold">{value}</p>
    </div>
  );
}

function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-bold">{title}</h2>
    </div>
  );
}
