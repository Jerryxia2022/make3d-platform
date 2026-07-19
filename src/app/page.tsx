import Image from "next/image";
import Link from "next/link";

import { ContactSection } from "@/frontend/components/ContactSection";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

const secondaryServices = [
  {
    button: "提交修改需求",
    description: "已有模型但需要改尺寸、改结构、拆件、加孔、加厚或优化打印时，由工程人员评估。",
    href: "/request/design",
    meta: "人工评估后报价",
    title: "模型修改与打印",
  },
  {
    button: "提交研发需求",
    description: "机械结构、外壳、PCB、电路、程序、样机和小型工装夹具等复杂项目单独评估。",
    href: "/request/development",
    meta: "复杂项目人工评估",
    title: "工装夹具 / 研发咨询",
  },
];

const process = ["上传或提交需求", "自动报价或人工评估", "确认付款", "生产交付"];
const scenarios = ["毕业设计", "工业结构件", "改装零件", "工装夹具", "外壳样机", "小批量试产"];
const faqs = [
  { q: "自动报价是否等于最终价格？", a: "标准打印订单可在线自动报价，最终价格仍以人工确认为准。" },
  { q: "STEP / STP 可以报价吗？", a: "系统先校验并生成独立预览网格；不满足自动规则的模型转人工确认。" },
  { q: "模型修改多久反馈？", a: "通常 24 小时内评估，复杂项目建议提供图纸、样品或关键尺寸。" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] text-ink">
      <section className="border-b border-ink/10 bg-white px-4 py-4 sm:px-6 lg:px-8">
        <CustomerAuthBar />
        <div className="mx-auto flex w-full max-w-7xl items-center gap-4 py-5">
          <Image
            alt="Make3D"
            className="h-12 w-auto"
            height={64}
            priority
            src="/brand/make3d-logo-horizontal-transparent.png"
            width={240}
          />
          <span className="hidden border-l border-ink/15 pl-4 text-sm font-semibold text-graphite sm:block">
            西安本地 FDM 3D 打印与小批量制造
          </span>
        </div>
      </section>

      <section className="px-4 pb-8 pt-6 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-7xl">
          <div className="mb-5 max-w-4xl">
            <p className="eyebrow">Online FDM Quote</p>
            <h1 className="mt-3 text-3xl font-bold leading-tight sm:text-4xl">
              Make3D 在线 FDM 3D 打印报价
            </h1>
            <p className="mt-3 max-w-3xl text-base leading-7 text-graphite">
              上传模型后完成格式校验、3D 预览、切片与价格计算。标准模型自动报价，超出规则或需要模型处理时转人工确认。
            </p>
          </div>

          <div className="overflow-hidden rounded-md border border-[#0f2742] bg-white shadow-[0_18px_40px_-30px_rgba(15,39,66,0.7)]">
            <div className="grid lg:grid-cols-[minmax(0,1.45fr)_minmax(20rem,0.55fr)]">
              <div className="border-b border-ink/10 p-5 sm:p-7 lg:border-b-0 lg:border-r">
                <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-bold text-coral">标准打印自动报价</p>
                    <h2 className="mt-2 text-2xl font-bold">选择模型，进入报价工作台</h2>
                    <p className="mt-2 text-sm leading-6 text-graphite">
                      支持 STL、STEP、STP，单文件最大 50 MB，最多 5 个文件。
                    </p>
                  </div>
                  <Link className="btn-primary min-h-12 shrink-0 px-6 text-base" href="/quote">
                    上传模型报价
                  </Link>
                </div>

                <div className="mt-6 grid gap-px overflow-hidden rounded-md border border-ink/10 bg-ink/10 sm:grid-cols-3">
                  <QuoteFact label="支持格式" value="STL / STEP / STP" />
                  <QuoteFact label="可选材料" value="PLA / PETG / ABS" />
                  <QuoteFact label="自动报价尺寸" value="各方向 10–300 mm" />
                </div>

                <ol className="mt-6 grid gap-3 text-sm sm:grid-cols-3">
                  {[
                    ["01", "上传并预览", "检查格式、文件内容与模型尺寸"],
                    ["02", "切片计算", "计算工时、耗材和制造风险"],
                    ["03", "确认下单", "选择颜色、数量、配送与发票"],
                  ].map(([number, title, detail]) => (
                    <li className="grid grid-cols-[2rem_1fr] gap-2" key={number}>
                      <span className="font-bold text-coral">{number}</span>
                      <span>
                        <strong className="block text-ink">{title}</strong>
                        <span className="mt-1 block leading-5 text-graphite">{detail}</span>
                      </span>
                    </li>
                  ))}
                </ol>
              </div>

              <div className="bg-[#0f2742] p-5 text-white sm:p-7">
                <p className="text-sm font-bold text-[#fb923c]">自动与人工分流</p>
                <h2 className="mt-2 text-xl font-bold">不是所有模型都强行自动报价</h2>
                <ul className="mt-5 space-y-4 text-sm leading-6 text-white/80">
                  <li>尺寸边界包含 10 mm 和 300 mm；超出后转人工确认。</li>
                  <li>STEP/STP 先生成独立预览网格，原始 CAD 文件保持不变。</li>
                  <li>多实体、网格异常或需要拆件、加孔、改尺寸时由人工评估。</li>
                </ul>
                <Link className="mt-6 inline-flex font-bold text-[#fb923c]" href="/legal/fdm-service">
                  查看 FDM 工艺标准
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section-band px-4 py-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Other Services" title="需要先处理模型或研发设计" />
          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            {secondaryServices.map((service) => (
              <article className="surface-card flex min-h-44 flex-col p-5" key={service.href}>
                <p className="text-sm font-semibold text-coral">{service.meta}</p>
                <h2 className="mt-3 text-xl font-bold">{service.title}</h2>
                <p className="mt-3 flex-1 text-sm leading-6 text-graphite">{service.description}</p>
                <Link className="btn-secondary mt-5 w-fit" href={service.href}>{service.button}</Link>
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
              <div className="surface-card px-4 py-3 font-semibold" key={scenario}>{scenario}</div>
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

      <div className="px-4 pb-10 sm:px-6 lg:px-8"><ContactSection /></div>
    </main>
  );
}

function QuoteFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white p-4">
      <p className="text-xs font-semibold text-graphite">{label}</p>
      <p className="mt-1 text-sm font-bold text-ink">{value}</p>
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
