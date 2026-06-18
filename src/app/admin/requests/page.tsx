import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SERVICE_REQUEST_STATUSES,
  searchServiceRequests,
  openDatabase,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminLogoutButton } from "@/frontend/components/AdminLogoutButton";
import { AdminBrand } from "@/frontend/components/BrandLogo";
import { StatusPill } from "@/frontend/components/UiPrimitives";
import { formatBeijingDateTime } from "@/shared/dateTime";

const requestTypes = [
  { label: "模型修改与打印", value: "design" },
  { label: "工装夹具 / 研发咨询", value: "development" },
];

export default async function AdminRequestsPage({
  searchParams,
}: {
  searchParams?: Promise<{ q?: string; status?: string; type?: string }>;
}) {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const filters = (await searchParams) || {};
  const db = openDatabase();
  const requests = searchServiceRequests(db, {
    query: filters.q,
    status: filters.status,
    requestType: filters.type,
  });
  db.close();

  return (
    <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
      <section className="mx-auto w-full max-w-[1450px] py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <AdminBrand />
            <h1 className="mt-3 text-4xl font-bold">非标准需求</h1>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link className="font-semibold text-graphite" href="/admin/orders">
              订单列表
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

        <form className="surface-card mt-5 grid gap-3 p-4 lg:grid-cols-[1fr_210px_210px_auto]" method="get">
          <label className="text-sm font-semibold">
            搜索需求
            <input
              className="field-input mt-2 py-2"
              defaultValue={filters.q || ""}
              name="q"
              placeholder="项目、客户、手机号、说明"
            />
          </label>
          <label className="text-sm font-semibold">
            需求类型
            <select
              className="field-input mt-2 py-2"
              defaultValue={filters.type || ""}
              name="type"
            >
              <option value="">全部类型</option>
              {requestTypes.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm font-semibold">
            状态筛选
            <select
              className="field-input mt-2 py-2"
              defaultValue={filters.status || ""}
              name="status"
            >
              <option value="">全部状态</option>
              {SERVICE_REQUEST_STATUSES.map((status) => (
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
            <Link className="btn-secondary px-5 py-2" href="/admin/requests">
              重置
            </Link>
          </div>
        </form>

        <div className="table-shell mt-5">
          <table className="admin-table w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead>
              <tr>
                {["需求类型", "项目名称", "客户", "手机号", "预算", "状态", "提交时间", "操作"].map((header) => (
                  <th className="px-3 py-2.5 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr className="border-t border-ink/10" key={request.id}>
                  <td className="px-3 py-2.5">{formatRequestType(request.requestType)}</td>
                  <td className="px-3 py-2.5">
                    <p className="font-semibold">{request.projectName}</p>
                    <p className="mt-1 text-xs text-graphite">{request.fileCount} 个附件</p>
                  </td>
                  <td className="px-3 py-2.5">{request.customerName}</td>
                  <td className="px-3 py-2.5">{request.phone}</td>
                  <td className="px-3 py-2.5">{request.budgetRange}</td>
                  <td className="px-3 py-2.5">
                    <StatusPill status={request.status} />
                  </td>
                  <td className="px-3 py-2.5">{formatDate(request.createdAt)}</td>
                  <td className="px-3 py-2.5">
                    <Link className="btn-primary px-3 py-2 text-xs" href={`/admin/requests/${request.id}`}>
                      查看详情
                    </Link>
                  </td>
                </tr>
              ))}
              {requests.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-graphite" colSpan={8}>
                    暂无非标准需求
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

function formatRequestType(type: "design" | "development") {
  return type === "design" ? "模型修改与打印" : "工装夹具 / 研发咨询";
}

function formatDate(value: string) {
  return formatBeijingDateTime(value);
}
