import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getOrderByIdForCustomer, openDatabase } from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { ORDER_STATUSES } from "@/backend/orderStatus";
import { getWechatPayPublicAvailability } from "@/backend/wechatPayService";
import { WechatPayPanel } from "@/frontend/components/WechatPayPanel";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const MERCHANT_NAME = "瑞淞Make3D快速制造";

export default async function CustomerOrderPayPage({
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
    const availability = getWechatPayPublicAvailability(customer);
    const amountCents = Math.round((order.finalPrice ?? order.payablePrice ?? order.estimatedPrice ?? 0) * 100);

    return (
      <main className="min-h-screen bg-[#f6f7f9] px-4 py-5 text-ink sm:px-6 lg:px-8">
        <section className="mx-auto w-full max-w-3xl py-5">
          <Link className="font-semibold text-graphite" href={`/account/orders/${order.id}`}>
            返回订单详情
          </Link>
          <p className="eyebrow mt-6">{order.orderNo}</p>
          <h1 className="mt-3 text-4xl font-bold">订单支付</h1>

          <section className="surface-card mt-5 p-5">
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <Detail label="收款商户" value={MERCHANT_NAME} />
              <Detail label="订单编号" value={order.orderNo} />
              <Detail label="支付金额" value={`${(amountCents / 100).toFixed(2)} 元`} />
              <Detail label="订单状态" value={order.status} />
            </dl>
          </section>

          {order.status !== ORDER_STATUSES[1] ? (
            <section className="notice-warning mt-5 p-5 text-sm font-semibold">
              当前订单不是待付款状态，不能创建微信支付。
            </section>
          ) : !availability.enabled || !availability.allowedByTestMode ? (
            <section className="notice-warning mt-5 p-5 text-sm font-semibold">
              微信支付仅对允许的长期TEST账号开放，真实客户入口保持关闭。
            </section>
          ) : (
            <WechatPayPanel
              amountCents={amountCents}
              jsapiAvailable={availability.jsapiAuthReady}
              merchantName={MERCHANT_NAME}
              orderId={order.id}
              orderNo={order.orderNo}
            />
          )}
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
    <div className="metric-tile p-4">
      <p className="text-xs font-semibold uppercase text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
  );
}
