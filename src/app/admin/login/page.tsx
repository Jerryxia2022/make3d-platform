import Link from "next/link";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-md border border-ink/10 bg-white/75 p-8 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
          Make3D Admin
        </p>
        <h1 className="mt-4 text-3xl font-bold">管理员登录</h1>
        <form action="/api/admin/login" className="mt-8 space-y-5" method="post">
          <label className="block text-sm font-semibold">
            用户名
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              name="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            密码
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              name="password"
              required
              type="password"
            />
          </label>
          <LoginError searchParams={searchParams} />
          <button className="w-full bg-ink px-5 py-3 font-semibold text-white" type="submit">
            登录
          </button>
        </form>
        <Link className="mt-6 inline-flex text-sm font-semibold text-graphite" href="/">
          返回首页
        </Link>
      </section>
    </main>
  );
}

async function LoginError({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const params = searchParams ? await searchParams : {};

  if (!params.error) {
    return null;
  }

  return (
    <p className="border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
      用户名或密码错误
    </p>
  );
}
