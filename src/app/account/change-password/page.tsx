import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { ChangePasswordForm } from "@/frontend/components/ChangePasswordForm";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function ChangePasswordPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
      <CustomerAuthBar returnTo="/account" />
      <section className="mx-auto w-full max-w-3xl py-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="eyebrow">账户安全</p>
            <h1 className="mt-3 text-3xl font-bold">修改密码</h1>
            <p className="mt-2 text-sm text-graphite">用于保护报价、订单和收货信息。</p>
          </div>
          <Link className="btn-secondary px-4 py-2" href="/account">
            返回账户
          </Link>
        </div>

        <section className="surface-card mt-6 p-5">
          <ChangePasswordForm />
        </section>
      </section>
    </main>
  );
}
