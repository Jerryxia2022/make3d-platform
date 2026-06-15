import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CUSTOMER_SERVICE_REQUEST_STATUSES,
  openDatabase,
  searchCustomerServiceRequests,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { maskOpenid } from "@/backend/wechat";
import { AdminCustomerServiceStatusButton } from "@/frontend/components/AdminCustomerServiceStatusButton";
import { AdminLogoutButton } from "@/frontend/components/AdminLogoutButton";
import { AdminBrand } from "@/frontend/components/BrandLogo";
import { StatusPill } from "@/frontend/components/UiPrimitives";
import { formatBeijingDateTime } from "@/shared/dateTime";

export default async function AdminCustomerServicePage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string }>;
}) {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const filters = (await searchParams) || {};
  const db = openDatabase();
  const requests = searchCustomerServiceRequests(db, {
    query: filters.q,
    status: filters.status,
  });
  db.close();

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <AdminBrand />
            <h1 className="mt-3 text-4xl font-bold">人工客服请求</h1>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="font-semibold text-graphite" href="/admin/orders">
              订单列表
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

        <form className="surface-card mt-6 grid gap-3 p-4 lg:grid-cols-[1fr_220px_auto]" method="get">
          <div className="notice-warning px-4 py-3 text-sm leading-6 lg:col-span-3">
            当前公众号采用关键词服务模式，客户可发送 报价 / 订单 / 付款 / 人工 获取对应服务。发送“人工”后会在此生成客服请求。
          </div>
          <label className="text-sm font-semibold">
            搜索客服请求
            <input
              className="field-input mt-2 py-2"
              defaultValue={filters.q || ""}
              name="q"
              placeholder="客户、手机号、openid、订单号、消息内容"
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
              {CUSTOMER_SERVICE_REQUEST_STATUSES.map((status) => (
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
            <Link className="btn-secondary px-5 py-2" href="/admin/customer-service">
              重置
            </Link>
          </div>
        </form>

        <div className="table-shell mt-6">
          <table className="admin-table w-full min-w-[1120px] border-collapse text-left text-sm">
            <thead>
              <tr>
                {["客户", "手机号", "openid", "消息内容", "关联订单", "状态", "创建时间", "操作"].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr className="border-t border-ink/10 align-top" key={request.id}>
                  <td className="px-4 py-3">{request.customerName || "-"}</td>
                  <td className="px-4 py-3">{request.phone || "-"}</td>
                  <td className="px-4 py-3">{maskOpenid(request.openid)}</td>
                  <td className="max-w-md px-4 py-3">
                    <p className="whitespace-pre-wrap leading-6">{request.message}</p>
                  </td>
                  <td className="px-4 py-3">
                    {request.orderId && request.orderNo ? (
                      <Link className="font-semibold text-coral" href={`/admin/orders/${request.orderId}`}>
                        {request.orderNo}
                      </Link>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StatusPill status={request.status} />
                  </td>
                  <td className="px-4 py-3">{formatDate(request.createdAt)}</td>
                  <td className="px-4 py-3">
                    <AdminCustomerServiceStatusButton
                      disabled={request.status === "已处理"}
                      requestId={request.id}
                    />
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-graphite" colSpan={8}>
                    暂无客服请求
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
  return formatBeijingDateTime(value);
}
