import Link from "next/link";
import {
  LEGAL_DOCUMENT_PAGES,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_LAST_UPDATED_DATE,
  LEGAL_PUBLIC_VERSION,
  getLegalDocumentPage,
} from "@/shared/legalPolicy";

export function LegalDocument({ slug }: { slug: string }) {
  const document = getLegalDocumentPage(slug);

  if (!document) {
    return null;
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[980px]">
        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold">
          <Link className="text-graphite hover:text-ink" href="/legal">
            协议总览
          </Link>
          {LEGAL_DOCUMENT_PAGES.map((item) => (
            <Link
              className={item.slug === slug ? "text-coral" : "text-graphite hover:text-ink"}
              href={`/legal/${item.slug}`}
              key={item.slug}
            >
              {item.navTitle}
            </Link>
          ))}
        </div>

        <article className="mt-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="eyebrow">Make3D 协议</p>
          <h1 className="mt-3 text-4xl font-bold">{document.title}</h1>
          <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
            <Meta label="版本" value={LEGAL_PUBLIC_VERSION} />
            <Meta label="生效日期" value={LEGAL_EFFECTIVE_DATE} />
            <Meta label="最后更新日期" value={LEGAL_LAST_UPDATED_DATE} />
          </dl>
          <div className="mt-6 space-y-4 text-sm leading-7 text-graphite">
            {document.body.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 px-4 py-3">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}
