import Link from "next/link";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { ServiceRequestForm } from "@/frontend/components/ServiceRequestForm";

const fitItems = ["已有 STL/STEP/STP 模型需要改尺寸", "需要拆件、加孔、加厚或优化打印方向", "模型能打开，但打印前需要结构确认"];
const unfitItems = ["完整新产品研发", "没有任何尺寸或目标说明的开放需求", "需要量产模具或大批量生产"];

export default async function DesignRequestPage() {
  const customer = await getCurrentCustomer();
  const formCustomer = customer
    ? {
        name: customer.name,
        phone: customer.phone,
        wechat: customer.wechat,
        email: customer.email,
      }
    : null;

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <CustomerAuthBar returnTo="/request/design" />
      <section className="mx-auto grid w-full max-w-7xl gap-6 py-8 lg:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Link className="text-sm font-semibold text-graphite" href="/">
            返回首页
          </Link>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-coral">
            模型修改与打印
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight">提交模型修改需求</h1>
          <p className="mt-4 text-base leading-7 text-graphite">
            已有模型但需要改尺寸、改结构、拆件、加孔、加厚或优化打印，可先提交资料，由人工评估后报价。
          </p>

          <GuideBlock title="适合什么需求" items={fitItems} />
          <GuideBlock title="不适合什么需求" items={unfitItems} />

          <div className="mt-5 border border-ink/10 bg-white/80 p-4 text-sm leading-6 text-graphite">
            <p className="font-semibold text-ink">响应时间</p>
            <p className="mt-2">通常 24 小时内评估。复杂项目建议提供图纸、样品或关键尺寸。</p>
            <p className="mt-2">工作日晚上和周末优先处理复杂沟通。</p>
          </div>
        </aside>

        <section>
          <div className="mb-4 border border-ink/10 bg-white/80 px-4 py-3 text-sm leading-6 text-graphite">
            标准打印订单可在线自动报价；涉及模型修改的需求会先人工评估，再确认费用和交付方式。
          </div>
          <ServiceRequestForm customer={formCustomer} disabled={!customer} mode="design" />
        </section>
      </section>
    </main>
  );
}

function GuideBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="mt-5 border border-ink/10 bg-white/80 p-4">
      <h2 className="font-bold">{title}</h2>
      <ul className="mt-3 space-y-2 text-sm leading-6 text-graphite">
        {items.map((item) => (
          <li className="border-l-2 border-coral/50 pl-3" key={item}>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
