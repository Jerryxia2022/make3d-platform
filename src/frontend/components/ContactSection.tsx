const contactItems = [
  "微信：请填写你的微信号",
  "电话：请填写你的手机号",
  "邮箱：21899835@qq.com",
  "服务时间：工作日晚上及周末可处理订单",
];

export function ContactSection() {
  return (
    <section className="surface-card mx-auto w-full max-w-6xl p-6 text-ink">
      <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
        <div>
          <p className="eyebrow">Contact</p>
          <h2 className="mt-3 text-2xl font-bold">联系 Make3D</h2>
        </div>
        <div>
          <dl className="grid gap-3 text-sm text-graphite sm:grid-cols-2">
            {contactItems.map((item) => {
              const [label, value] = item.split("：");

              return (
                <div className="metric-tile px-4 py-3" key={item}>
                  <dt className="font-semibold text-ink">{label}</dt>
                  <dd className="mt-1">{value}</dd>
                </div>
              );
            })}
          </dl>
          <p className="mt-5 leading-7 text-graphite">
            提交模型后，我们会人工确认最终报价和生产安排。
          </p>
        </div>
      </div>
    </section>
  );
}
