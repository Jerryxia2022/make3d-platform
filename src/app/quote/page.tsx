import { QuoteForm } from "@/frontend/components/QuoteForm";
import { ContactSection } from "@/frontend/components/ContactSection";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { listCustomerAddresses, openDatabase, type CustomerAddressRecord } from "@/backend/database";
import Link from "next/link";

const supportedFormats = ["STL", "STEP", "STP"];

export default async function QuotePage() {
  const customer = await getCurrentCustomer();
  let addresses: CustomerAddressRecord[] = [];

  if (customer) {
    const db = openDatabase();

    try {
      addresses = listCustomerAddresses(db, customer.id);
    } finally {
      db.close();
    }
  }
  const quoteCustomer = customer
    ? {
        name: customer.name,
        phone: customer.phone,
        wechat: customer.wechat,
        email: customer.email,
      }
    : null;

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
      <CustomerAuthBar returnTo="/quote" />
      <section className="mx-auto grid w-full max-w-[1450px] gap-6 py-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold">打印说明</h2>
            </div>
            <div className="space-y-3 px-4 py-4 text-sm leading-6 text-slate-600">
              <p>支持 {supportedFormats.join(" / ")} 文件，单文件最大 50MB。</p>
              <p>STL 文件通常不包含单位，系统默认按 mm 识别。</p>
              <p>默认使用 PETG 密度切片估算，切片完成后调整材料只更新价格。</p>
              <p>FDM 是通过热熔材料逐层堆叠成型的3D打印工艺，适合结构验证、外壳打样、毕业设计、小批量试制。</p>
              <p>价格计算按0.4喷嘴，0.2mm层高，50%填充率进行价格计算。</p>
              <p>如有特别要求，例如需改变喷嘴、层高、打印方向或支撑方式，请在备注中详细说明。</p>
            </div>
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-4 py-3">
              <h2 className="text-sm font-bold">设备能力</h2>
            </div>
            <dl className="divide-y divide-slate-200 text-sm">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-slate-500">打印设备</dt>
                <dd className="font-semibold">P1S 打印阵列</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-slate-500">常用材料</dt>
                <dd className="font-semibold">PLA / PETG / ABS</dd>
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <dt className="text-slate-500">评估时效</dt>
                <dd className="font-semibold">通常 24 小时内</dd>
              </div>
            </dl>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-100/70 p-4">
            <h2 className="text-sm font-bold">需要模型修改或工装夹具？</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              模型修改、STEP/STP、多实体、超尺寸或研发类需求建议提交人工评估。
            </p>
          </div>
          {!customer ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
              <h2 className="text-base font-bold">请先登录</h2>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                登录后可上传模型文件，自动计算打印价格和预计交货期。
              </p>
              <div className="mt-4 flex gap-3">
                <Link className="btn-primary px-5 py-3" href="/account/login">
                  登录
                </Link>
                <Link className="btn-secondary px-5 py-3" href="/account/register">
                  注册
                </Link>
              </div>
            </div>
          ) : null}
        </div>

        <QuoteForm addresses={addresses} customer={quoteCustomer} disabled={!customer} />
      </section>
      <ContactSection />
    </main>
  );
}
