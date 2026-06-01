import Link from "next/link";

const serviceItems = ["快速打样", "小批量试产", "毕业设计打印"];

export default function HomePage() {
  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center gap-12">
        <div className="max-w-3xl">
          <p className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-coral">
            Make3D V1.0
          </p>
          <h1 className="text-5xl font-bold leading-tight sm:text-7xl">
            Make3D
          </h1>
          <p className="mt-5 text-2xl font-semibold text-graphite sm:text-3xl">
            工业级3D打印服务
          </p>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-graphite">
            在线提交模型需求，获取系统预估报价，后续由人工确认最终价格与生产安排。
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            {serviceItems.map((item) => (
              <span
                className="border border-ink/15 bg-white/65 px-4 py-2 text-sm font-semibold"
                key={item}
              >
                {item}
              </span>
            ))}
          </div>
          <div className="mt-10">
            <Link
              className="inline-flex items-center justify-center bg-ink px-6 py-3 text-base font-semibold text-white transition hover:bg-graphite"
              href="/quote"
            >
              立即报价
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
