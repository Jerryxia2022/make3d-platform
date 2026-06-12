import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ORDER_STATUSES,
  openDatabase,
  searchOrders,
  type OrderRecord,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminLogoutButton } from "@/frontend/components/AdminLogoutButton";

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const filters = (await searchParams) || {};
  const db = openDatabase();
  const orders = searchOrders(db, { query: filters.q, status: filters.status });
  db.close();

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
              Make3D Admin
            </p>
            <h1 className="mt-3 text-4xl font-bold">订单列表</h1>
          </div>
          <div className="flex gap-4">
            <Link className="font-semibold text-graphite" href="/">
              返回首页
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/requests">
              非标准需求
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/settings/payment">
              付款设置
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        <form className="mt-8 grid gap-3 border border-ink/10 bg-white/80 p-4 shadow-sm md:grid-cols-[1fr_220px_auto]" method="get">
          <label className="text-sm font-semibold">
            搜索订单
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
              defaultValue={filters.q || ""}
              name="q"
              placeholder="订单号、客户、电话、微信、邮箱"
            />
          </label>
          <label className="text-sm font-semibold">
            状态筛选
            <select
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
              defaultValue={filters.status || ""}
              name="status"
            >
              <option value="">全部状态</option>
              {ORDER_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-end gap-3">
            <button className="bg-ink px-5 py-2 text-sm font-semibold text-white" type="submit">
              搜索
            </button>
            <Link className="border border-ink/20 px-5 py-2 text-sm font-semibold" href="/admin/orders">
              重置
            </Link>
          </div>
        </form>

        <div className="mt-8 overflow-x-auto border border-ink/10 bg-white/80 shadow-sm">
          <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead className="bg-ink text-white">
              <tr>
                {[
                  "订单编号",
                  "提交时间",
                  "客户姓名",
                  "电话",
                  "微信",
                  "材料",
                  "数量",
                  "预估价格",
                  "最终报价",
                  "预估货期",
                  "配送方式",
                  "状态",
                ].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr className="border-t border-ink/10" key={order.id}>
                  <td className="px-4 py-3 font-semibold">
                    <Link className="text-coral" href={`/admin/orders/${order.id}`}>
                      {order.orderNo}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{formatDate(order.createdAt)}</td>
                  <td className="px-4 py-3">{order.customerName}</td>
                  <td className="px-4 py-3">{order.phone}</td>
                  <td className="px-4 py-3">{order.wechat}</td>
                  <td className="px-4 py-3">{order.material}</td>
                  <td className="px-4 py-3">{order.quantity}</td>
                  <td className="px-4 py-3">{formatPrice(order)}</td>
                  <td className="px-4 py-3">{formatMoney(order.finalPrice)}</td>
                  <td className="px-4 py-3">{formatLeadTime(order)}</td>
                  <td className="px-4 py-3">{order.shippingMethod || "-"}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={order.status} />
                  </td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-graphite" colSpan={12}>
                    暂无订单
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString("zh-CN", { hour12: false });
}

function StatusBadge({ status }: { status: OrderRecord["status"] }) {
  const urgent = status === "待确认" || status === "待付款";
  return (
    <span className={urgent ? "inline-flex border border-coral/30 bg-coral/10 px-2 py-1 text-xs font-bold text-coral" : "inline-flex border border-mint/30 bg-mint/10 px-2 py-1 text-xs font-bold text-ink"}>
      {status}
    </span>
  );
}

function formatPrice(order: OrderRecord) {
  const price = order.payablePrice ?? order.estimatedPrice ?? order.estimatedPriceMax;
  return price ? `¥${price.toFixed(2)}` : "-";
}

function formatMoney(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `¥${value.toFixed(2)}` : "-";
}

function formatLeadTime(order: OrderRecord) {
  if (order.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `约${order.estimatedLeadTimeMaxHours}小时`;
}
