import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getBoundWechatAccountByCustomerId,
  getLatestWechatNotificationByOrderId,
  getOrderById,
  getOrderStatusLogsByOrderId,
  getSliceJobsByOrderId,
  listOrderPaymentsByOrderId,
  openDatabase,
  type OrderDetail,
  type OrderFileRecord,
  type OrderPaymentRecord,
  type OrderStatusLogRecord,
  type SliceJobRecord,
} from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { maskOpenid } from "@/backend/wechat";
import { getPrusaSlicerConfig } from "@/backend/slicer";
import { AdminFinalQuoteForm } from "@/frontend/components/AdminFinalQuoteForm";
import { AdminPaymentConfirmForm } from "@/frontend/components/AdminPaymentConfirmForm";
import { AdminSlicerTestButton } from "@/frontend/components/AdminSlicerTestButton";
import { AdminStatusForm } from "@/frontend/components/AdminStatusForm";
import { AdminBrand } from "@/frontend/components/BrandLogo";
import { CopyTextButton } from "@/frontend/components/CopyTextButton";
import { StlModelPreview } from "@/frontend/components/StlModelPreview";
import { formatBeijingDateTime } from "@/shared/dateTime";

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
    const sliceJobs = getSliceJobsByOrderId(db, order.id);
    const statusLogs = getOrderStatusLogsByOrderId(db, order.id);
    const paymentRecords = listOrderPaymentsByOrderId(db, order.id);
    const wechatAccount = getBoundWechatAccountByCustomerId(db, order.customerId);
    const latestWechatNotification = getLatestWechatNotificationByOrderId(db, order.id);
    const quoteDefaultPrice = order.finalPrice ?? order.payablePrice ?? order.estimatedPrice ?? order.estimatedPriceMax;
    const quoteDefaultLeadTime =
      order.finalLeadTimeHours ?? order.estimatedLeadTimeHours ?? order.estimatedLeadTimeMaxHours;

    return (
      <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-[1450px] py-4">
          <div className="flex items-center justify-between gap-4">
            <AdminBrand />
            <Link className="font-semibold text-graphite" href="/admin/orders">
              返回订单列表
            </Link>
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_25rem] xl:items-start">
            <section className="surface-card p-4">
              <p className="eyebrow">
                {order.orderNo}
              </p>
              <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <h1 className="text-3xl font-bold">订单详情</h1>
                <StatusPill status={order.status} />
              </div>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
                <Detail label="当前状态" value={order.status} />
                <Detail label="最终金额" value={formatMoney(quoteDefaultPrice)} />
                <Detail label="客户" value={`${order.customerName} / ${order.phone}`} />
                <Detail label="下一步" value={getNextAdminAction(order)} />
              </dl>
            </section>
            <div className="grid gap-3">
              <AdminFinalQuoteForm
                finalLeadTimeHours={quoteDefaultLeadTime}
                finalPrice={quoteDefaultPrice}
                orderId={order.id}
                priceAdjustmentReason={order.priceAdjustmentReason}
                productionNote={order.productionNote}
              />
              {order.status === "待付款" ? (
                <AdminPaymentConfirmForm expectedAmount={quoteDefaultPrice || 0} orderId={order.id} />
              ) : null}
              <AdminStatusForm
                actualFinishAt={order.actualFinishAt}
                actualStartAt={order.actualStartAt}
                adminRemark={order.adminRemark}
                assignedPrinter={order.assignedPrinter}
                estimatedFinishAt={order.estimatedFinishAt}
                estimatedStartAt={order.estimatedStartAt}
                internalNote={order.internalNote}
                orderId={order.id}
                productionNote={order.productionNote}
                shippedAt={order.shippedAt}
                shippingCompany={order.shippingCompany}
                shippingNote={order.shippingNote}
                status={order.status}
                trackingNumber={order.trackingNumber}
              />
            </div>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <section className="surface-card p-4">
              <h2 className="text-xl font-bold">订单信息</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="订单编号" value={order.orderNo} />
                <Detail label="订单ID" value={String(order.id)} />
                <Detail label="会员订单" value={order.customerId ? "是" : "否"} />
                <Detail label="客户历史订单数" value={String(order.customerOrderCount)} />
                <Detail label="自动报价" value={formatAutomaticPrice(order)} />
                <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
                <Detail label="最终交货期" value={formatLeadTimeHours(order.finalLeadTimeHours)} />
                <Detail label="调价原因" value={order.priceAdjustmentReason || "-"} />
                <Detail label="最终报价更新时间" value={formatOptionalDate(order.finalPriceUpdatedAt)} />
                <Detail label="预估价格" value={formatPrice(order)} />
                <Detail label="预估货期" value={formatLeadTime(order)} />
                <Detail label="打印费合计" value={formatMoney(order.printFeeTotal)} />
                <Detail label="应付总价" value={formatMoney(order.payablePrice)} />
                <Detail label="预计交货期" value={formatOrderLeadTime(order)} />
                <Detail label="包装费" value={formatMoney(order.packagingFee)} />
                <Detail label="运费" value={formatMoney(order.shippingFee)} />
                <Detail label="状态" value={order.status} />
              </dl>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-xl font-bold">客户信息</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="姓名" value={order.customerName} />
                <Detail label="电话" value={order.phone} />
                <Detail label="微信" value={order.wechat} />
                <Detail label="邮箱" value={order.email || "-"} />
                <Detail label="公司" value={order.company || "-"} />
              </dl>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-xl font-bold">微信公众号</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="绑定状态" value={wechatAccount?.openid ? "已绑定" : "未绑定"} />
                <Detail label="openid" value={maskOpenid(wechatAccount?.openid)} />
                <Detail label="通知状态" value={latestWechatNotification?.sendStatus || "-"} />
                <Detail
                  label="通知错误"
                  value={
                    wechatAccount?.openid
                      ? latestWechatNotification?.errorMessage || "-"
                      : "客户未绑定公众号"
                  }
                />
              </dl>
            </section>

            <section className="surface-card p-4">
              <h2 className="text-xl font-bold">模型与报价</h2>
              <dl className="mt-4 grid gap-3 text-sm">
                <Detail label="材料" value={order.material} />
                <Detail label="颜色" value={order.color || "-"} />
                <Detail label="数量" value={String(order.quantity)} />
                <Detail label="文件数" value={`${order.files.length} 个`} />
                <Detail label="自动报价" value={formatAutomaticPrice(order)} />
                <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
              </dl>
            </section>
          </div>

          <section className="surface-card mt-4 p-5">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">生产管理</h2>
                <p className="mt-1 text-sm text-graphite">排产、打印、后处理和内部交付信息。</p>
              </div>
              <StatusPill status={order.status} />
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="分配打印机" value={order.assignedPrinter || "-"} />
              <Detail label="预计开始时间" value={formatOptionalDate(order.estimatedStartAt)} />
              <Detail label="预计完成时间" value={formatOptionalDate(order.estimatedFinishAt)} />
              <Detail label="实际开始时间" value={formatOptionalDate(order.actualStartAt)} />
              <Detail label="实际完成时间" value={formatOptionalDate(order.actualFinishAt)} />
              <Detail label="生产备注" value={order.productionNote || "-"} />
              <Detail label="内部备注" value={order.internalNote || "-"} />
            </dl>
          </section>

          <section className="surface-card mt-4 p-5">
            <h2 className="text-xl font-bold">配送与物流</h2>
            <div className="notice-success mt-4 p-4 text-sm">
              <p className="font-bold">收货信息</p>
              <p className="mt-2 whitespace-pre-line leading-6">
                {formatShippingCopyBlock(order)}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <CopyTextButton label="复制姓名" text={order.recipientName || ""} />
                <CopyTextButton label="复制电话" text={order.recipientPhone || ""} />
                <CopyTextButton label="复制地址" text={formatShippingAddress(order)} />
                <CopyTextButton label="复制全部" text={formatShippingCopyBlock(order)} />
              </div>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <Detail label="配送方式" value={order.shippingMethod || "-"} />
              <Detail label="预估运费" value={order.shippingFeeEstimate || "-"} />
              <Detail label="收件人" value={order.recipientName || "-"} />
              <Detail label="手机号" value={order.recipientPhone || "-"} />
              <Detail label="收货地址" value={formatShippingAddress(order)} />
              <Detail label="地址标签" value={order.shippingLabel || "-"} />
              <Detail label="邮编" value={order.shippingPostalCode || "-"} />
              <Detail label="配送备注" value={order.shippingRemark || "-"} />
              <Detail label="快递公司" value={order.shippingCompany || "-"} />
              <Detail label="快递单号" value={order.trackingNumber || "-"} />
              <Detail label="发货时间" value={formatOptionalDate(order.shippedAt)} />
              <Detail label="物流备注" value={order.shippingNote || "-"} />
            </dl>
          </section>

          <section className="surface-card mt-4 p-5">
            <h2 className="text-xl font-bold">付款核对</h2>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
              <Detail label="客户姓名" value={order.customerName} />
              <Detail label="注册手机号" value={order.phone} />
              <Detail label="微信号" value={order.wechat} />
              <Detail label="订单编号" value={order.orderNo} />
              <Detail label="付款识别备注建议" value="付款时请备注：订单编号/手机号" />
              <Detail label="付款状态" value={formatPaymentStatus(order.paymentStatus)} />
              <Detail label="付款时间" value={formatOptionalDate(order.paidAt || order.paymentConfirmedAt)} />
              <Detail label="到账方式" value={order.paymentMethod || "-"} />
              <Detail label="确认时间" value={formatOptionalDate(order.paymentConfirmedAt)} />
              <Detail label="确认人" value={order.paymentConfirmedBy || "-"} />
              <Detail label="付款备注" value={order.paymentNote || "-"} />
            </dl>
            <PaymentRecords records={paymentRecords} />
          </section>

          <section className="surface-card mt-4 p-5">
            <h2 className="text-xl font-bold">备注</h2>
            <p className="mt-4 whitespace-pre-wrap text-graphite">{order.remark || "无备注"}</p>
            <h3 className="mt-6 text-base font-bold">生产备注</h3>
            <p className="mt-3 whitespace-pre-wrap text-graphite">{order.productionNote || "无备注"}</p>
            <h3 className="mt-6 text-base font-bold">管理员备注</h3>
            <p className="mt-3 whitespace-pre-wrap text-graphite">{order.adminRemark || "无备注"}</p>
          </section>

          <section className="surface-card mt-4 p-5">
            <h2 className="text-xl font-bold">状态历史</h2>
            <StatusHistory logs={statusLogs} />
          </section>

          <section className="surface-card mt-4 p-5">
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
            <SliceJobResults jobs={sliceJobs} />
          </section>

          <section className="surface-card mt-4 p-5">
            <h2 className="text-xl font-bold">上传文件</h2>
            <div className="mt-4 space-y-3">
              {order.files.map((file) => (
                <div
                  className="surface-soft grid gap-4 px-4 py-3 lg:grid-cols-[9.5rem_minmax(0,1fr)_auto] lg:items-start"
                  key={file.id}
                >
                  <StlModelPreview
                    color={file.color}
                    compact
                    dimensions={getFileDimensions(file)}
                    fileUrl={`/api/admin/files/${file.id}/download`}
                    filename={file.filename}
                    filesize={file.filesize}
                    material={file.material}
                    quantity={file.quantity}
                    quoteStatus={order.status}
                  />
                  <div className="space-y-1">
                    <p className="font-semibold">{file.filename}</p>
                    <p className="text-sm text-graphite">
                      {formatBytes(file.filesize)} · 上传时间：{formatDate(file.createdAt)}
                    </p>
                    <p className="text-sm text-graphite">
                      材料：{file.material || "-"} · 颜色：{file.color || "-"}
                    </p>
                    <p className="text-sm text-graphite">
                      数量：{file.quantity} · 单件价：{formatMoney(file.unitPrice)} · 小计：
                      {formatMoney(file.subtotalPrice)}
                    </p>
                    <p className="text-sm text-graphite">尺寸：{formatDimensions(file)}</p>
                    <p className="text-sm text-graphite">
                      文件估价：{formatFilePrice(file)} · 文件工期：
                      {formatFileLeadTime(file)}
                    </p>
                    {file.riskNotice ? (
                      <p className="text-sm font-semibold text-coral">{file.riskNotice}</p>
                    ) : null}
                  </div>
                  <a
                    className="btn-primary px-4 py-2"
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

function StatusPill({ status }: { status: string }) {
  const toneByStatus: Record<string, string> = {
    待确认: "status-gray",
    待付款: "status-orange",
    已付款: "status-blue",
    排产中: "status-blue",
    生产中: "status-purple",
    后处理: "status-yellow",
    已发货: "status-green",
    已完成: "status-mint",
    已取消: "status-gray",
  };
  return (
    <span className={`status-pill ${toneByStatus[status] || "status-gray"}`}>
      {status}
    </span>
  );
}

function StatusHistory({ logs }: { logs: OrderStatusLogRecord[] }) {
  if (logs.length === 0) {
    return <p className="mt-4 text-sm text-graphite">暂无状态变更记录</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[560px] border-collapse text-left text-sm">
        <thead className="border-b border-ink/10 text-graphite">
          <tr>
            <th className="py-2 pr-4 font-semibold">修改时间</th>
            <th className="py-2 pr-4 font-semibold">原状态</th>
            <th className="py-2 pr-4 font-semibold">新状态</th>
            <th className="py-2 pr-4 font-semibold">操作人</th>
            <th className="py-2 pr-4 font-semibold">备注</th>
          </tr>
        </thead>
        <tbody>
          {logs.map((log) => (
            <tr className="border-b border-ink/5" key={log.id}>
              <td className="py-3 pr-4">{formatDate(log.createdAt)}</td>
              <td className="py-3 pr-4">{log.fromStatus || "-"}</td>
              <td className="py-3 pr-4 font-semibold">{log.toStatus}</td>
              <td className="py-3 pr-4">{log.operator}</td>
              <td className="py-3 pr-4">{log.note || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PaymentRecords({ records }: { records: OrderPaymentRecord[] }) {
  if (records.length === 0) {
    return <p className="mt-5 text-sm text-graphite">暂无付款记录</p>;
  }

  return (
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[760px] border-collapse text-left text-sm">
        <thead className="border-b border-ink/10 text-graphite">
          <tr>
            {["到账时间", "方式", "应收", "实收", "付款人", "流水/备注", "确认人"].map((header) => (
              <th className="py-2 pr-4 font-semibold" key={header}>
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr className="border-b border-ink/10" key={record.id}>
              <td className="py-2 pr-4">{formatOptionalDate(record.paidAt)}</td>
              <td className="py-2 pr-4">{formatPaymentMethod(record.paymentMethod)}</td>
              <td className="py-2 pr-4">{formatCents(record.expectedAmountCents)}</td>
              <td className="py-2 pr-4">{formatCents(record.paidAmountCents)}</td>
              <td className="py-2 pr-4">{record.payerName || "-"}</td>
              <td className="py-2 pr-4">
                {record.platformTradeNo || record.payerReference || record.paymentNote || "-"}
                {record.paymentDifferenceReason ? (
                  <p className="mt-1 text-xs text-coral">差额原因：{record.paymentDifferenceReason}</p>
                ) : null}
              </td>
              <td className="py-2 pr-4">{record.confirmedBy || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SliceJobResults({ jobs }: { jobs: SliceJobRecord[] }) {
  if (jobs.length === 0) {
    return <p className="mt-4 text-sm text-graphite">暂无切片记录</p>;
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <SliceJobResult job={job} key={job.id} />
      ))}
    </div>
  );
}

function SliceJobResult({ job }: { job: SliceJobRecord }) {
  if (!job) {
    return <p className="mt-4 text-sm text-graphite">暂无切片记录</p>;
  }

  if (job.status !== "success") {
    return (
      <div className="notice-warning mt-5 p-4 text-sm">
        <p className="font-semibold text-coral">最近一次切片记录：{job.status}</p>
        <p className="mt-2 text-graphite">{job.errorMessage || "切片失败"}</p>
      </div>
    );
  }

  return (
    <div className="surface-soft mt-5 p-4">
      <h3 className="text-base font-bold">最近一次切片记录</h3>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="耗材重量" value={formatWeight(job.filamentWeightG)} />
        <Detail label="打印时间" value={formatSlicePrintTime(job.printTimeSeconds)} />
        <Detail label="自动计算价格" value={formatSliceMoney(job.estimatedPrice)} />
        <Detail label="材料费" value={formatSliceMoney(job.materialFee)} />
        <Detail label="工时费" value={formatSliceMoney(job.timeFee)} />
        <Detail label="包装费" value={formatSliceMoney(getSlicePackagingFee(job))} />
        <Detail label="预计交货期" value={formatSliceLeadTime(job.printTimeSeconds)} />
        <Detail label="使用材料" value={job.material || "-"} />
        <Detail label="使用配置" value="0.4喷嘴 / 0.2层高 / 50%填充" />
      </dl>
      <div className="mt-5 border-t border-ink/10 pt-4">
        <h4 className="text-sm font-bold">原始解析字段</h4>
        {isVolumeDerivedWeight(job) ? (
          <p className="mt-3 text-sm font-semibold text-coral">克重由体积和材料密度换算</p>
        ) : null}
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <Detail label="长度mm" value={formatOptionalNumber(job.rawFilamentUsedMm)} />
          <Detail label="原始cm3" value={formatOptionalNumber(job.rawFilamentUsedCm3)} />
          <Detail label="重量g" value={formatOptionalNumber(job.rawFilamentUsedG)} />
          <Detail label="重量来源" value={job.filamentWeightSource || "-"} />
          <Detail label="使用密度" value={formatOptionalNumber(job.materialDensity)} />
          <Detail label="换算重量" value={formatWeight(job.filamentWeightG)} />
        </dl>
      </div>
    </div>
  );
}

function formatDate(value: string) {
  return formatBeijingDateTime(value);
}

function formatOptionalDate(value: string | null) {
  return value ? formatDate(value) : "-";
}

function formatAutomaticPrice(order: OrderDetail) {
  return formatMoney(order.payablePrice ?? order.estimatedPrice);
}

function formatPrice(order: OrderDetail) {
  const price = order.estimatedPrice || order.estimatedPriceMax;
  return price ? `¥${price.toFixed(2)}` : "-";
}

function formatLeadTime(order: OrderDetail) {
  if (order.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `约${order.estimatedLeadTimeMaxHours}小时`;
}

function formatLeadTimeHours(value: number | null) {
  return value == null ? "-" : `约${value}小时`;
}

function formatOrderLeadTime(order: OrderDetail) {
  const hours = order.estimatedLeadTimeHours ?? order.estimatedLeadTimeMaxHours;

  return hours == null ? "-" : `约${hours}小时`;
}

function formatShippingAddress(order: OrderDetail) {
  const snapshotAddress = [
    order.shippingProvince,
    order.shippingCityCustom || order.shippingCity,
    order.shippingDistrict,
    order.shippingDetailAddress,
  ]
    .filter(Boolean)
    .join(" ");

  return snapshotAddress || [order.addressRegion, order.addressDetail].filter(Boolean).join(" ") || "-";
}

function formatShippingCopyBlock(order: OrderDetail) {
  return [
    `${order.recipientName || "-"} ${order.recipientPhone || "-"}`,
    formatShippingAddress(order),
  ].join("\n");
}

function getNextAdminAction(order: OrderDetail) {
  if (order.status === "待确认") {
    return "确认最终报价和交期";
  }

  if (order.status === "待付款") {
    return "等待或确认到账";
  }

  if (order.status === "已付款") {
    return "安排生产";
  }

  if (["排产中", "生产中", "后处理"].includes(order.status)) {
    return "更新生产或发货";
  }

  if (order.status === "已发货") {
    return "跟踪物流或完成订单";
  }

  return "查看订单记录";
}

function formatFilePrice(file: OrderFileRecord) {
  if (file.estimatedPriceMax == null) {
    return "-";
  }

  return `¥${file.estimatedPriceMax.toFixed(2)}`;
}

function formatFileLeadTime(file: OrderFileRecord) {
  if (file.estimatedLeadTimeMaxHours == null) {
    return "-";
  }

  return `约${file.estimatedLeadTimeMaxHours}小时`;
}

function formatDimensions(file: OrderFileRecord) {
  if (file.boundingBoxX == null && file.boundingBoxY == null && file.boundingBoxZ == null) {
    return "-";
  }

  return `${file.boundingBoxX || "-"} × ${file.boundingBoxY || "-"} × ${file.boundingBoxZ || "-"} mm`;
}

function getFileDimensions(file: OrderFileRecord) {
  if (file.boundingBoxX == null || file.boundingBoxY == null || file.boundingBoxZ == null) {
    return null;
  }

  return {
    x: file.boundingBoxX,
    y: file.boundingBoxY,
    z: file.boundingBoxZ,
  };
}

function formatMoney(value: number | null) {
  return value == null ? "-" : `¥${value.toFixed(2)}`;
}

function formatPaymentStatus(value: string | null) {
  if (value === "paid") {
    return "已付款";
  }

  if (value === "cancelled") {
    return "已取消";
  }

  return "未付款";
}

function formatCents(value: number | null) {
  return value == null ? "-" : `¥${(value / 100).toFixed(2)}`;
}

function formatPaymentMethod(value: string | null) {
  const labels: Record<string, string> = {
    wechat: "微信转账",
    alipay: "支付宝转账",
    bank_transfer: "银行转账",
    manual: "人工确认",
  };

  return value ? labels[value] || value : "-";
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

function isVolumeDerivedWeight(job: SliceJobRecord) {
  return job.filamentWeightSource === "cm3" && job.rawFilamentUsedCm3 != null;
}

function getSlicePackagingFee(job: SliceJobRecord) {
  if (job.estimatedPrice == null || job.materialFee == null || job.timeFee == null) {
    return null;
  }

  return Math.round((job.estimatedPrice - job.materialFee - job.timeFee) * 100) / 100;
}

function formatSliceLeadTime(value: number | null) {
  if (value == null) {
    return "-";
  }

  return `约${Math.ceil(value / 3600 + 24)}小时`;
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
