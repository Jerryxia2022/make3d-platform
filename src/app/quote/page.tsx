import { QuoteForm } from "@/frontend/components/QuoteForm";
import { ContactSection } from "@/frontend/components/ContactSection";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import Link from "next/link";

const supportedFormats = ["STL", "3MF", "STEP", "STP"];

export default async function QuotePage() {
  const customer = await getCurrentCustomer();
  const quoteCustomer = customer
    ? {
        name: customer.name,
        phone: customer.phone,
        wechat: customer.wechat,
        email: customer.email,
      }
    : null;

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <CustomerAuthBar returnTo="/quote" />
      <section className="mx-auto grid w-full max-w-7xl gap-5 py-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="lg:sticky lg:top-8 lg:self-start">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
            上传模型获取报价
          </p>
          <h1 className="mt-3 text-3xl font-bold sm:text-4xl">打印报价</h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-graphite">
            左侧查看打印限制，中间上传模型和设置材料数量，右侧订单汇总在桌面端保持可见。
          </p>
          <div className="mt-6 space-y-3">
            <div className="border border-ink/10 bg-white/80 p-4">
              <h2 className="text-lg font-semibold">支持格式</h2>
              <p className="mt-3 text-graphite">{supportedFormats.join(" / ")}</p>
              <p className="mt-2 text-sm text-graphite">单文件最大 50MB</p>
            </div>
            <div className="border border-ink/10 bg-white/80 p-4">
              <h2 className="text-lg font-semibold">FDM 工艺说明</h2>
              <p className="mt-3 text-sm leading-6 text-graphite">
                FDM 是通过热熔材料逐层堆叠成型的3D打印工艺，适合结构验证、外壳打样、毕业设计、小批量试制。
              </p>
            </div>
            <div className="border border-ink/10 bg-white/80 p-4">
              <h2 className="text-lg font-semibold">基础打印标准</h2>
              <p className="mt-3 text-sm leading-6 text-graphite">
                默认按 0.4mm 喷嘴、0.2mm 层高、50% 填充进行预估。
              </p>
              <p className="mt-3 text-sm leading-6 text-graphite">
                如需特殊层高、强度、表面效果、支撑方式、分件打印等，请在备注中说明，最终由人工确认。
              </p>
            </div>
            {!customer ? (
              <div className="border border-coral/30 bg-coral/10 p-4">
                <h2 className="text-lg font-semibold">请先登录</h2>
                <p className="mt-3 text-sm leading-6 text-graphite">
                  登录后可上传模型文件，自动计算打印价格和预计交货期。
                </p>
                <div className="mt-4 flex gap-3">
                  <Link className="bg-ink px-5 py-3 font-semibold text-white" href="/account/login">
                    登录
                  </Link>
                  <Link className="border border-ink/20 bg-white px-5 py-3 font-semibold text-ink" href="/account/register">
                    注册
                  </Link>
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <QuoteForm customer={quoteCustomer} disabled={!customer} />
      </section>
      <ContactSection />
    </main>
  );
}
