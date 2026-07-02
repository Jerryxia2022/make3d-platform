import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getPaymentSettings,
  listCustomerServiceRequestsForCustomer,
  listOrderPaymentsByOrderId,
  getOrderByIdForCustomer,
  getOrderStatusLogsByOrderId,
  openDatabase,
  type OrderDetail,
  type OrderFileRecord,
  type OrderPaymentRecord,
  type CustomerServiceRequestRecord,
  type OrderStatusLogRecord,
  type PaymentSettings,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { CustomerPaymentOptions } from "@/frontend/components/CustomerPaymentOptions";
import { StlModelPreview } from "@/frontend/components/StlModelPreview";
import { StatusPill } from "@/frontend/components/UiPrimitives";
import { formatBeijingDateTime } from "@/shared/dateTime";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function CustomerOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const { id } = await params;
  const db = openDatabase();

  try {
    const order = getOrderByIdForCustomer(db, Number(id), customer.id);
    const statusLogs = getOrderStatusLogsByOrderId(db, order.id);
    const paymentSettings = getPaymentSettings(db);
    const paymentRecords = listOrderPaymentsByOrderId(db, order.id);
    const serviceRequests = listCustomerServiceRequestsForCustomer(db, customer.id, order.id);

    return (
      <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
        <CustomerAuthBar returnTo={`/account/orders/${order.id}`} />
        <section className="mx-auto w-full max-w-[1280px] py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-semibold text-graphite" href="/account">
                返回我的账户
              </Link>
              <p className="eyebrow mt-6">
                {order.orderNo}
              </p>
              <h1 className="mt-3 text-4xl font-bold">订单详情</h1>
            </div>
            <Link className="btn-primary px-5 py-3" href="/quote">
              再次下单
            </Link>
          </div>

          <CurrentStatusPanel order={order} />

          <section className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="surface-card p-5">
              <h2 className="text-xl font-bold">订单信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="订单编号" value={order.orderNo} />
                <Detail label="提交时间" value={formatDate(order.createdAt)} />
                <Detail label="自动报价" value={formatMoney(order.payablePrice ?? order.estimatedPrice)} />
                <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
                <Detail label="调价原因" value={order.priceAdjustmentReason || "-"} />
                <Detail label="总价" value={formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)} />
                <Detail label="预计交货期" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
                <Detail label="订单状态" value={order.status} />
              </dl>
            </div>

            <div className="surface-card p-5 lg:col-span-2">
              <h2 className="text-xl font-bold">联系与收货信息</h2>
              <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
                <Detail label="姓名" value={order.customerName} />
                <Detail label="手机号" value={order.phone} />
                <Detail label="微信" value={order.wechat} />
                <Detail label="邮箱" value={order.email || "-"} />
                <Detail label="配送方式" value={order.shippingMethod || "-"} />
                <Detail label="收件人" value={order.recipientName || "-"} />
                <Detail label="收件手机号" value={order.recipientPhone || "-"} />
                <Detail label="收货地址" value={formatAddress(order)} />
                <Detail label="地址标签" value={order.shippingLabel || "-"} />
                <Detail label="邮编" value={order.shippingPostalCode || "-"} />
                <Detail label="配送备注" value={order.shippingRemark || "-"} />
                <Detail label="快递公司" value={order.shippingCompany || "-"} />
                <Detail label="物流单号" value={order.trackingNumber || "-"} />
              </dl>
            </div>
          </section>

          <section className="surface-card mt-5 p-5">
            <h2 className="text-xl font-bold">状态时间轴</h2>
            <StatusTimeline order={order} logs={statusLogs} />
          </section>

          <PaymentStatusPanel order={order} paymentRecords={paymentRecords} paymentSettings={paymentSettings} />

          <CustomerServiceRecords records={serviceRequests} />

          <section className="surface-card mt-5 p-5">
            <h2 className="text-xl font-bold">管理员备注</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-graphite">
              {order.adminRemark || "暂无管理员备注"}
            </p>
          </section>

          <section className="surface-card mt-5 p-5">
            <h2 className="text-xl font-bold">文件明细</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[920px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-graphite">
                    <th className="py-3 pr-4 font-semibold">模型预览</th>
                    <th className="py-3 pr-4 font-semibold">文件名称</th>
                    <th className="py-3 pr-4 font-semibold">材料</th>
                    <th className="py-3 pr-4 font-semibold">颜色</th>
                    <th className="py-3 pr-4 font-semibold">数量</th>
                    <th className="py-3 pr-4 font-semibold">单价</th>
                    <th className="py-3 pr-4 font-semibold">小计</th>
                  </tr>
                </thead>
                <tbody>
                  {order.files.map((file) => (
                    <tr className="border-b border-ink/10" key={file.id}>
                      <td className="py-3 pr-4 align-top">
                        <StlModelPreview
                          color={file.color}
                          compact
                          dimensions={getFileDimensions(file)}
                          fileUrl={`/api/account/files/${file.id}/download`}
                          filename={file.filename}
                          filesize={file.filesize}
                          material={file.material}
                          quantity={file.quantity}
                          quoteStatus={order.status}
                        />
                      </td>
                      <td className="py-3 pr-4 font-semibold">{file.filename}</td>
                      <td className="py-3 pr-4">{file.material || "-"}</td>
                      <td className="py-3 pr-4">{file.color || "-"}</td>
                      <td className="py-3 pr-4">{file.quantity}</td>
                      <td className="py-3 pr-4">{formatMoney(file.unitPrice)}</td>
                      <td className="py-3 pr-4">{formatMoney(file.subtotalPrice)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="surface-card mt-5 p-5">
            <h2 className="text-xl font-bold">订单汇总</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-3">
              <Detail label="文件数量" value={`${order.files.length} 个`} />
              <Detail label="总数量" value={`${formatTotalQuantity(order.files)} 件`} />
              <Detail label="自动报价" value={formatMoney(order.payablePrice ?? order.estimatedPrice)} />
              <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
              <Detail label="总价" value={formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)} />
              <Detail label="预计交货期" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
              <Detail label="订单状态" value={order.status} />
            </dl>
            {order.status === "待付款" ? (
              <p className="notice-warning mt-5 px-4 py-3 text-sm font-semibold">
                请联系工作人员完成付款
              </p>
            ) : null}
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

function CurrentStatusPanel({ order }: { order: OrderDetail }) {
  const statusText = getCustomerStatusText(order);

  return (
    <section className="surface-card mt-5 p-5">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-coral">当前状态</p>
            <StatusPill status={order.status} />
          </div>
          <h2 className="mt-2 text-2xl font-bold">{statusText}</h2>
        </div>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <Detail label="订单编号" value={order.orderNo} />
          <Detail label="预计交货期" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
        </div>
      </div>
    </section>
  );
}

function PaymentStatusPanel({
  order,
  paymentRecords,
  paymentSettings,
}: {
  order: OrderDetail;
  paymentRecords: OrderPaymentRecord[];
  paymentSettings: PaymentSettings;
}) {
  if (order.status === "待确认") {
    return (
      <section className="notice-warning mt-5 p-5">
        <h2 className="text-xl font-bold">付款确认</h2>
        <p className="mt-4 text-sm font-semibold text-coral">订单正在人工确认，自动估价仅供参考</p>
        <p className="mt-2 text-sm text-graphite">人工确认最终报价前不显示付款方式。</p>
      </section>
    );
  }

  if (order.status === "待付款") {
    return (
      <section className="notice-warning mt-5 p-5">
        <h2 className="text-xl font-bold">付款说明</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
          <Detail label="最终报价" value={formatMoney(order.finalPrice)} />
          <Detail label="预计交货期" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
        </dl>
        <p className="mt-5 text-sm font-semibold text-coral">
          请按最终报价付款，付款时请备注订单编号或注册手机号，便于我们核对。
        </p>
        <CustomerPaymentOptions settings={paymentSettings} />
        <p className="mt-5 text-sm font-semibold text-graphite">
          付款完成后，工作人员核对到账后会更新订单状态。
        </p>
      </section>
    );
  }

  if (order.status === "已付款") {
    return (
      <section className="surface-card mt-5 p-5">
        <h2 className="text-xl font-bold">生产进度</h2>
        <p className="mt-4 text-sm font-semibold text-coral">付款已确认。</p>
        <p className="mt-2 text-sm text-graphite">订单已进入生产准备，后续将更新为生产中。</p>
        <PaymentRecordSummary records={paymentRecords} />
      </section>
    );
  }

  if (["排产中", "生产中", "后处理", "已发货", "已完成"].includes(order.status)) {
    const customerStage = getCustomerFacingStage(order.status);

    return (
      <section className="surface-card mt-5 p-5">
        <h2 className="text-xl font-bold">生产与物流</h2>
        <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <Detail label="当前状态" value={customerStage} />
          <Detail label="预计完成" value={formatOptionalDate(order.estimatedFinishAt)} />
          <Detail label="发货时间" value={formatOptionalDate(order.shippedAt)} />
        </dl>
        {order.status === "已发货" ? (
          <div className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
            <Detail label="快递公司" value={order.shippingCompany || "-"} />
            <Detail label="运单号" value={order.trackingNumber || "-"} />
          </div>
        ) : null}
        <PaymentRecordSummary records={paymentRecords} />
      </section>
    );
  }

  return null;
}

function PaymentRecordSummary({ records }: { records: OrderPaymentRecord[] }) {
  if (records.length === 0) {
    return null;
  }

  return (
    <div className="mt-5 grid gap-3 text-sm sm:grid-cols-3">
      {records.map((record) => (
        <div className="metric-tile p-4" key={record.id}>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">
            {formatPaymentMethod(record.paymentMethod)}
          </p>
          <p className="mt-2 font-bold">{formatCents(record.paidAmountCents)}</p>
          <p className="mt-1 text-xs text-graphite">{formatOptionalDate(record.paidAt)}</p>
        </div>
      ))}
    </div>
  );
}

function CustomerServiceRecords({ records }: { records: CustomerServiceRequestRecord[] }) {
  return (
    <section className="surface-card mt-5 p-5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold">客服记录</h2>
          <p className="mt-2 text-sm text-graphite">需要补充信息时，可使用右下角在线咨询继续提交。</p>
        </div>
      </div>
      {records.length === 0 ? (
        <p className="mt-4 text-sm text-graphite">暂无关联客服记录。</p>
      ) : (
        <div className="mt-4 grid gap-3">
          {records.map((record) => (
            <article className="surface-soft p-4 text-sm" key={record.id}>
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill status={record.status} />
                <span className="text-xs text-graphite">{formatOptionalDate(record.createdAt)}</span>
              </div>
              <p className="mt-3 whitespace-pre-wrap leading-6">{record.message}</p>
              {record.customerVisibleReply ? (
                <p className="notice-success mt-3 px-3 py-2 text-sm font-semibold">
                  回复：{record.customerVisibleReply}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function StatusTimeline({
  order,
  logs,
}: {
  order: OrderDetail;
  logs: OrderStatusLogRecord[];
}) {
  const items = buildTimelineItems(order, logs);

  return (
    <ol className="mt-5 grid gap-3 md:grid-cols-3">
      {items.map((item) => (
        <li
          className={
            item.completed
              ? "notice-success px-4 py-3 text-sm"
              : "surface-soft px-4 py-3 text-sm text-graphite"
          }
          key={item.label}
        >
          <p className="font-semibold">{item.label}</p>
          <p className="mt-2">{item.completed && item.time ? formatDate(item.time) : "未完成"}</p>
        </li>
      ))}
    </ol>
  );
}

function buildTimelineItems(order: OrderDetail, logs: OrderStatusLogRecord[]) {
  const statusOrder = ["待确认", "待付款", "已付款", "排产中", "生产中", "后处理", "已发货", "已完成"];
  const currentIndex = statusOrder.indexOf(order.status);
  const hasReached = (status: string) => currentIndex >= statusOrder.indexOf(status);
  const findLogTime = (status: string) =>
    [...logs].reverse().find((log) => log.toStatus === status)?.createdAt || null;

  return [
    { label: "已提交订单", completed: true, time: order.createdAt },
    {
      label: "已确认报价",
      completed: hasReached("待付款"),
      time: findLogTime("待付款") || order.finalPriceUpdatedAt,
    },
    { label: "待付款", completed: hasReached("待付款"), time: findLogTime("待付款") },
    { label: "已付款", completed: hasReached("已付款"), time: findLogTime("已付款") || order.paymentConfirmedAt },
    {
      label: "生产中",
      completed: hasReached("排产中") || hasReached("生产中") || hasReached("后处理"),
      time: findLogTime("生产中") || findLogTime("排产中") || order.actualStartAt,
    },
    { label: "已发货", completed: hasReached("已发货"), time: findLogTime("已发货") || order.shippedAt },
    { label: "已完成", completed: hasReached("已完成"), time: findLogTime("已完成") || order.actualFinishAt },
  ];
}

function formatDate(value: string) {
  return formatBeijingDateTime(value);
}

function formatOptionalDate(value?: string | null) {
  return value ? formatDate(value) : "-";
}

function getCustomerStatusText(order: OrderDetail) {
  const textByStatus: Record<string, string> = {
    待确认: "订单已提交，正在确认最终报价。",
    待付款: "最终报价已确认，请按页面提示完成付款。",
    已付款: "付款已确认，订单已进入生产准备。",
    排产中: "订单正在生产中。",
    生产中: "订单正在生产中。",
    后处理: "订单正在生产中。",
    已发货: "订单已发货，请留意物流信息。",
    已完成: "订单已完成，感谢使用 Make3D。",
    已取消: "订单已取消，如需继续请重新提交订单。",
  };

  return textByStatus[order.status] || "订单状态已更新。";
}

function getCustomerFacingStage(status: string) {
  if (status === "已发货") {
    return "已发货";
  }

  if (status === "已完成") {
    return "已完成";
  }

  if (["排产中", "生产中", "后处理"].includes(status)) {
    return "生产中";
  }

  return status;
}


function formatMoney(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatCents(value: number | null) {
  return value == null ? "-" : `${(value / 100).toFixed(2)} 元`;
}

function formatPaymentMethod(value: string | null) {
  const labels: Record<string, string> = {
    wechat: "微信转账",
    alipay: "支付宝转账",
    bank_transfer: "银行转账",
    manual: "人工确认",
  };

  return value ? labels[value] || value : "人工确认";
}

function formatLeadTime(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `约 ${Math.ceil(value)} 小时` : "以人工确认为准";
}

function formatAddress(order: OrderDetail) {
  const snapshotAddress = [
    order.shippingProvince,
    order.shippingCity,
    order.shippingDistrict,
    order.shippingDetailAddress,
  ]
    .filter(Boolean)
    .join(" ");

  return snapshotAddress || [order.addressRegion, order.addressDetail].filter(Boolean).join(" ") || "-";
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

function formatTotalQuantity(files: OrderFileRecord[]) {
  return files.reduce((total, file) => total + (file.quantity || 0), 0);
}
