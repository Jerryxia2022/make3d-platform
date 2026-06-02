import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrderById, openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminStatusForm } from "@/frontend/components/AdminStatusForm";

export default async function AdminOrderDetailPage({
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
    const order = getOrderById(db, Number(id));

    return (
      <main className="min-h-screen px-6 py-8 text-ink">
        <section className="mx-auto w-full max-w-5xl">
          <Link className="font-semibold text-graphite" href="/admin/orders">
            返回订单列表
          </Link>
          <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                {order.orderNo}
              </p>
              <h1 className="mt-3 text-4xl font-bold">订单详情</h1>
            </div>
            <AdminStatusForm orderId={order.id} status={order.status} />
          </div>

          <div className="mt-8 grid gap-6 lg:grid-cols-3">
            <section className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">订单信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="订单编号" value={order.orderNo} />
                <Detail label="订单ID" value={String(order.id)} />
                <Detail label="提交时间" value={formatDate(order.createdAt)} />
                <Detail label="预估价格" value={formatPrice(order.estimatedPrice)} />
                <Detail label="状态" value={order.status} />
              </dl>
            </section>

            <section className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">客户信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="姓名" value={order.customerName} />
                <Detail label="电话" value={order.phone} />
                <Detail label="微信" value={order.wechat} />
                <Detail label="邮箱" value={order.email || "-"} />
                <Detail label="公司" value={order.company || "-"} />
              </dl>
            </section>

            <section className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">打印信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="材料" value={order.material} />
                <Detail label="颜色" value={order.color || "-"} />
                <Detail label="数量" value={String(order.quantity)} />
              </dl>
            </section>
          </div>

          <section className="mt-6 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">备注</h2>
            <p className="mt-4 whitespace-pre-wrap text-graphite">{order.remark || "无备注"}</p>
          </section>

          <section className="mt-6 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">上传文件</h2>
            <div className="mt-4 space-y-3">
              {order.files.map((file) => (
                <div
                  className="flex flex-col gap-3 border border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  key={file.id}
                >
                  <div>
                    <p className="font-semibold">{file.filename}</p>
                    <p className="text-sm text-graphite">
                      {formatBytes(file.filesize)} · 上传时间：{formatDate(file.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-graphite">
                      材料：{file.material || "-"} · 颜色：{file.color || "-"}
                    </p>
                  </div>
                  <a
                    className="inline-flex bg-ink px-4 py-2 text-sm font-semibold text-white"
                    href={`/api/admin/files/${file.id}/download`}
                  >
                    下载文件
                  </a>
                </div>
              ))}
            </div>
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

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[5rem_1fr] gap-3">
      <dt className="font-semibold text-graphite">{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString("zh-CN", { hour12: false });
}

function formatPrice(value: number) {
  return `¥${value.toFixed(2)}`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}
