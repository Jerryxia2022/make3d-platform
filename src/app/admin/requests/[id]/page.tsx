import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getServiceRequestById,
  getServiceRequestLogsByRequestId,
  openDatabase,
  type ServiceRequestDetail,
  type ServiceRequestLogRecord,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminRequestStatusForm } from "@/frontend/components/AdminRequestStatusForm";

export default async function AdminRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const request = getServiceRequestById(db, Number(id));
    const logs = getServiceRequestLogsByRequestId(db, request.id);

    return (
      <main className="min-h-screen px-6 py-8 text-ink">
        <section className="mx-auto w-full max-w-7xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="text-sm font-semibold text-graphite" href="/admin/requests">
                返回需求列表
              </Link>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-coral">
                #{request.id} · {formatRequestType(request.requestType)}
              </p>
              <h1 className="mt-3 text-4xl font-bold">{request.projectName}</h1>
            </div>
            <div className="w-full sm:max-w-sm">
              <AdminRequestStatusForm adminNote={request.adminNote} requestId={request.id} status={request.status} />
            </div>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_1fr_360px]">
            <section className="border border-ink/10 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold">客户信息</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="客户" value={request.customerName} />
                <Detail label="手机号" value={request.phone} />
                <Detail label="微信" value={request.wechat || "-"} />
                <Detail label="邮箱" value={request.email || "-"} />
                <Detail label="预算" value={request.budgetRange} />
                <Detail label="期望交付" value={request.expectedDeliveryTime || "-"} />
                <Detail label="状态" value={request.status} />
                <Detail label="提交时间" value={formatDate(request.createdAt)} />
              </dl>
            </section>

            <section className="border border-ink/10 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold">表单内容</h2>
              <RequestFields request={request} />
            </section>

            <section className="border border-ink/10 bg-white/90 p-5 shadow-sm">
              <h2 className="text-xl font-bold">管理员备注</h2>
              <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-graphite">
                {request.adminNote || "暂无管理员备注"}
              </p>
              <h3 className="mt-6 text-base font-bold">联系记录</h3>
              <ContactLogs logs={logs} />
            </section>
          </div>

          <section className="mt-6 border border-ink/10 bg-white/90 p-5 shadow-sm">
            <h2 className="text-xl font-bold">附件</h2>
            {request.files.length === 0 ? (
              <p className="mt-4 text-sm text-graphite">未上传附件</p>
            ) : (
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {request.files.map((file) => (
                  <div className="flex items-center justify-between gap-4 border border-ink/10 px-4 py-3" key={file.id}>
                    <div>
                      <p className="font-semibold">{file.filename}</p>
                      <p className="mt-1 text-xs text-graphite">
                        {formatBytes(file.filesize)} · 上传时间：{formatDate(file.createdAt)}
                      </p>
                    </div>
                    <a className="shrink-0 bg-ink px-3 py-2 text-xs font-semibold text-white" href={`/api/admin/request-files/${file.id}/download`}>
                      下载
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    );
  } catch {
    notFound();
  } finally {
    db.close();
  }
}

function RequestFields({ request }: { request: ServiceRequestDetail }) {
  if (request.requestType === "design") {
    return (
      <dl className="mt-4 grid gap-3 text-sm">
        <Detail label="是否打印" value={request.needsPrinting || "-"} />
        <LongDetail label="修改说明" value={request.modificationNotes || "-"} />
        <LongDetail label="关键尺寸" value={request.keyDimensions || "-"} />
        <LongDetail label="备注" value={request.remarks || "-"} />
      </dl>
    );
  }

  return (
    <dl className="mt-4 grid gap-3 text-sm">
      <Detail label="项目类型" value={request.projectType || "-"} />
      <Detail label="已有资料" value={request.hasDrawingsOrSample || "-"} />
      <Detail label="上门测量" value={request.needsOnsiteMeasurement || "-"} />
      <Detail label="沟通时间" value={request.acceptsEveningOrWeekendContact || "-"} />
      <LongDetail label="功能描述" value={request.functionDescription || "-"} />
      <LongDetail label="备注" value={request.remarks || "-"} />
    </dl>
  );
}

function ContactLogs({ logs }: { logs: ServiceRequestLogRecord[] }) {
  if (logs.length === 0) {
    return <p className="mt-3 text-sm text-graphite">暂无联系记录</p>;
  }

  return (
    <div className="mt-3 space-y-3">
      {logs.map((log) => (
        <div className="border border-ink/10 px-3 py-2 text-sm" key={log.id}>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">{log.toStatus}</p>
            <p className="text-xs text-graphite">{formatDate(log.createdAt)}</p>
          </div>
          <p className="mt-1 text-xs text-graphite">
            {log.fromStatus || "-"} → {log.toStatus} · {log.operator}
          </p>
          {log.note ? <p className="mt-2 whitespace-pre-wrap leading-6 text-graphite">{log.note}</p> : null}
        </div>
      ))}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3">
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function LongDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd className="mt-2 whitespace-pre-wrap leading-6">{value}</dd>
    </div>
  );
}

function formatRequestType(type: ServiceRequestDetail["requestType"]) {
  return type === "design" ? "模型修改与打印" : "工装夹具 / 研发咨询";
}

function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString("zh-CN", { hour12: false });
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}
