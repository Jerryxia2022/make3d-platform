import type { InputHTMLAttributes } from "react";
import Link from "next/link";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { BrandLogo } from "@/frontend/components/BrandLogo";
import { mainlandPhoneErrorMessage, mainlandPhoneHtmlPattern } from "@/shared/phoneValidation";

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
        <form action="/api/account/register" className="mt-6 space-y-4" method="post">
          <Field
            helpText="请输入 11 位中国大陆手机号。"
            inputMode="numeric"
            label="手机号"
            maxLength={11}
            name="phone"
            pattern={mainlandPhoneHtmlPattern}
            required
            title={mainlandPhoneErrorMessage}
            type="tel"
          />
          <Field helpText="至少 8 位。" label="密码" minLength={8} name="password" required type="password" />
          <Field label="姓名" name="name" required />
          <Field
            helpText="微信很重要，请填写常用微信，方便确认报价和生产细节。"
            label="微信"
            name="wechat"
            required
          />
          <Field helpText="邮箱建议填写，用于找回密码。" label="邮箱" name="email" type="email" />
          <button className="btn-primary w-full px-5 py-3" type="submit">
            注册
          </button>
        </form>
        <Link className="mt-4 inline-block text-sm font-semibold text-coral" href="/account/login">
          已有账号，去登录
        </Link>
      </section>
    </main>
  );
}

function Field({
  helpText,
  label,
  name,
  ...props
}: {
  helpText?: string;
  label: string;
  name: string;
} & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className="field-input mt-2 py-3"
        name={name}
        {...props}
      />
      {helpText ? <span className="mt-1 block text-xs text-graphite">{helpText}</span> : null}
    </label>
  );
}
