import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getPaymentSettings,
  getOrderByIdForCustomer,
  getOrderStatusLogsByOrderId,
  openDatabase,
  type OrderDetail,
  type OrderFileRecord,
  type OrderStatusLogRecord,
  type PaymentSettings,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { CustomerPaymentOptions } from "@/frontend/components/CustomerPaymentOptions";

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

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo={`/account/orders/${order.id}`} />
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-semibold text-graphite" href="/account">
                返回我的账户
              </Link>
              <p className="mt-6 text-sm font-semibold uppercase tracking-[0.18em] text-coral">
                {order.orderNo}
              </p>
              <h1 className="mt-3 text-4xl font-bold">订单详情</h1>
            </div>
            <Link className="bg-ink px-5 py-3 text-sm font-semibold text-white" href="/quote">
              再次下单
            </Link>
          </div>

          <section className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="border border-ink/10 bg-white/80 p-6 shadow-sm">
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

            <div className="border border-ink/10 bg-white/80 p-6 shadow-sm lg:col-span-2">
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
                <Detail label="配送备注" value={order.shippingRemark || "-"} />
                <Detail label="快递公司" value={order.shippingCompany || "-"} />
                <Detail label="物流单号" value={order.trackingNumber || "-"} />
              </dl>
            </div>
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">状态时间轴</h2>
            <StatusTimeline order={order} logs={statusLogs} />
          </section>

          <PaymentStatusPanel order={order} paymentSettings={paymentSettings} />

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">管理员备注</h2>
            <p className="mt-4 whitespace-pre-wrap text-sm leading-6 text-graphite">
              {order.adminRemark || "暂无管理员备注"}
            </p>
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">文件明细</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-graphite">
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

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
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
              <p className="mt-5 border border-coral/30 bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
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

function PaymentStatusPanel({
  order,
  paymentSettings,
}: {
  order: OrderDetail;
  paymentSettings: PaymentSettings;
}) {
  if (order.status === "待确认") {
    return (
      <section className="mt-8 border border-coral/30 bg-coral/5 p-6 shadow-sm">
        <h2 className="text-xl font-bold">付款确认</h2>
        <p className="mt-4 text-sm font-semibold text-coral">订单正在人工确认，自动估价仅供参考</p>
        <p className="mt-2 text-sm text-graphite">人工确认最终报价前不显示付款方式。</p>
      </section>
    );
  }

  if (order.status === "待付款") {
    return (
      <section className="mt-8 border border-coral/30 bg-coral/5 p-6 shadow-sm">
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
      <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
        <h2 className="text-xl font-bold">付款状态</h2>
        <p className="mt-4 text-sm font-semibold text-coral">付款已确认，订单已进入生产准备</p>
      </section>
    );
  }

  return null;
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white p-4">
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
  const events =
    logs.length > 0
      ? logs
      : [
          {
            id: 0,
            orderId: order.id,
            fromStatus: null,
            toStatus: order.status,
            operator: "system",
            createdAt: order.createdAt,
          },
        ];

  return (
    <ol className="mt-5 space-y-4">
      {events.map((log) => (
        <li className="grid gap-3 border-l-2 border-coral/60 pl-4 text-sm" key={log.id}>
          <p className="font-semibold">{log.toStatus}</p>
          <p className="text-graphite">
            {formatDate(log.createdAt)}
            {log.fromStatus ? ` · ${log.fromStatus} → ${log.toStatus}` : ""}
          </p>
        </li>
      ))}
    </ol>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { hour12: false });
}

function formatMoney(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatLeadTime(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `约 ${Math.ceil(value)} 小时` : "以人工确认为准";
}

function formatAddress(order: OrderDetail) {
  return [order.addressRegion, order.addressDetail].filter(Boolean).join(" ") || "-";
}

function formatTotalQuantity(files: OrderFileRecord[]) {
  return files.reduce((total, file) => total + (file.quantity || 0), 0);
}
