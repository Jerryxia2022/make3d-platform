import Link from "next/link";
import { redirect } from "next/navigation";
import { listCustomerInvoiceProfiles, openDatabase } from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { InvoiceProfileManager } from "@/frontend/components/InvoiceProfileManager";
import { INVOICE_PROFILE_LIMIT } from "@/shared/invoice";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountInvoicesPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const db = openDatabase();

  try {
    const profiles = listCustomerInvoiceProfiles(db, customer.id);

    return (
      <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
        <CustomerAuthBar returnTo="/account/invoices" />
        <section className="mx-auto w-full max-w-[1280px] py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-semibold text-graphite" href="/account">
                返回我的账户
              </Link>
              <p className="eyebrow mt-6">Make3D 发票资料</p>
              <h1 className="mt-3 text-4xl font-bold">发票资料管理</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-graphite">
                每个客户最多保存 {INVOICE_PROFILE_LIMIT} 条发票资料。提交订单时请选择发票类型和资料，历史订单会保存当时的资料快照。
              </p>
            </div>
            <Link className="btn-primary px-5 py-3" href="/quote">
              返回报价页
            </Link>
          </div>

          <InvoiceProfileManager initialProfiles={profiles} />
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}
