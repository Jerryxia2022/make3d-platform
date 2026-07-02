import Link from "next/link";
import type { ReactNode } from "react";

import { getCurrentCustomer } from "@/backend/nextCustomer";
import { listCustomerAddresses, openDatabase, type CustomerAddressRecord } from "@/backend/database";
import { ContactSection } from "@/frontend/components/ContactSection";
import { ContactSupportButton } from "@/frontend/components/ContactSupportButton";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { QuoteForm } from "@/frontend/components/QuoteForm";
import { SmartStickyColumn } from "@/frontend/components/SmartStickyColumn";
import { MATERIAL_GUIDANCE } from "@/shared/materialGuidance";

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
      <section className="mx-auto grid w-full max-w-[1450px] gap-5 py-5 xl:grid-cols-[260px_minmax(0,1fr)]">
        <SmartStickyColumn className="order-2 xl:order-1" contentClassName="space-y-4" topOffset={20}>
          <InfoCard title="FDM打印说明">
            <p>FDM通过熔融材料逐层成型，适合外观件、功能件和小批量试制。</p>
            <p>默认报价按0.4mm喷嘴、0.2mm层高、50%填充计算。</p>
            <p>如有特殊尺寸、公差、强度或表面要求，请在订单备注中说明。</p>
          </InfoCard>

          <InfoCard
            title="材料特性"
            description="常用FDM材料参考，实际性能会受到模型结构、打印方向和填充率影响。"
          >
            <div className="space-y-3">
              {MATERIAL_GUIDANCE.map((item) => (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3" key={item.material}>
                  <p className="font-bold text-ink">{item.material}</p>
                  <p className="mt-1 text-slate-600">{item.compactFeature}</p>
                  <p className="mt-1 text-slate-600">{item.compactUseCase}</p>
                </div>
              ))}
            </div>
          </InfoCard>

          <InfoCard title="工艺提示">
            <ul className="space-y-2">
              <li>• 成品表面可能存在层纹、接缝和支撑痕迹</li>
              <li>• 尺寸、孔径和装配间隙存在正常工艺公差</li>
              <li>• 不同批次材料和屏幕显示可能产生轻微色差</li>
            </ul>
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-slate-700">
              精密装配、密封、承重或高温用途需要人工确认。
            </p>
          </InfoCard>

          <InfoCard title="需要人工确认？">
            <p>以下情况将转人工评估：</p>
            <p>
              STEP/STP、多实体、破面、超尺寸、模型修改、精密公差、后处理或特殊材料要求。
            </p>
            <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
              <Link className="btn-primary justify-center px-4 py-2 text-sm" href="/request/design">
                提交人工确认
              </Link>
              <ContactSupportButton className="btn-secondary justify-center px-4 py-2 text-sm">
                联系客服
              </ContactSupportButton>
            </div>
          </InfoCard>
        </SmartStickyColumn>

        <div className="order-1 xl:order-2">
          <QuoteForm addresses={addresses} customer={quoteCustomer} disabled={!customer} />
        </div>
      </section>
      <ContactSection />
    </main>
  );
}

function InfoCard({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description?: string;
  title: string;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-4 py-3">
        <h2 className="text-base font-bold">{title}</h2>
        {description ? <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p> : null}
      </div>
      <div className="space-y-3 px-4 py-4 text-sm leading-6 text-slate-600">{children}</div>
    </section>
  );
}
