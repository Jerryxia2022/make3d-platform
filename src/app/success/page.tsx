import Link from "next/link";

export default function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-3xl border border-ink/10 bg-white/75 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">
          Make3D
        </p>
        <h1 className="mt-4 text-4xl font-bold">提交成功</h1>
        <p className="mt-5 text-lg leading-8 text-graphite">
          我们已收到你的打印需求。系统报价仅作预估，最终价格和生产安排将由人工确认后联系你。
        </p>
        <Link
          className="mt-8 inline-flex bg-ink px-5 py-3 font-semibold text-white"
          href="/"
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
