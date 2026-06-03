import type { InputHTMLAttributes } from "react";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="min-h-screen px-6 py-10 text-ink">
      <section className="mx-auto max-w-xl border border-ink/10 bg-white/80 p-6 shadow-sm">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
        <h1 className="mt-3 text-3xl font-bold">注册账号</h1>
        <form action="/api/account/register" className="mt-6 space-y-4" method="post">
          <Field
            helpText="请输入 11 位中国大陆手机号。"
            label="手机号"
            name="phone"
            pattern="1[3-9]\d{9}"
            required
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
          <button className="w-full bg-ink px-5 py-3 font-semibold text-white" type="submit">
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
        className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
        name={name}
        {...props}
      />
      {helpText ? <span className="mt-1 block text-xs text-graphite">{helpText}</span> : null}
    </label>
  );
}
