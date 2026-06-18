import Link from "next/link";
import { AdminBrand } from "@/frontend/components/BrandLogo";

export default function AdminLoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  return (
    <main className="flex min-h-screen items-center bg-[#f6f7f9] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <section className="surface-card mx-auto w-full max-w-md p-8">
        <AdminBrand />
        <h1 className="mt-4 text-3xl font-bold">管理员登录</h1>
        <form action="/api/admin/login" className="mt-8 space-y-5" method="post">
          <label className="block text-sm font-semibold">
            用户名
            <input
              className="field-input mt-2 py-3"
              name="username"
              required
            />
          </label>
          <label className="block text-sm font-semibold">
            密码
            <input
              className="field-input mt-2 py-3"
              name="password"
              required
              type="password"
            />
          </label>
          <LoginError searchParams={searchParams} />
          <button className="btn-primary w-full px-5 py-3" type="submit">
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
    <p className="notice-warning px-4 py-3 text-sm font-semibold">
      用户名或密码错误
    </p>
  );
}
