import Link from "next/link";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-6 py-10 text-ink">
      <CustomerAuthBar />
      <section className="mx-auto max-w-md border border-ink/10 bg-white/80 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
        <h1 className="mt-3 text-3xl font-bold">登录</h1>
        <form action="/api/account/login" className="mt-6 space-y-4" method="post">
          <label className="block text-sm font-semibold">
            手机号
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              name="phone"
              required
              type="tel"
            />
          </label>
          <label className="block text-sm font-semibold">
            密码
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              minLength={8}
              name="password"
              required
              type="password"
            />
          </label>
          <button className="w-full bg-ink px-5 py-3 font-semibold text-white" type="submit">
            登录
          </button>
        </form>
        <div className="mt-4 flex justify-between text-sm font-semibold text-coral">
          <Link href="/account/register">注册</Link>
          <Link href="/account/forgot-password">忘记密码</Link>
        </div>
      </section>
    </main>
  );
}
