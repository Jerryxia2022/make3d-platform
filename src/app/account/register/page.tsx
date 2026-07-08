import Link from "next/link";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { BrandLogo } from "@/frontend/components/BrandLogo";
import { RegisterForm } from "@/frontend/components/RegisterForm";

export default function RegisterPage() {
  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-8 text-ink sm:px-6 lg:px-8">
      <CustomerAuthBar />
      <section className="surface-card mx-auto max-w-xl p-6">
        <div className="mb-6 flex justify-center">
          <BrandLogo size="small" />
        </div>
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
        <h1 className="mt-3 text-3xl font-bold">注册账号</h1>
        <RegisterForm />
        <p className="mt-4 text-xs leading-5 text-graphite">
          注册即表示你已阅读并同意
          <Link className="font-semibold text-coral" href="/legal/terms">
            用户服务协议
          </Link>
          、
          <Link className="font-semibold text-coral" href="/legal/privacy">
            隐私政策
          </Link>
          及
          <Link className="font-semibold text-coral" href="/legal/order-risk">
            订单风险确认规则
          </Link>
          。
        </p>
        <Link className="mt-4 inline-block text-sm font-semibold text-coral" href="/account/login">
          已有账号，去登录
        </Link>
      </section>
    </main>
  );
}
