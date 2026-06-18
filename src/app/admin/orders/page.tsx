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
import { AdminBrand } from "@/frontend/components/BrandLogo";
import { StatusPill } from "@/frontend/components/UiPrimitives";
import { formatBeijingDateTime } from "@/shared/dateTime";

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
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[1450px] py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <AdminBrand />
            <h1 className="mt-3 text-4xl font-bold">订单列表</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="font-semibold text-graphite" href="/">
              返回首页
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/requests">
              非标准需求
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/customer-service">
              人工客服
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/settings/payment">
              付款设置
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        <form className="surface-card mt-5 grid gap-3 p-4 md:grid-cols-[1fr_220px_auto]" method="get">
          <label className="text-sm font-semibold">
            搜索订单
            <input
              className="field-input mt-2 py-2"
              defaultValue={filters.q || ""}
              name="q"
              placeholder="订单号、客户、电话、微信、邮箱"
            />
          </label>
          <label className="text-sm font-semibold">
            状态筛选
            <select
              className="field-input mt-2 py-2"
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
            <button className="btn-primary px-5 py-2" type="submit">
              搜索
            </button>
            <Link className="btn-secondary px-5 py-2" href="/admin/orders">
              重置
            </Link>
          </div>
        </form>

        <QuickStatusLinks activeStatus={filters.status || ""} />

        <div className="table-shell mt-5">
          <table className="admin-table w-full min-w-[1320px] border-collapse text-left text-sm">
            <thead>
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
                  <th className="px-3 py-2.5 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr className="border-t border-ink/10" key={order.id}>
                  <td className="px-3 py-2.5 font-semibold">
                    <Link className="text-coral" href={`/admin/orders/${order.id}`}>
                      {order.orderNo}
                    </Link>
                  </td>
                  <td className="px-3 py-2.5">{formatDate(order.createdAt)}</td>
                  <td className="px-3 py-2.5">{order.customerName}</td>
                  <td className="px-3 py-2.5">{order.phone}</td>
                  <td className="px-3 py-2.5">{order.wechat}</td>
                  <td className="px-3 py-2.5">{order.material}</td>
                  <td className="px-3 py-2.5">{order.quantity}</td>
                  <td className="px-3 py-2.5">{formatPrice(order)}</td>
                  <td className="px-3 py-2.5">{formatMoney(order.finalPrice)}</td>
                  <td className="px-3 py-2.5">{formatLeadTime(order)}</td>
                  <td className="px-3 py-2.5">{order.shippingMethod || "-"}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={order.status} />
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

function QuickStatusLinks({ activeStatus }: { activeStatus: string }) {
  const links = [
    ["需要确认", "待确认"],
    ["等待付款", "待付款"],
    ["待排产", "已付款"],
    ["生产中", "生产中"],
    ["待发货", "后处理"],
  ] as const;

  return (
    <div className="mt-4 flex flex-wrap gap-2 text-sm">
      {links.map(([label, status]) => (
        <Link
          className={
            activeStatus === status
              ? "status-pill status-orange px-3 py-2"
              : "status-pill status-gray bg-white px-3 py-2"
          }
          href={`/admin/orders?status=${encodeURIComponent(status)}`}
          key={label}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return formatBeijingDateTime(value);
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
