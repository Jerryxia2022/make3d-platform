import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/backend/nextCustomer";

export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  return (
    <main className="min-h-screen px-6 py-10 text-ink">
      <section className="mx-auto max-w-3xl border border-ink/10 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
            <h1 className="mt-3 text-3xl font-bold">我的账号</h1>
          </div>
          <Link className="border border-ink/20 px-4 py-2 text-sm font-semibold" href="/account/logout">
            退出登录
          </Link>
        </div>

        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Detail label="姓名" value={customer.name} />
          <Detail label="手机号" value={customer.phone} />
          <Detail label="微信" value={customer.wechat} />
          <Detail label="邮箱" value={customer.email || "-"} />
        </div>

        <div className="mt-8 border border-ink/10 bg-white p-5">
          <h2 className="text-xl font-semibold">历史订单</h2>
          <p className="mt-3 text-sm text-graphite">历史订单功能将在后续版本开放。</p>
        </div>
      </section>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
