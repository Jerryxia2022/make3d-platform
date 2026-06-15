import Link from "next/link";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { CustomerLoginForm } from "@/frontend/components/CustomerLoginForm";
import { BrandLogo } from "@/frontend/components/BrandLogo";

export default function LoginPage() {
  return (
    <main className="min-h-screen px-6 py-10 text-ink">
      <CustomerAuthBar />
      <section className="mx-auto max-w-md border border-ink/10 bg-white/80 p-6 shadow-sm">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="small" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
        <h1 className="mt-3 text-3xl font-bold">登录</h1>
        <CustomerLoginForm />
        <div className="mt-4 flex justify-between text-sm font-semibold text-coral">
          <Link href="/account/register">注册</Link>
          <Link href="/account/forgot-password">忘记密码</Link>
        </div>
      </section>
    </main>
  );
}
