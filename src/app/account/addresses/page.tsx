import Link from "next/link";
import { redirect } from "next/navigation";
import { listCustomerAddresses, openDatabase } from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { AddressBookManager } from "@/frontend/components/AddressBookManager";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountAddressesPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const db = openDatabase();

  try {
    const addresses = listCustomerAddresses(db, customer.id);

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo="/account/addresses" />
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-semibold text-graphite" href="/account">
                返回我的账户
              </Link>
              <p className="eyebrow mt-6">
                Make3D 地址簿
              </p>
              <h1 className="mt-3 text-4xl font-bold">收货地址管理</h1>
              <p className="mt-4 max-w-2xl text-sm leading-6 text-graphite">
                最多保存 5 个常用地址。报价页只能选择这里维护的地址，订单提交后会保存当时的地址快照。
              </p>
            </div>
            <Link className="btn-primary px-5 py-3" href="/quote">
              返回报价页
            </Link>
          </div>

          <AddressBookManager initialAddresses={addresses} />
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}
