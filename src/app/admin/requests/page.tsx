import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SERVICE_REQUEST_STATUSES,
  searchServiceRequests,
  openDatabase,
  type ServiceRequestRecord,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminLogoutButton } from "@/frontend/components/AdminLogoutButton";

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
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-7xl">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-coral">
              Make3D Admin
            </p>
            <h1 className="mt-3 text-4xl font-bold">非标准需求</h1>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <Link className="font-semibold text-graphite" href="/admin/orders">
              订单列表
            </Link>
            <Link className="font-semibold text-graphite" href="/admin/settings/payment">
              付款设置
            </Link>
            <AdminLogoutButton />
          </div>
        </div>

        <form className="mt-6 grid gap-3 border border-ink/10 bg-white/90 p-4 shadow-sm lg:grid-cols-[1fr_210px_210px_auto]" method="get">
          <label className="text-sm font-semibold">
            搜索需求
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
              defaultValue={filters.q || ""}
              name="q"
              placeholder="项目、客户、手机号、说明"
            />
          </label>
          <label className="text-sm font-semibold">
            需求类型
            <select
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
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
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-2 font-normal"
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
            <button className="bg-ink px-5 py-2 text-sm font-semibold text-white" type="submit">
              搜索
            </button>
            <Link className="border border-ink/20 px-5 py-2 text-sm font-semibold" href="/admin/requests">
              重置
            </Link>
          </div>
        </form>

        <div className="mt-6 overflow-x-auto border border-ink/10 bg-white/90 shadow-sm">
          <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
            <thead className="bg-ink text-white">
              <tr>
                {["需求类型", "项目名称", "客户", "手机号", "预算", "状态", "提交时间", "操作"].map((header) => (
                  <th className="px-4 py-3 font-semibold" key={header}>
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {requests.map((request) => (
                <tr className="border-t border-ink/10" key={request.id}>
                  <td className="px-4 py-3">{formatRequestType(request.requestType)}</td>
                  <td className="px-4 py-3">
                    <p className="font-semibold">{request.projectName}</p>
                    <p className="mt-1 text-xs text-graphite">{request.fileCount} 个附件</p>
                  </td>
                  <td className="px-4 py-3">{request.customerName}</td>
                  <td className="px-4 py-3">{request.phone}</td>
                  <td className="px-4 py-3">{request.budgetRange}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={request.status} />
                  </td>
                  <td className="px-4 py-3">{formatDate(request.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Link className="inline-flex bg-ink px-3 py-2 text-xs font-semibold text-white" href={`/admin/requests/${request.id}`}>
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

function StatusBadge({ status }: { status: ServiceRequestRecord["status"] }) {
  const urgent = status === "待评估" || status === "已联系";
  return (
    <span className={urgent ? "inline-flex border border-coral/30 bg-coral/10 px-2 py-1 text-xs font-bold text-coral" : "inline-flex border border-mint/30 bg-mint/10 px-2 py-1 text-xs font-bold text-ink"}>
      {status}
    </span>
  );
}

function formatRequestType(type: ServiceRequestRecord["requestType"]) {
  return type === "design" ? "模型修改与打印" : "工装夹具 / 研发咨询";
}

function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString("zh-CN", { hour12: false });
}
