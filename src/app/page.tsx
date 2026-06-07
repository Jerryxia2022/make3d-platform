import Link from "next/link";
import { ContactSection } from "@/frontend/components/ContactSection";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

const advantages = [
  { title: "在线接单", text: "会员登录后上传 STL，系统先给出自动报价和预计交货期。" },
  { title: "人工复核", text: "复杂模型、支撑、拆件、后处理和加急需求由工作人员二次确认。" },
  { title: "生产闭环", text: "订单状态、最终报价、物流单号和管理员备注在用户中心持续同步。" },
];

const services = ["结构验证", "外壳打样", "毕业设计", "小批量试制", "夹具治具", "展示模型"];

const cases = [
  { title: "设备外壳打样", material: "PLA / PETG", note: "验证装配空间与外观比例" },
  { title: "毕业设计模型", material: "PLA", note: "多零件合并下单，按数量计价" },
  { title: "治具试制", material: "ABS / PETG", note: "强度、耐温和支撑方式人工确认" },
];

const process = ["上传模型", "自动报价", "人工确认", "排产打印", "发货或自取"];

const faqs = [
  { q: "自动报价是否等于最终价格？", a: "不是。自动报价用于快速参考，最终价格以人工确认为准。" },
  { q: "支持哪些文件？", a: "当前支持 STL、STEP、STP、3MF，其中 STL 可自动切片报价。" },
  { q: "多久可以交付？", a: "系统会按切片时间、6 台 P1S 并行能力和处理时间估算，复杂订单需人工确认。" },
];

export default function HomePage() {
  return (
    <main className="min-h-screen text-ink">
      <section className="bg-[linear-gradient(110deg,#f4fbf5_0%,#fbfaf6_58%,#ffffff_100%)] px-6 py-8">
        <CustomerAuthBar />
        <div className="mx-auto grid min-h-[640px] w-full max-w-7xl items-center gap-10 py-14 lg:grid-cols-[1.05fr_0.95fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
              Make3D Beta V1.0
            </p>
            <h1 className="mt-5 text-5xl font-bold leading-tight sm:text-7xl">
              在线3D打印接单系统
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-8 text-graphite">
              面向结构验证、外壳打样、毕业设计和小批量试制，提供上传模型、自动切片报价、人工确认和订单状态跟踪。
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="bg-ink px-6 py-3 text-base font-semibold text-white transition hover:bg-graphite"
                href="/quote"
              >
                上传模型获取报价
              </Link>
              <Link
                className="border border-ink/20 bg-white px-6 py-3 text-base font-semibold text-ink transition hover:border-ink"
                href="/account"
              >
                查看我的订单
              </Link>
            </div>
          </div>

          <div className="border border-ink/10 bg-white/85 p-6 shadow-sm">
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="设备" value="6 台 P1S" />
              <Metric label="喷嘴" value="0.4 mm" />
              <Metric label="预估标准" value="0.2 mm / 50%" />
            </div>
            <div className="mt-6 border border-dashed border-ink/20 p-6">
              <p className="text-sm font-semibold uppercase tracking-[0.16em] text-graphite">
                Instant Quote
              </p>
              <p className="mt-4 text-2xl font-bold">STL 自动切片报价</p>
              <p className="mt-3 leading-7 text-graphite">
                自动读取耗材重量和打印时间，结合材料费、工时费、包装费和配送方式生成订单参考价。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-7xl gap-6 md:grid-cols-3">
          {advantages.map((item) => (
            <InfoBlock key={item.title} title={item.title} text={item.text} />
          ))}
        </div>
      </section>

      <section className="border-y border-ink/10 bg-white px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Services" title="服务范围" />
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => (
              <div className="border border-ink/10 bg-ash/40 px-5 py-4 font-semibold" key={service}>
                {service}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Cases" title="案例展示" />
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {cases.map((item) => (
              <article className="border border-ink/10 bg-white p-5 shadow-sm" key={item.title}>
                <div className="flex h-28 items-center justify-center border border-ink/10 bg-ash text-sm font-semibold text-graphite">
                  3D Print Case
                </div>
                <h3 className="mt-4 text-xl font-bold">{item.title}</h3>
                <p className="mt-2 text-sm font-semibold text-coral">{item.material}</p>
                <p className="mt-3 text-sm leading-6 text-graphite">{item.note}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-ink px-6 py-16 text-white">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="Workflow" title="流程说明" inverted />
          <div className="mt-8 grid gap-3 md:grid-cols-5">
            {process.map((step, index) => (
              <div className="border border-white/20 p-5" key={step}>
                <p className="text-sm font-semibold text-coral">0{index + 1}</p>
                <p className="mt-3 font-bold">{step}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="mx-auto max-w-7xl">
          <SectionTitle eyebrow="FAQ" title="常见问题" />
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {faqs.map((item) => (
              <div className="border border-ink/10 bg-white p-5" key={item.q}>
                <h3 className="font-bold">{item.q}</h3>
                <p className="mt-3 text-sm leading-6 text-graphite">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div className="px-6 pb-16">
        <ContactSection />
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-graphite">{label}</p>
      <p className="mt-2 font-bold">{value}</p>
    </div>
  );
}

function InfoBlock({ title, text }: { title: string; text: string }) {
  return (
    <article className="border border-ink/10 bg-white p-6 shadow-sm">
      <h2 className="text-xl font-bold">{title}</h2>
      <p className="mt-3 leading-7 text-graphite">{text}</p>
    </article>
  );
}

function SectionTitle({
  eyebrow,
  title,
  inverted = false,
}: {
  eyebrow: string;
  title: string;
  inverted?: boolean;
}) {
  return (
    <div>
      <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">{eyebrow}</p>
      <h2 className={`mt-3 text-3xl font-bold ${inverted ? "text-white" : "text-ink"}`}>
        {title}
      </h2>
    </div>
  );
}
