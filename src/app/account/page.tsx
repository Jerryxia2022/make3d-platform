import Link from "next/link";
import { redirect } from "next/navigation";
import {
  listOrdersByCustomerId,
  openDatabase,
  type OrderRecord,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";

export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const db = openDatabase();

  try {
    const orders = listOrdersByCustomerId(db, customer.id);

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo="/" />
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
              <h1 className="mt-3 text-4xl font-bold">我的账户</h1>
            </div>
            <Link className="border border-ink/20 px-4 py-2 text-sm font-semibold" href="/account/logout">
              退出登录
            </Link>
          </div>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">用户资料</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="姓名" value={customer.name} />
              <Detail label="手机号" value={customer.phone} />
              <Detail label="微信" value={customer.wechat} />
              <Detail label="邮箱" value={customer.email || "-"} />
            </div>
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">我的订单</h2>
                <p className="mt-2 text-sm text-graphite">查看已提交订单的生产状态和交货期。</p>
              </div>
              <Link className="bg-ink px-4 py-2 text-sm font-semibold text-white" href="/quote">
                再次下单
              </Link>
            </div>
            <OrderTable orders={orders} />
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">我的历史报价</h2>
            <p className="mt-2 text-sm text-graphite">
              历史报价基于已提交订单保存，最终价格以人工确认为准。
            </p>
            <OrderTable orders={orders} compact />
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
      <div className="mt-5 border border-ink/10 bg-white p-5 text-sm text-graphite">
        暂无订单记录。
      </div>
    );
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-ink/10 text-graphite">
            <th className="py-3 pr-4 font-semibold">订单编号</th>
            <th className="py-3 pr-4 font-semibold">提交时间</th>
            <th className="py-3 pr-4 font-semibold">文件数量</th>
            <th className="py-3 pr-4 font-semibold">订单总价</th>
            <th className="py-3 pr-4 font-semibold">预计交货期</th>
            <th className="py-3 pr-4 font-semibold">订单状态</th>
            {!compact ? <th className="py-3 pr-4 font-semibold">操作</th> : null}
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <tr className="border-b border-ink/10" key={order.id}>
              <td className="py-3 pr-4 font-semibold">
                <Link className="text-coral" href={`/account/orders/${order.id}`}>
                  {order.orderNo}
                </Link>
              </td>
              <td className="py-3 pr-4">{formatDate(order.createdAt)}</td>
              <td className="py-3 pr-4">{formatFileCount(order)}</td>
              <td className="py-3 pr-4">{formatMoney(order.payablePrice ?? order.estimatedPrice)}</td>
              <td className="py-3 pr-4">{formatLeadTime(order.estimatedLeadTimeHours)}</td>
              <td className="py-3 pr-4">
                <p className="font-semibold">{order.status}</p>
                {order.status === "待付款" ? (
                  <p className="mt-1 text-xs font-semibold text-coral">请联系工作人员完成付款</p>
                ) : null}
              </td>
              {!compact ? (
                <td className="py-3 pr-4">
                  <Link className="font-semibold text-coral" href={`/account/orders/${order.id}`}>
                    查看详情
                  </Link>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
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
