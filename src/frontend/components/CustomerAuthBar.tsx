import Link from "next/link";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { BrandLogo } from "@/frontend/components/BrandLogo";

export async function CustomerAuthBar({ returnTo = "/" }: { returnTo?: string } = {}) {
  const customer = await getCurrentCustomer();
  const logoutAction = `/api/account/logout?next=${encodeURIComponent(returnTo)}`;

  return (
    <nav className="mx-auto flex w-full max-w-7xl items-center justify-between gap-3 px-0 py-3 text-sm font-semibold text-ink sm:px-2">
      <BrandLogo />
      <div className="flex min-w-0 items-center justify-end gap-2 sm:gap-3">
        {customer ? (
          <>
            <span className="hidden max-w-40 truncate text-graphite md:inline">{customer.name || customer.phone}</span>
            <Link className="hidden text-graphite transition hover:text-ink sm:inline-flex" href="/quote">
              在线报价
            </Link>
            <Link className="btn-secondary px-3 py-2" href="/account">
              我的账户
            </Link>
            <form action={logoutAction} method="post">
              <button className="text-graphite transition hover:text-ink" type="submit">
                退出登录
              </button>
            </form>
          </>
        ) : (
          <>
            <Link className="hidden text-graphite transition hover:text-ink sm:inline-flex" href="/quote">
              在线报价
            </Link>
            <Link className="btn-secondary px-3 py-2" href="/account/login">
              登录
            </Link>
            <Link className="btn-primary px-3 py-2" href="/account/register">
              注册
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}
