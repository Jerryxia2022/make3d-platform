import Link from "next/link";

export default function SuccessPage() {
  return (
    <main className="flex min-h-screen items-center bg-[#f6f7f9] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <section className="surface-card mx-auto w-full max-w-3xl p-8">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-mint">
          Make3D
        </p>
        <h1 className="mt-4 text-4xl font-bold">提交成功</h1>
        <p className="mt-5 text-lg leading-8 text-graphite">
          我们已收到你的打印需求。系统报价仅作预估，最终价格和生产安排将由人工确认后联系你。
        </p>
        <Link
          className="btn-primary mt-8 px-5 py-3"
          href="/"
        >
          返回首页
        </Link>
      </section>
    </main>
  );
}
