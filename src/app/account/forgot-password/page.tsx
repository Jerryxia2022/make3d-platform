import Link from "next/link";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { BrandLogo } from "@/frontend/components/BrandLogo";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams?: Promise<{ sent?: string }>;
}) {
  const params = await searchParams;
  const submitted = params?.sent === "1";

  return (
    <main className="min-h-screen px-6 py-10 text-ink">
      <CustomerAuthBar />
      <section className="mx-auto max-w-md border border-ink/10 bg-white/80 p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="small" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
        <h1 className="mt-3 text-3xl font-bold">忘记密码</h1>
        {submitted ? <IfAccountExistsMessage /> : null}
        <form action="/api/account/forgot-password" className="mt-6 space-y-4" method="post">
          <label className="block text-sm font-semibold">
            邮箱
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              name="email"
              required
              type="email"
            />
          </label>
          <button className="w-full bg-ink px-5 py-3 font-semibold text-white" type="submit">
            提交
          </button>
        </form>
        <Link className="mt-4 inline-block text-sm font-semibold text-coral" href="/account/login">
          返回登录
        </Link>
      </section>
    </main>
  );
}

function IfAccountExistsMessage() {
  return (
    <p className="mt-4 border border-coral/30 bg-coral/10 p-3 text-sm font-semibold text-ink">
      如果账号存在，我们会发送密码重置邮件。
    </p>
  );
}
