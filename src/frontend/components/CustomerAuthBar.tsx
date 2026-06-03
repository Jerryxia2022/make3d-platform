import Link from "next/link";
import { getCurrentCustomer } from "@/backend/nextCustomer";

export async function CustomerAuthBar() {
  const customer = await getCurrentCustomer();

  return (
    <nav className="mx-auto flex w-full max-w-6xl items-center justify-end gap-3 px-6 py-4 text-sm font-semibold text-ink">
      {customer ? (
        <>
          <span className="hidden text-graphite sm:inline">{customer.name || customer.phone}</span>
          <Link className="border border-ink/20 bg-white/70 px-3 py-2" href="/account">
            我的账户
          </Link>
          <Link className="bg-ink px-3 py-2 text-white" href="/account/logout">
            退出登录
          </Link>
        </>
      ) : (
        <>
          <Link className="border border-ink/20 bg-white/70 px-3 py-2" href="/account/login">
            登录
          </Link>
          <Link className="bg-ink px-3 py-2 text-white" href="/account/register">
            注册
          </Link>
        </>
      )}
    </nav>
  );
}
