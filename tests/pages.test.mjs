import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("home page contains Make3D service entry, quote CTA, and contact section", async () => {
  const source = await readSource("src/app/page.tsx");

  assert.match(source, /Make3D/);
  assert.match(source, /href="\/quote"/);
  assert.match(source, /ContactSection/);
});

test("quote page exposes V1.1 upload, estimate, shipping, address, and contact fields", async () => {
  const source = await readSource("src/app/quote/page.tsx");
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");

  assert.match(source, /STL/);
  assert.match(source, /3MF/);
  assert.match(source, /STEP/);
  assert.match(source, /PLA/);
  assert.match(source, /PETG/);
  assert.match(source, /ABS/);
  assert.match(source, /ContactSection/);
  assert.match(formSource, /onDrop={handleDrop}/);
  assert.match(formSource, /multiple/);
  assert.match(formSource, /MAX_FILE_COUNT/);
  assert.match(formSource, /modelFiles/);
  assert.match(formSource, /fileMaterials/);
  assert.match(formSource, /fileColors/);
  assert.match(formSource, /removeFile/);
  assert.match(formSource, /estimateFileBySize/);
  assert.match(formSource, /orderSummary/);
  assert.match(formSource, /shippingFeeEstimate/);
  assert.match(formSource, /shippingMethod/);
  assert.match(formSource, /普通快递/);
  assert.match(formSource, /顺丰快递/);
  assert.match(formSource, /西安本地跑腿/);
  assert.match(formSource, /到店自取/);
  assert.match(formSource, /recipientName/);
  assert.match(formSource, /recipientPhone/);
  assert.match(formSource, /addressRegion/);
  assert.match(formSource, /addressDetail/);
  assert.match(formSource, /shippingRemark/);
  assert.match(formSource, /系统预估/);
  assert.match(formSource, /运费为预估/);
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /name="remark"/);
  assert.doesNotMatch(formSource, /name="company"/);
  assert.match(formSource, /autoComplete="tel"/);
  assert.match(formSource, /autoComplete="off"/);
});

test("success page confirms order submission next steps", async () => {
  const source = await readSource("src/app/success/page.tsx");

  assert.match(source, /提交成功/);
  assert.match(source, /人工确认/);
});

test("admin pages display contact fields from the matching order properties", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /{order\.customerName}/);
  assert.match(listSource, /{order\.phone}/);
  assert.match(listSource, /{order\.wechat}/);
  assert.match(detailSource, /label="姓名" value={order\.customerName}/);
  assert.match(detailSource, /label="电话" value={order\.phone}/);
  assert.match(detailSource, /label="微信" value={order\.wechat}/);
  assert.match(detailSource, /label="邮箱" value={order\.email \|\| "-"}/);
  assert.match(detailSource, /label="公司" value={order\.company \|\| "-"}/);
});

test("admin pages show estimate and shipping fields", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /formatPriceRange\(order\)/);
  assert.match(listSource, /formatLeadTimeRange\(order\)/);
  assert.match(listSource, /order\.shippingMethod/);
  assert.match(detailSource, /estimatedPriceMin/);
  assert.match(detailSource, /estimatedPriceMax/);
  assert.match(detailSource, /estimatedLeadTimeMinHours/);
  assert.match(detailSource, /estimatedLeadTimeMaxHours/);
  assert.match(detailSource, /shippingMethod/);
  assert.match(detailSource, /shippingFeeEstimate/);
  assert.match(detailSource, /recipientName/);
  assert.match(detailSource, /recipientPhone/);
  assert.match(detailSource, /addressRegion/);
  assert.match(detailSource, /addressDetail/);
  assert.match(detailSource, /shippingRemark/);
});

test("admin order detail page shows complete order fields and per-file actions", async () => {
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(detailSource, /requireAdminSession/);
  assert.match(detailSource, /redirect\("\/admin\/login"\)/);
  assert.match(detailSource, /AdminStatusForm orderId={order\.id} status={order\.status}/);
  assert.match(detailSource, /value={order\.orderNo}/);
  assert.match(detailSource, /value={String\(order\.id\)}/);
  assert.match(detailSource, /value={String\(order\.quantity\)}/);
  assert.match(detailSource, /value={order\.status}/);
  assert.match(detailSource, /order\.remark/);
  assert.match(detailSource, /order\.files\.map/);
  assert.match(detailSource, /file\.filename/);
  assert.match(detailSource, /file\.material/);
  assert.match(detailSource, /file\.color/);
  assert.match(detailSource, /file\.filesize/);
  assert.match(detailSource, /\/api\/admin\/files\/\$\{file\.id\}\/download/);
});

test("orders API accepts estimates, shipping, address, and up to five uploaded model files", async () => {
  const apiSource = await readSource("src/app/api/orders/route.ts");

  assert.match(apiSource, /MAX_FILE_COUNT = 5/);
  assert.match(apiSource, /formData\.getAll\("modelFiles"\)/);
  assert.match(apiSource, /formData\.getAll\("fileMaterials"\)/);
  assert.match(apiSource, /formData\.getAll\("fileColors"\)/);
  assert.match(apiSource, /estimateOrderSummary/);
  assert.match(apiSource, /shippingMethod: getString\(formData, "shippingMethod"\)/);
  assert.match(apiSource, /recipientName: getString\(formData, "recipientName"\)/);
  assert.match(apiSource, /recipientPhone: getString\(formData, "recipientPhone"\)/);
  assert.match(apiSource, /addressRegion: getString\(formData, "addressRegion"\)/);
  assert.match(apiSource, /addressDetail: getString\(formData, "addressDetail"\)/);
  assert.match(apiSource, /shippingRemark: getString\(formData, "shippingRemark"\)/);
  assert.match(apiSource, /createOrderWithFiles/);
  assert.doesNotMatch(apiSource, /company: getString\(formData, "company"\)/);
});

test("contact information section contains the configured Make3D contact copy", async () => {
  const contactSource = await readSource("src/frontend/components/ContactSection.tsx");

  assert.match(contactSource, /微信：请填写你的微信号/);
  assert.match(contactSource, /电话：请填写你的手机号/);
  assert.match(contactSource, /邮箱：21899835@qq\.com/);
  assert.match(contactSource, /服务时间：工作日晚上及周末可处理订单/);
  assert.match(contactSource, /提交模型后，我们会人工确认最终报价和生产安排。/);
});
