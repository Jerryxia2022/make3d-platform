import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  getPaymentSettings,
  getOrderByIdForCustomer,
  openDatabase,
  type OrderDetail,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { CustomerPaymentOptions } from "@/frontend/components/CustomerPaymentOptions";

export default async function CustomerOrderConfirmPage({
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
    const paymentSettings = getPaymentSettings(db);

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo={`/account/orders/${order.id}/confirm`} />
        <section className="mx-auto w-full max-w-6xl">
          <Link className="font-semibold text-graphite" href={`/account/orders/${order.id}`}>
            查看订单详情
          </Link>
          <div className="mt-6 border border-coral/30 bg-coral/10 p-6">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
              {order.orderNo}
            </p>
            <h1 className="mt-3 text-4xl font-bold">订单确认</h1>
            <p className="mt-4 text-base font-semibold text-coral">
              订单已提交，请等待人工确认最终价格。确认后我们会通知您付款。
            </p>
          </div>

          <section className="mt-8 grid gap-6 lg:grid-cols-3">
            <div className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">订单信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="订单编号" value={order.orderNo} />
                <Detail label="订单状态" value={order.status} />
                <Detail label="预计交货期" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
              </dl>
            </div>

            <div className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">配送信息</h2>
              <dl className="mt-5 grid gap-4 text-sm">
                <Detail label="配送方式" value={order.shippingMethod || "-"} />
                <Detail label="运费" value={formatMoney(order.shippingFee)} />
                <Detail label="收货信息" value={formatAddress(order)} />
              </dl>
            </div>

            <div className="border border-ink/10 bg-white/80 p-6 shadow-sm">
              <h2 className="text-xl font-bold">应付总价</h2>
              <p className="mt-5 text-3xl font-bold text-coral">
                {formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)}
              </p>
              <p className="mt-3 text-sm text-graphite">最终价格以人工确认为准。</p>
            </div>
          </section>

          {order.status === "待付款" ? (
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
          ) : null}

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">文件列表</h2>
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
            <h2 className="text-xl font-bold">收货信息</h2>
            <dl className="mt-5 grid gap-4 text-sm sm:grid-cols-2">
              <Detail label="收件人" value={order.recipientName || order.customerName} />
              <Detail label="手机号" value={order.recipientPhone || order.phone} />
              <Detail label="收货地址" value={formatAddress(order)} />
              <Detail label="配送备注" value={order.shippingRemark || "-"} />
            </dl>
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
    <div className="border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}

function formatMoney(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)} 元` : "-";
}

function formatLeadTime(value?: number | null) {
  return typeof value === "number" && Number.isFinite(value)
    ? `约 ${Math.ceil(value)} 小时`
    : "以人工确认为准";
}

function formatAddress(order: OrderDetail) {
  return [order.addressRegion, order.addressDetail].filter(Boolean).join(" ") || "-";
}
