import Link from "next/link";
import { redirect } from "next/navigation";
import { getPaymentSettings, openDatabase } from "@/backend/database";
import { requireAdminSession } from "@/backend/nextAdmin";
import { AdminBrand } from "@/frontend/components/BrandLogo";
import { AdminPaymentSettingsForm } from "@/frontend/components/AdminPaymentSettingsForm";

export default async function AdminPaymentSettingsPage() {
  if (!(await requireAdminSession())) {
    redirect("/admin/login");
  }

  const db = openDatabase();
  const settings = getPaymentSettings(db);
  db.close();

  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto w-full max-w-3xl">
        <div className="flex items-center justify-between gap-4">
          <AdminBrand />
          <Link className="font-semibold text-graphite" href="/admin/orders">
            返回订单列表
          </Link>
        </div>
        <p className="eyebrow mt-6">Payment Settings</p>
        <h1 className="mt-3 text-4xl font-bold">付款设置</h1>
        <p className="mt-4 text-sm leading-6 text-graphite">
          这里仅配置客户待付款页面展示的收款码路径和外部付款链接。客户不能上传付款截图，
          到账核对仍由管理员在订单详情页人工确认。
        </p>
        <AdminPaymentSettingsForm settings={settings} />
      </section>
    </main>
  );
}
