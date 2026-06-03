import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getLatestSliceJobByOrderId,
  getOrderById,
  openDatabase,
  type OrderDetail,
  type OrderFileRecord,
  type SliceJobRecord,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { getPrusaSlicerConfig } from "@/backend/slicer";
import { AdminSlicerTestButton } from "@/frontend/components/AdminSlicerTestButton";
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
  const slicerConfig = getPrusaSlicerConfig();

  try {
    const order = getOrderById(db, Number(id));
    const latestSliceJob = getLatestSliceJobByOrderId(db, order.id);

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
                <Detail label="预估价格" value={formatPriceRange(order)} />
                <Detail label="预估货期" value={formatLeadTimeRange(order)} />
                <Detail label="包装费" value={formatMoney(order.packagingFee)} />
                <Detail label="运费" value={formatMoney(order.shippingFee)} />
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
            <h2 className="text-xl font-bold">配送信息</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="配送方式" value={order.shippingMethod || "-"} />
              <Detail label="预估运费" value={order.shippingFeeEstimate || "-"} />
              <Detail label="收件人" value={order.recipientName || "-"} />
              <Detail label="手机号" value={order.recipientPhone || "-"} />
              <Detail label="省市区" value={order.addressRegion || "-"} />
              <Detail label="详细地址" value={order.addressDetail || "-"} />
              <Detail label="配送备注" value={order.shippingRemark || "-"} />
            </dl>
          </section>

          <section className="mt-6 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">备注</h2>
            <p className="mt-4 whitespace-pre-wrap text-graphite">{order.remark || "无备注"}</p>
          </section>

          <section className="mt-6 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">自动切片报价</h2>
                <p className="mt-2 text-sm text-graphite">
                  {slicerConfig.enabled
                    ? "可在后台测试 PrusaSlicer 自动切片报价。"
                    : "自动切片报价尚未启用。"}
                </p>
              </div>
              <AdminSlicerTestButton
                enabled={slicerConfig.enabled}
                orderId={order.id}
                profilePath={slicerConfig.profilePath}
              />
            </div>
            <SliceJobResult job={latestSliceJob} />
          </section>

          <section className="mt-6 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">上传文件</h2>
            <div className="mt-4 space-y-3">
              {order.files.map((file) => (
                <div
                  className="flex flex-col gap-3 border border-ink/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                  key={file.id}
                >
                  <div className="space-y-1">
                    <p className="font-semibold">{file.filename}</p>
                    <p className="text-sm text-graphite">
                      {formatBytes(file.filesize)} · 上传时间：{formatDate(file.createdAt)}
                    </p>
                    <p className="text-sm text-graphite">
                      材料：{file.material || "-"} · 颜色：{file.color || "-"}
                    </p>
                    <p className="text-sm text-graphite">尺寸：{formatDimensions(file)}</p>
                    <p className="text-sm text-graphite">
                      文件估价：{formatFilePriceRange(file)} · 文件工期：
                      {formatFileLeadTimeRange(file)}
                    </p>
                    {file.riskNotice ? (
                      <p className="text-sm font-semibold text-coral">{file.riskNotice}</p>
                    ) : null}
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

function SliceJobResult({ job }: { job: SliceJobRecord | null }) {
  if (!job) {
    return <p className="mt-4 text-sm text-graphite">暂无切片记录</p>;
  }

  if (job.status !== "success") {
    return (
      <div className="mt-5 border border-coral/30 bg-coral/5 p-4 text-sm">
        <p className="font-semibold text-coral">最近一次切片记录：{job.status}</p>
        <p className="mt-2 text-graphite">{job.errorMessage || "切片失败"}</p>
      </div>
    );
  }

  return (
    <div className="mt-5 border border-ink/10 bg-white p-4">
      <h3 className="text-base font-bold">最近一次切片记录</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="耗材重量" value={formatWeight(job.filamentWeightG)} />
        <Detail label="打印时间" value={formatSlicePrintTime(job.printTimeSeconds)} />
        <Detail label="自动计算价格" value={formatSliceMoney(job.estimatedPrice)} />
        <Detail label="材料费" value={formatSliceMoney(job.materialFee)} />
        <Detail label="工时费" value={formatSliceMoney(job.timeFee)} />
        <Detail label="使用材料" value={job.material || "-"} />
        <Detail label="使用配置" value="0.4喷嘴 / 0.2层高 / 50%填充" />
      </dl>
      <div className="mt-5 border-t border-ink/10 pt-4">
        <h4 className="text-sm font-bold">原始解析字段</h4>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="长度mm" value={formatOptionalNumber(job.rawFilamentUsedMm)} />
          <Detail label="体积cm3" value={formatOptionalNumber(job.rawFilamentUsedCm3)} />
          <Detail label="重量g" value={formatOptionalNumber(job.rawFilamentUsedG)} />
          <Detail label="重量来源" value={job.filamentWeightSource || "-"} />
          <Detail label="材料密度" value={formatOptionalNumber(job.materialDensity)} />
        </dl>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(`${value}Z`).toLocaleString("zh-CN", { hour12: false });
}

function formatPriceRange(order: OrderDetail) {
  if (order.estimatedPriceMin == null || order.estimatedPriceMax == null) {
    return order.estimatedPrice ? `¥${order.estimatedPrice.toFixed(2)}` : "-";
  }

  return `¥${order.estimatedPriceMin.toFixed(2)} - ¥${order.estimatedPriceMax.toFixed(2)}`;
}

function formatLeadTimeRange(order: OrderDetail) {
  if (order.estimatedLeadTimeMinHours == null || order.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `${order.estimatedLeadTimeMinHours}-${order.estimatedLeadTimeMaxHours} 小时`;
}

function formatFilePriceRange(file: OrderFileRecord) {
  if (file.estimatedPriceMin == null || file.estimatedPriceMax == null) {
    return "-";
  }

  return `¥${file.estimatedPriceMin.toFixed(2)} - ¥${file.estimatedPriceMax.toFixed(2)}`;
}

function formatFileLeadTimeRange(file: OrderFileRecord) {
  if (file.estimatedLeadTimeMinHours == null || file.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `${file.estimatedLeadTimeMinHours}-${file.estimatedLeadTimeMaxHours} 小时`;
}

function formatDimensions(file: OrderFileRecord) {
  if (file.boundingBoxX == null && file.boundingBoxY == null && file.boundingBoxZ == null) {
    return "-";
  }

  return `${file.boundingBoxX || "-"} × ${file.boundingBoxY || "-"} × ${file.boundingBoxZ || "-"} mm`;
}

function formatMoney(value: number | null) {
  return value == null ? "-" : `¥${value.toFixed(2)}`;
}

function formatWeight(value: number | null) {
  return value == null ? "-" : `${value.toFixed(2)} g`;
}

function formatSliceMoney(value: number | null) {
  return value == null ? "-" : `${value.toFixed(2)} 元`;
}

function formatOptionalNumber(value: number | null) {
  return value == null ? "-" : String(value);
}

function formatSlicePrintTime(value: number | null) {
  if (value == null) {
    return "-";
  }

  const hours = Math.floor(value / 3600);
  const minutes = Math.round((value % 3600) / 60);

  return `${hours} 小时 ${minutes} 分钟`;
}

function formatBytes(value: number) {
  if (value < 1024) {
    return `${value} B`;
  }

  return `${(value / 1024).toFixed(1)} KB`;
}
