import Link from "next/link";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { ServiceRequestForm } from "@/frontend/components/ServiceRequestForm";

const fitItems = ["小型工装夹具、治具和结构件方案", "外壳结构、PCB/电路、程序控制和样机制作", "已有样品或图纸，需要小批量前的研发验证"];
const unfitItems = ["缺少目标功能、尺寸或使用场景的空泛需求", "大型自动化产线或量产模具开发", "只需要标准 STL 打印的订单"];

export default async function DevelopmentRequestPage() {
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
      <CustomerAuthBar returnTo="/request/development" />
      <section className="mx-auto grid w-full max-w-7xl gap-6 py-8 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-8 lg:self-start">
          <Link className="text-sm font-semibold text-graphite" href="/">
            返回首页
          </Link>
          <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-coral">
            工装夹具 / 研发咨询
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight">提交研发咨询需求</h1>
          <p className="mt-4 text-base leading-7 text-graphite">
            需要机械结构设计、外壳设计、PCB、电路、程序、样机制作或小型工装夹具，可提交功能说明后人工评估。
          </p>

          <GuideBlock title="适合什么需求" items={fitItems} />
          <GuideBlock title="不适合什么需求" items={unfitItems} />

          <div className="mt-5 border border-ink/10 bg-white/80 p-4 text-sm leading-6 text-graphite">
            <p className="font-semibold text-ink">响应时间</p>
            <p className="mt-2">研发类需求需人工评估后报价，通常 24 小时内给出初步反馈。</p>
            <p className="mt-2">工作日晚上和周末优先处理复杂沟通。</p>
          </div>
        </aside>

        <section>
          <div className="mb-4 border border-ink/10 bg-white/80 px-4 py-3 text-sm leading-6 text-graphite">
            复杂项目建议提供图纸、样品或关键尺寸。预算较低时，会优先评估是否能拆成简单模型修改或打印任务。
          </div>
          <ServiceRequestForm customer={formCustomer} disabled={!customer} mode="development" />
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
