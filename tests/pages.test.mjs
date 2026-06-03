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

test("quote page shows FDM guidance instead of pricing explanation", async () => {
  const source = await readSource("src/app/quote/page.tsx");

  assert.match(source, /FDM 是通过热熔材料逐层堆叠成型的3D打印工艺/);
  assert.match(source, /默认按 0\.4mm 喷嘴、0\.2mm 层高、50% 填充进行预估/);
  assert.match(source, /如需特殊层高、强度、表面效果、支撑方式、分件打印等/);
  assert.doesNotMatch(source, /价格和计费说明/);
  assert.doesNotMatch(source, /材料费/);
});

test("quote form exposes merged contact and shipping fields with customer validation", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

  assert.match(formSource, /联系与收货信息/);
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /pattern={customerNamePattern}/);
  assert.match(formSource, /至少2个汉字，或至少4个英文字母/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /pattern="1\[3-9\]\\\\d\{9\}"/);
  assert.match(formSource, /必须填写11位中国大陆手机号/);
  assert.match(formSource, /微信很重要，请填写常用微信，方便确认报价和生产细节。/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /name="shippingMethod"/);
  assert.match(formSource, /name="addressDetail"/);
  assert.match(formSource, /name="remark"/);
  assert.match(formSource, /formData\.set\("recipientName", getRequiredFormValue\(formData, "customerName"\)\)/);
  assert.match(formSource, /formData\.set\("recipientPhone", getRequiredFormValue\(formData, "phone"\)\)/);
  assert.match(formSource, /formData\.set\("addressRegion", "-"\)/);
  assert.doesNotMatch(formSource, /name="recipientName"/);
  assert.doesNotMatch(formSource, /name="recipientPhone"/);
  assert.doesNotMatch(formSource, /name="addressRegion"/);

  assert.match(estimateSource, /DEFAULT_LEAD_TIME_MIN_HOURS = 48/);
  assert.match(estimateSource, /DEFAULT_LEAD_TIME_MAX_HOURS = 72/);
});

test("quote form keeps upload, per-file options, safe dimensions, estimates, and summary", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

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
  assert.match(formSource, /占位缩略图/);
  assert.match(formSource, /{formatDimensions\(dimensions\)}/);
  assert.match(estimateSource, /模型最大外形尺寸约：/);
  assert.match(estimateSource, /尺寸暂未识别，最终以人工确认为准。/);
  assert.match(formSource, /预估价格/);
  assert.doesNotMatch(formSource, /预估价格区间/);
  assert.match(formSource, /预估工期/);
  assert.match(formSource, /如需加急，请在备注中说明，加急可能产生额外费用。/);
  assert.match(formSource, /预估总价/);
  assert.match(formSource, /预估总货期/);
  assert.match(formSource, /最终价格以人工确认为准/);
  assert.doesNotMatch(formSource, /DimensionField/);
  assert.doesNotMatch(formSource, /label="包装费"/);
  assert.doesNotMatch(formSource, /PrusaSlicer/);
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

  assert.match(listSource, /formatPrice\(order\)/);
  assert.match(listSource, /formatLeadTime\(order\)/);
  assert.match(listSource, /order\.shippingMethod/);
  assert.match(detailSource, /estimatedPriceMax/);
  assert.match(detailSource, /estimatedPriceMax/);
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

  assert.match(detailSource, /getPrusaSlicerConfig/);
  assert.match(detailSource, /AdminSlicerTestButton/);
  assert.match(detailSource, /orderId={order\.id}/);
  assert.match(detailSource, /enabled={slicerConfig\.enabled}/);
  assert.match(detailSource, /profilePath={slicerConfig\.profilePath}/);
  assert.match(detailSource, /自动切片报价尚未启用。/);
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
  assert.match(detailSource, /file\.estimatedPriceMax/);
  assert.match(detailSource, /file\.estimatedLeadTimeMaxHours/);
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

test("success page and contact information section remain available", async () => {
  const successSource = await readSource("src/app/success/page.tsx");
  const contactSource = await readSource("src/frontend/components/ContactSection.tsx");

  assert.match(successSource, /提交成功|鎻愪氦鎴愬姛/);
  assert.match(contactSource, /21899835@qq\.com/);
  assert.match(contactSource, /ContactSection/);
});
