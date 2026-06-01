const materials = [
  { name: "PLA", price: "0.15元/克" },
  { name: "PETG", price: "0.25元/克" },
  { name: "ABS", price: "0.30元/克" },
];

const supportedFormats = ["STL", "3MF", "STEP", "STP"];

export default function QuotePage() {
  return (
    <main className="min-h-screen px-6 py-8 text-ink">
      <section className="mx-auto grid w-full max-w-6xl gap-8 py-8 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-coral">
            上传模型获取报价
          </p>
          <h1 className="mt-4 text-4xl font-bold sm:text-5xl">打印报价</h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-graphite">
            当前页面先提供 V1.0 报价流程外壳，数据库、文件上传和后台功能将在后续阶段实现。
          </p>
          <div className="mt-8 space-y-4">
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">支持格式</h2>
              <p className="mt-3 text-graphite">{supportedFormats.join(" / ")}</p>
              <p className="mt-2 text-sm text-graphite">单文件最大 50MB</p>
            </div>
            <div className="border border-ink/10 bg-white/70 p-5">
              <h2 className="text-lg font-semibold">报价说明</h2>
              <p className="mt-3 text-graphite">
                价格 = 材料费 + 设备费 + 人工费，最低消费 20 元，人工处理费 10 元。
              </p>
              <p className="mt-3 font-semibold text-coral">
                此价格为系统预估，最终价格以人工确认为准。
              </p>
            </div>
          </div>
        </div>

        <form className="space-y-6 border border-ink/10 bg-white/75 p-6 shadow-sm">
          <div>
            <label className="block text-sm font-semibold" htmlFor="model">
              模型文件
            </label>
            <input
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 text-sm"
              disabled
              id="model"
              type="file"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold" htmlFor="material">
              材料
            </label>
            <select
              className="mt-2 w-full border border-ink/20 bg-white px-3 py-3"
              defaultValue="PLA"
              id="material"
            >
              {materials.map((material) => (
                <option key={material.name} value={material.name}>
                  {material.name} - {material.price}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              颜色
              <input
                className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
                placeholder="例如：白色"
              />
            </label>
            <label className="block text-sm font-semibold">
              数量
              <input
                className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
                defaultValue={1}
                min={1}
                type="number"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-semibold">
              姓名
              <input className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal" />
            </label>
            <label className="block text-sm font-semibold">
              电话
              <input className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal" />
            </label>
          </div>

          <label className="block text-sm font-semibold">
            微信
            <input className="mt-2 w-full border border-ink/20 bg-white px-3 py-3 font-normal" />
          </label>

          <label className="block text-sm font-semibold">
            备注
            <textarea
              className="mt-2 min-h-28 w-full border border-ink/20 bg-white px-3 py-3 font-normal"
              placeholder="补充尺寸、强度、交期等要求"
            />
          </label>

          <button
            className="w-full bg-ink px-5 py-3 font-semibold text-white"
            disabled
            type="button"
          >
            基础框架阶段，暂不提交
          </button>
        </form>
      </section>
    </main>
  );
}
