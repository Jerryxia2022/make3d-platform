import Link from "next/link";
import {
  COMPANY_LEGAL_SNAPSHOT,
  LEGAL_DOCUMENT_PAGES,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED_DATE,
  LEGAL_PAGE_SECTIONS,
  LEGAL_PUBLIC_VERSION,
} from "@/shared/legalPolicy";

export default function LegalPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[1100px]">
        <Link className="font-semibold text-graphite" href="/">
          返回首页
        </Link>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="eyebrow">Make3D 协议与规则</p>
          <h1 className="mt-3 text-4xl font-bold">Make3D 用户协议、隐私政策与定制制造服务规则</h1>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <LegalMeta label="版本" value={LEGAL_PUBLIC_VERSION} />
            <LegalMeta label="生效日期" value={LEGAL_EFFECTIVE_DATE} />
            <LegalMeta label="最后更新日期" value={LEGAL_LAST_UPDATED_DATE} />
          </dl>
          <div className="mt-5 flex flex-wrap gap-2">
            {LEGAL_DOCUMENT_PAGES.map((item) => (
              <Link className="btn-secondary px-3 py-2 text-xs" href={`/legal/${item.slug}`} key={item.slug}>
                {item.navTitle}
              </Link>
            ))}
          </div>
        </div>

        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold">经营主体与联系方式</h2>
          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <LegalMeta label="公司名称" value={COMPANY_LEGAL_SNAPSHOT.company_name} />
            <LegalMeta label="统一社会信用代码" value={COMPANY_LEGAL_SNAPSHOT.unified_social_credit_code} />
            <LegalMeta label="营业执照登记住所" value={COMPANY_LEGAL_SNAPSHOT.registered_address} />
            <LegalMeta label="法定代表人" value={COMPANY_LEGAL_SNAPSHOT.legal_representative} />
            <LegalMeta label="售后/联系地址" value={COMPANY_LEGAL_SNAPSHOT.contact_address} />
            <LegalMeta label="客服时间" value={COMPANY_LEGAL_SNAPSHOT.customer_service_hours} />
          </dl>
        </section>

        <div className="mt-5 grid gap-5">
          {LEGAL_PAGE_SECTIONS.map((section) => (
            <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm" key={section.title}>
              <h2 className="text-2xl font-bold">{section.title}</h2>
              <div className="mt-4 space-y-3 text-sm leading-7 text-graphite">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}

function LegalMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value || "-"}</dd>
    </div>
  );
}
