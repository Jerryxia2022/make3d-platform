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

test("quote page exposes V2 pricing, simplified dimensions, shipping, address, and contact fields", async () => {
  const source = await readSource("src/app/quote/page.tsx");
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

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
  assert.match(formSource, /fileDimensionX/);
  assert.match(formSource, /fileDimensionY/);
  assert.match(formSource, /fileDimensionZ/);
  assert.match(formSource, /estimateDisplayDimensions/);
  assert.match(formSource, /formatDimensions\(dimensions\)/);
  assert.match(estimateSource, /模型最大外形尺寸约：/);
  assert.match(estimateSource, /尺寸暂未识别，最终以人工确认为准/);
  assert.doesNotMatch(formSource, /DimensionField/);
  assert.doesNotMatch(formSource, /updateFileDimension/);
  assert.doesNotMatch(formSource, /X 尺寸 mm/);
  assert.doesNotMatch(formSource, /Y 尺寸 mm/);
  assert.doesNotMatch(formSource, /Z 尺寸 mm/);
  assert.match(formSource, /removeFile/);
  assert.match(estimateSource, /estimateFileBySize/);
  assert.match(estimateSource, /getMaterialSalesRate/);
  assert.match(estimateSource, /DEVICE_COUNT = 6/);
  assert.match(estimateSource, /PACKAGING_FEE = 3/);
  assert.match(formSource, /预估价格区间/);
  assert.match(formSource, /预估工期/);
  assert.match(estimateSource, /模型尺寸较小，可能无法稳定打印，需要人工确认。/);
  assert.match(estimateSource, /模型接近设备成型极限，可能需要调整摆放或拆件。/);
  assert.match(estimateSource, /模型超出单台设备成型尺寸，通常需要分件打印，最终报价需人工确认。/);
  assert.doesNotMatch(formSource, /label="包装费"/);
  assert.match(formSource, /运费/);
  assert.match(formSource, /预估总价/);
  assert.match(formSource, /预估总货期/);
  assert.match(formSource, /最终价格以人工确认为准/);
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
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /name="remark"/);
  assert.doesNotMatch(formSource, /name="company"/);

  const contactIndex = formSource.indexOf("联系方式");
  const shippingIndex = formSource.indexOf("配送方式");
  const addressIndex = formSource.indexOf("收货地址");
  const summaryIndex = formSource.indexOf("订单汇总");
  assert.ok(contactIndex > -1);
  assert.ok(shippingIndex > contactIndex);
  assert.ok(addressIndex > shippingIndex);
  assert.ok(summaryIndex > addressIndex);
});

test("success page confirms order submission next steps", async () => {
  const source = await readSource("src/app/success/page.tsx");

  assert.match(source, /提交成功|鎻愪氦鎴愬姛/);
  assert.match(source, /人工确认|浜哄伐纭/);
});

test("admin pages display contact fields from the matching order properties", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /{order\.customerName}/);
  assert.match(listSource, /{order\.phone}/);
  assert.match(listSource, /{order\.wechat}/);
  assert.match(detailSource, /value={order\.customerName}/);
  assert.match(detailSource, /value={order\.phone}/);
  assert.match(detailSource, /value={order\.wechat}/);
  assert.match(detailSource, /value={order\.email \|\| "-"}/);
  assert.match(detailSource, /value={order\.company \|\| "-"}/);
});

test("admin pages show V2 estimate and shipping fields", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /formatPriceRange\(order\)/);
  assert.match(listSource, /formatLeadTimeRange\(order\)/);
  assert.match(listSource, /order\.shippingMethod/);
  assert.match(detailSource, /estimatedPriceMin/);
  assert.match(detailSource, /estimatedPriceMax/);
  assert.match(detailSource, /estimatedLeadTimeMinHours/);
  assert.match(detailSource, /estimatedLeadTimeMaxHours/);
  assert.match(detailSource, /packagingFee/);
  assert.match(detailSource, /shippingFee/);
  assert.match(detailSource, /shippingMethod/);
  assert.match(detailSource, /shippingFeeEstimate/);
  assert.match(detailSource, /recipientName/);
  assert.match(detailSource, /recipientPhone/);
  assert.match(detailSource, /addressRegion/);
  assert.match(detailSource, /addressDetail/);
  assert.match(detailSource, /shippingRemark/);
});

test("admin order detail page shows complete order fields and per-file V2 estimate actions", async () => {
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
  assert.match(detailSource, /file\.boundingBoxX/);
  assert.match(detailSource, /file\.estimatedPriceMin/);
  assert.match(detailSource, /file\.estimatedLeadTimeMinHours/);
  assert.match(detailSource, /file\.riskNotice/);
  assert.match(detailSource, /file\.filesize/);
  assert.match(detailSource, /\/api\/admin\/files\/\$\{file\.id\}\/download/);
});

test("orders API accepts V2 estimates, dimensions, shipping, address, and uploaded files", async () => {
  const apiSource = await readSource("src/app/api/orders/route.ts");

  assert.match(apiSource, /MAX_FILE_COUNT = 5/);
  assert.match(apiSource, /formData\.getAll\("modelFiles"\)/);
  assert.match(apiSource, /formData\.getAll\("fileMaterials"\)/);
  assert.match(apiSource, /formData\.getAll\("fileColors"\)/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionX"\)/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionY"\)/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionZ"\)/);
  assert.match(apiSource, /estimateFileBySize/);
  assert.match(apiSource, /estimateOrderSummary/);
  assert.match(apiSource, /packagingFee: estimate\.packagingFee/);
  assert.match(apiSource, /shippingFee: estimate\.shippingFee/);
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

  assert.match(contactSource, /21899835@qq\.com/);
  assert.match(contactSource, /ContactSection/);
});
