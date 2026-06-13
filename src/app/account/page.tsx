import Link from "next/link";
import { redirect } from "next/navigation";
import {
  getWechatAccountByCustomerId,
  listServiceRequestsByCustomerId,
  listOrdersByCustomerId,
  openDatabase,
  type OrderRecord,
  type ServiceRequestRecord,
} from "@/backend/database";
import { getCurrentCustomer } from "@/backend/nextCustomer";
import { maskOpenid } from "@/backend/wechat";
import { ChangePasswordForm } from "@/frontend/components/ChangePasswordForm";
import { CustomerAuthBar } from "@/frontend/components/CustomerAuthBar";
import { WechatBindCard } from "@/frontend/components/WechatBindCard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AccountPage() {
  const customer = await getCurrentCustomer();

  if (!customer) {
    redirect("/account/login");
  }

  const db = openDatabase();

  try {
    const orders = listOrdersByCustomerId(db, customer.id);
    const serviceRequests = listServiceRequestsByCustomerId(db, customer.id);
    const wechatAccount = getWechatAccountByCustomerId(db, customer.id);
    const activeBindCode =
      wechatAccount?.bindCode &&
      wechatAccount.bindCodeExpiresAt &&
      wechatAccount.bindCodeExpiresAt > Date.now()
        ? wechatAccount.bindCode
        : null;

    return (
      <main className="min-h-screen px-6 py-10 text-ink">
        <CustomerAuthBar returnTo="/" />
        <section className="mx-auto w-full max-w-6xl">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">Make3D 会员</p>
              <h1 className="mt-3 text-4xl font-bold">我的账户</h1>
            </div>
            <form action="/api/account/logout?next=/" method="post">
              <button className="border border-ink/20 px-4 py-2 text-sm font-semibold" type="submit">
                退出登录
              </button>
            </form>
          </div>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">用户资料</h2>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Detail label="姓名" value={customer.name} />
              <Detail label="手机号" value={customer.phone} />
              <Detail label="微信" value={customer.wechat} />
              <Detail label="邮箱" value={customer.email || "-"} />
            </div>
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">修改密码</h2>
            <p className="mt-2 text-sm text-graphite">用于保护报价、订单和收货信息。</p>
            <ChangePasswordForm />
          </section>

          <WechatBindCard
            bound={Boolean(wechatAccount?.openid)}
            initialBindCode={activeBindCode}
            initialExpiresAt={activeBindCode ? wechatAccount?.bindCodeExpiresAt : null}
            maskedOpenid={maskOpenid(wechatAccount?.openid)}
            subscribed={Boolean(wechatAccount?.subscribed)}
          />

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">我的订单</h2>
                <p className="mt-2 text-sm text-graphite">查看已提交订单的生产状态和交货期。</p>
              </div>
              <Link className="bg-ink px-4 py-2 text-sm font-semibold text-white" href="/quote">
                再次下单
              </Link>
            </div>
            <OrderTable orders={orders} />
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-xl font-bold">我的非标准需求</h2>
                <p className="mt-2 text-sm text-graphite">模型修改、工装夹具和研发咨询需求会在这里同步状态。</p>
              </div>
              <Link className="border border-ink/20 bg-white px-4 py-2 text-sm font-semibold" href="/request/design">
                提交修改需求
              </Link>
            </div>
            <ServiceRequestList requests={serviceRequests} />
          </section>

          <section className="mt-8 border border-ink/10 bg-white/80 p-6 shadow-sm">
            <h2 className="text-xl font-bold">我的历史报价</h2>
            <p className="mt-2 text-sm text-graphite">
              历史报价基于已提交订单保存，最终价格以人工确认为准。
            </p>
            <OrderTable orders={orders} compact />
          </section>
        </section>
      </main>
    );
  } finally {
    db.close();
  }
}

function OrderTable({ orders, compact = false }: { orders: OrderRecord[]; compact?: boolean }) {
  if (orders.length === 0) {
    return (
      <div className="mt-5 border border-ink/10 bg-white p-5 text-sm text-graphite">
        暂无订单记录。
      </div>
    );
  }

  return (
    <div className={compact ? "mt-5 grid gap-3 lg:grid-cols-2" : "mt-5 grid gap-4 lg:grid-cols-2"}>
      {orders.map((order) => (
        <article className="border border-ink/10 bg-white p-4 shadow-sm" key={order.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <Link className="font-bold text-coral" href={`/account/orders/${order.id}`}>
                {order.orderNo}
              </Link>
              <p className="mt-1 text-xs text-graphite">{formatDate(order.createdAt)} · {formatFileCount(order)}</p>
            </div>
            <StatusTag status={order.status} />
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <CardMetric label="金额" value={formatMoney(order.finalPrice ?? order.payablePrice ?? order.estimatedPrice)} />
            <CardMetric label="交付" value={formatLeadTime(order.finalLeadTimeHours ?? order.estimatedLeadTimeHours)} />
            <CardMetric label="文件" value={formatFileCount(order)} />
          </div>
          {!compact ? (
            <div className="mt-4 flex items-center justify-between gap-3 border-t border-ink/10 pt-4">
              <p className="text-xs text-graphite">
                {order.status === "待付款" ? "请按最终报价付款" : "状态、物流和备注在详情页同步"}
              </p>
              <Link
                className={order.status === "待付款" ? "shrink-0 bg-ink px-4 py-2 text-sm font-semibold text-white" : "shrink-0 border border-ink/20 px-4 py-2 text-sm font-semibold text-ink"}
                href={`/account/orders/${order.id}`}
              >
                {order.status === "待付款" ? "查看付款方式" : "查看详情"}
              </Link>
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function ServiceRequestList({ requests }: { requests: ServiceRequestRecord[] }) {
  if (requests.length === 0) {
    return (
      <div className="mt-5 border border-ink/10 bg-white p-5 text-sm text-graphite">
        暂无非标准需求记录。
      </div>
    );
  }

  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      {requests.map((request) => (
        <article className="border border-ink/10 bg-white p-4 shadow-sm" key={request.id}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="font-bold">{request.projectName}</p>
              <p className="mt-1 text-xs text-graphite">
                {formatRequestType(request.requestType)} · {formatDate(request.createdAt)}
              </p>
            </div>
            <StatusTag status={request.status} />
          </div>
          <div className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
            <CardMetric label="预算" value={request.budgetRange} />
            <CardMetric label="交付" value={request.expectedDeliveryTime || "待评估"} />
            <CardMetric label="附件" value={`${request.fileCount} 个`} />
          </div>
        </article>
      ))}
    </div>
  );
}

function CardMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-paper/60 px-3 py-2">
      <p className="text-xs font-semibold text-graphite">{label}</p>
      <p className="mt-1 font-bold">{value}</p>
    </div>
  );
}

function StatusTag({ status }: { status: string }) {
  const active = status === "待付款" || status === "待评估";
  return (
    <span className={active ? "inline-flex border border-coral/30 bg-coral/10 px-2 py-1 text-xs font-bold text-coral" : "inline-flex border border-mint/30 bg-mint/10 px-2 py-1 text-xs font-bold text-ink"}>
      {status}
    </span>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-ink/10 bg-white p-4">
      <p className="text-xs font-semibold uppercase tracking-[0.12em] text-graphite">{label}</p>
      <p className="mt-2 font-semibold">{value}</p>
    </div>
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

function formatFileCount(order: OrderRecord) {
  return `${Math.max(order.fileCount || 0, 0)} 个`;
}

function formatRequestType(type: ServiceRequestRecord["requestType"]) {
  return type === "design" ? "模型修改与打印" : "工装夹具 / 研发咨询";
}
