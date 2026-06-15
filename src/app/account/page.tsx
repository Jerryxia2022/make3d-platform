import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getWechatAccountByCustomerId,
  listOrdersByCustomerId,
  openDatabase,
  type OrderRecord,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { maskOpenid } from "@/backend/wechat";
import { ChangePasswordForm } from "@/frontend/components/ChangePasswordForm";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { InfoTile, StatusPill } from "@/frontend/components/UiPrimitives";
import { WechatBindCard } from "@/frontend/components/WechatBindCard";
import { formatBeijingDateTime } from "@/shared/dateTime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const db = openDatabase();

  try {
    const orders = listOrdersByCustomerId(db, customer.id);
    const wechatAccount = getWechatAccountByCustomerId(db, customer.id);
    const activeBindCode =
      wechatAccount?.bindCode &&
      wechatAccount.bindCodeExpiresAt &&
      wechatAccount.bindCodeExpiresAt > Date.now()
        ? wechatAccount.bindCode
        : null;

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo="/" />
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="eyebrow">Make3D 会员</p>
              <h1 className="mt-3 text-4xl font-bold">我的账户</h1>
            </div>
          </div>

          <section className="surface-card mt-8 p-6">
            <h2 className="text-xl font-bold">用户资料</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="姓名" value={customer.name} />
              <Detail label="手机号" value={customer.phone} />
              <Detail label="微信" value={customer.wechat} />
              <Detail label="邮箱" value={customer.email || "-"} />
            </div>
          </section>

          <section className="surface-card mt-8 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">地址簿</h2>
                <p className="mt-2 text-sm text-graphite">
                  维护常用收货地址，报价下单时只能选择已保存地址。
                </p>
              </div>
              <Link className="btn-primary px-4 py-2" href="/account/addresses">
                管理地址簿
              </Link>
            </div>
          </section>

          <section className="surface-card mt-8 p-6">
            <h2 className="text-xl font-bold">修改密码</h2>
            <p className="mt-2 text-sm text-graphite">用于保护报价、订单和收货信息。</p>
            <ChangePasswordForm />
          </section>

          <WechatBindCard
            bound={Boolean(wechatAccount?.openid)}
            initialBindCode={activeBindCode}
            initialExpiresAt={activeBindCode ? wechatAccount?.bindCodeExpiresAt : null}
            maskedOpenid={maskOpenid(wechatAccount?.openid)}
            subscribed={Boolean(wechatAccount?.subscribed)}
          />

          <section className="surface-card mt-8 p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">我的订单</h2>
                <p className="mt-2 text-sm text-graphite">查看已提交订单的生产状态和交货期。</p>
              </div>
              <Link className="btn-primary px-4 py-2" href="/quote">
                再次下单
              </Link>
            </div>
            <OrderTable orders={orders} />
          </section>

        </section>
      </main>
    );
  } finally {
    db.close();
  }
}

function OrderTable({ orders, compact = false }: { orders: OrderRecord[]; compact?: boolean }) {
  if (orders.length === 0) {
    return (
      <div className="surface-soft mt-5 p-5 text-sm text-graphite">
        暂无订单记录。
      </div>
    );
  }

  return (
    <div className={compact ? "mt-5 grid gap-3 lg:grid-cols-2" : "mt-5 grid gap-4 lg:grid-cols-2"}>
      {orders.map((order) => (
        <article className="surface-card p-4" key={order.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-bold text-coral" href={`/account/orders/${order.id}`}>
                {order.orderNo}
              </Link>
              <p className="mt-1 text-xs text-graphite">{formatDate(order.createdAt)} · {formatFileCount(order)}</p>
            </div>
            <StatusPill status={order.status} />
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <InfoTile label="金额" value={formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)} />
            <InfoTile label="交付" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
            <InfoTile label="文件" value={formatFileCount(order)} />
          </div>
          {!compact ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
              <p className="text-xs text-graphite">
                {order.status === "待付款" ? "请按最终报价付款" : "状态、物流和备注在详情页同步"}
              </p>
              <Link
                className={order.status === "待付款" ? "btn-primary shrink-0 px-4 py-2" : "btn-secondary shrink-0 px-4 py-2"}
                href={`/account/orders/${order.id}`}
              >
                {order.status === "待付款" ? "查看付款方式" : "查看详情"}
              </Link>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function formatDate(value: string) {
  return formatBeijingDateTime(value);
}

function formatMoney(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatLeadTime(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `约 ${Math.ceil(value)} 小时` : "以人工确认为准";
}

function formatFileCount(order: OrderRecord) {
  return `${Math.max(order.fileCount || 0, 0)} 个`;
}
