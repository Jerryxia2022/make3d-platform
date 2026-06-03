import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrders, openDatabase, type OrderRecord } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminLogoutButton } from "@/frontend/components/AdminLogoutButton";

export default async function AdminOrdersPage() {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const db = openDatabase();
  const orders = listOrders(db);
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
            <AdminLogoutButton />
          </div>
        </div>

        <div className="mt-8 overflow-x-auto border border-ink/10 bg-white/80 shadow-sm">
          <table className="w-full min-w-[1200px] border-collapse text-left text-sm">
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
                  <td className="px-4 py-3">{formatLeadTime(order)}</td>
                  <td className="px-4 py-3">{order.shippingMethod || "-"}</td>
                  <td className="px-4 py-3">{order.status}</td>
                </tr>
              ))}
              {orders.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-graphite" colSpan={11}>
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

function formatPrice(order: OrderRecord) {
  const price = order.estimatedPrice || order.estimatedPriceMax;
  return price ? `¥${price.toFixed(2)}` : "-";
}

function formatLeadTime(order: OrderRecord) {
  if (order.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `约${order.estimatedLeadTimeMaxHours}小时`;
}
