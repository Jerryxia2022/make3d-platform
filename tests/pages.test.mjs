import { access, readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

async function readSource(path) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

async function assertFileExists(path) {
  await access(new URL(`../${path}`, import.meta.url));
}

test("home page contains Make3D service entry, quote CTA, and contact section", async () => {
  const source = await readSource("src/app/page.tsx");

  assert.match(source, /Make3D/);
  assert.match(source, /href="\/quote"/);
  assert.match(source, /href: "\/request\/design"/);
  assert.match(source, /href: "\/request\/development"/);
  assert.match(source, /CustomerAuthBar/);
  assert.match(source, /ContactSection/);
});

test("home page exposes compact request intake sections", async () => {
  const source = await readSource("src/app/page.tsx");

  assert.match(source, /从模型上传到样机交付/);
  assert.match(source, /标准3D打印/);
  assert.match(source, /模型修改与打印/);
  assert.match(source, /工装夹具\/研发咨询/);
  assert.match(source, /立即上传报价/);
  assert.match(source, /提交修改需求/);
  assert.match(source, /提交研发需求/);
  assert.match(source, /服务流程/);
  assert.match(source, /常见适用场景/);
  assert.match(source, /FAQ/);
});

test("front pages show customer auth state while admin pages stay independent", async () => {
  const navSource = await readSource("src/frontend/components/CustomerAuthBar.tsx");
  const homeSource = await readSource("src/app/page.tsx");
  const quoteSource = await readSource("src/app/quote/page.tsx");
  const accountSource = await readSource("src/app/account/page.tsx");
  const adminLoginSource = await readSource("src/app/admin/login/page.tsx");
  const adminOrdersSource = await readSource("src/app/admin/orders/page.tsx");

  assert.match(navSource, /getCurrentCustomer/);
  assert.match(navSource, /href="\/account\/login"/);
  assert.match(navSource, /href="\/account\/register"/);
  assert.match(navSource, /href="\/account"/);
  assert.match(navSource, /returnTo = "\/"/);
  assert.match(navSource, /encodeURIComponent\(returnTo\)/);
  assert.match(navSource, /logoutAction/);
  assert.match(navSource, /action={logoutAction}/);
  assert.match(navSource, /method="post"/);
  assert.doesNotMatch(navSource, /href={`\/account\/logout/);
  assert.match(navSource, /customer\.name \|\| customer\.phone/);
  assert.match(homeSource, /CustomerAuthBar/);
  assert.match(quoteSource, /<CustomerAuthBar returnTo="\/quote" \/>/);
  assert.match(accountSource, /<CustomerAuthBar returnTo="\/" \/>/);
  assert.doesNotMatch(adminLoginSource, /CustomerAuthBar/);
  assert.doesNotMatch(adminOrdersSource, /CustomerAuthBar/);
});

test("global footer reads ICP filing number from environment", async () => {
  const layoutSource = await readSource("src/app/layout.tsx");
  const footerSource = await readSource("src/frontend/components/SiteFooter.tsx");
  const envExample = await readSource(".env.example");
  const productionEnvExample = await readSource(".env.production.example");

  assert.match(layoutSource, /SiteFooter/);
  assert.match(layoutSource, /<SiteFooter \/>/);
  assert.match(footerSource, /process\.env\.NEXT_PUBLIC_ICP_BEIAN\?\.trim\(\)/);
  assert.match(footerSource, /beian\.miit\.gov\.cn/);
  assert.match(footerSource, /target="_blank"/);
  assert.match(footerSource, /rel="noopener noreferrer"/);
  assert.match(footerSource, /&copy; 2026 Make3D/);
  assert.match(footerSource, /icpBeian \?/);
  assert.match(envExample, /NEXT_PUBLIC_ICP_BEIAN=/);
  assert.match(productionEnvExample, /NEXT_PUBLIC_ICP_BEIAN=陕ICP备2026014335号-1/);
});

test("customer MVP pages and logout route exist", async () => {
  const accountSource = await readSource("src/app/account/page.tsx");
  const logoutSource = await readSource("src/app/account/logout/route.ts");
  const forgotSource = await readSource("src/app/account/forgot-password/page.tsx");

  assert.match(accountSource, /getCurrentCustomer/);
  assert.match(accountSource, /CustomerAuthBar/);
  assert.doesNotMatch(accountSource, /\/api\/account\/logout\?next=\//);
  assert.match(logoutSource, /createCustomerLogoutResponse/);
  assert.match(logoutSource, /isRouterPrefetch/);
  assert.match(logoutSource, /status: 204/);
  assert.match(logoutSource, /searchParams\.get\("next"\)/);
  assert.match(logoutSource, /getSafeLogoutRedirect/);
  assert.match(logoutSource, /303/);
  assert.match(forgotSource, /name="email"/);
  assert.match(forgotSource, /IfAccountExistsMessage/);
});

test("customer account center shows profile, compact orders, and owned order detail", async () => {
  const accountSource = await readSource("src/app/account/page.tsx");
  const detailSource = await readSource("src/app/account/orders/[id]/page.tsx");
  const confirmSource = await readSource("src/app/account/orders/[id]/confirm/page.tsx");

  assert.match(accountSource, /listOrdersByCustomerId/);
  assert.match(accountSource, /dynamic = "force-dynamic"/);
  assert.match(accountSource, /revalidate = 0/);
  assert.match(accountSource, /用户资料/);
  assert.match(accountSource, /我的订单/);
  assert.doesNotMatch(accountSource, /我的非标准需求/);
  assert.doesNotMatch(accountSource, /我的历史报价/);
  assert.match(accountSource, /修改密码/);
  assert.match(accountSource, /ChangePasswordForm/);
  assert.match(accountSource, /\/account\/orders\/\$\{order\.id\}/);
  assert.match(accountSource, /formatFileCount/);
  assert.match(accountSource, /formatMoney\(order\.finalPrice \?\? order\.payablePrice/);
  assert.match(accountSource, /formatLeadTime\(order\.finalLeadTimeHours \?\? order\.estimatedLeadTimeHours/);
  assert.match(accountSource, /查看付款方式/);

  assert.match(detailSource, /getOrderByIdForCustomer/);
  assert.match(detailSource, /dynamic = "force-dynamic"/);
  assert.match(detailSource, /revalidate = 0/);
  assert.match(detailSource, /redirect\("\/account\/login"\)/);
  assert.match(detailSource, /notFound\(\)/);
  assert.match(detailSource, /联系与收货信息/);
  assert.match(detailSource, /order\.files\.map/);
  assert.match(detailSource, /file\.filename/);
  assert.match(detailSource, /file\.material/);
  assert.match(detailSource, /file\.color/);
  assert.match(detailSource, /file\.quantity/);
  assert.match(detailSource, /formatMoney\(file\.unitPrice/);
  assert.match(detailSource, /formatMoney\(file\.subtotalPrice/);
  assert.match(detailSource, /href="\/quote"/);
  assert.match(detailSource, /自动报价/);
  assert.match(detailSource, /最终报价/);
  assert.match(detailSource, /状态时间轴/);
  assert.match(detailSource, /CurrentStatusPanel/);
  assert.match(detailSource, /已提交订单/);
  assert.match(detailSource, /已确认报价/);
  assert.match(detailSource, /排产中/);
  assert.match(detailSource, /后处理/);
  assert.match(detailSource, /付款已确认，订单已进入生产准备。/);
  assert.match(detailSource, /订单已付款，等待排产。/);
  assert.match(detailSource, /订单已进入排产，等待打印。/);
  assert.match(detailSource, /订单正在生产中。/);
  assert.match(detailSource, /订单正在进行后处理、检查或包装。/);
  assert.match(detailSource, /订单已完成，感谢使用 Make3D。/);
  assert.match(detailSource, /生产与物流/);
  assert.match(detailSource, /快递公司/);
  assert.match(detailSource, /运单号/);
  assert.match(detailSource, /管理员备注/);
  assert.match(detailSource, /物流单号/);
  assert.match(detailSource, /请联系工作人员完成付款/);

  assert.match(confirmSource, /getOrderByIdForCustomer/);
  assert.match(confirmSource, /dynamic = "force-dynamic"/);
  assert.match(confirmSource, /revalidate = 0/);
  assert.match(confirmSource, /redirect\("\/account\/login"\)/);
  assert.match(confirmSource, /订单确认/);
  assert.match(confirmSource, /订单已提交，请等待人工确认最终价格。确认后我们会通知您付款。/);
  assert.match(confirmSource, /order\.files\.map/);
  assert.match(confirmSource, /formatMoney\(file\.unitPrice/);
  assert.match(confirmSource, /formatMoney\(file\.subtotalPrice/);
  assert.match(confirmSource, /formatAddress\(order\)/);
});

test("quote page shows FDM guidance instead of pricing explanation", async () => {
  const source = await readSource("src/app/quote/page.tsx");

  assert.match(source, /getCurrentCustomer/);
  assert.match(source, /href="\/account\/login"/);
  assert.match(source, /href="\/account\/register"/);
  assert.doesNotMatch(source, /QuoteLoginPrompt/);

  assert.match(source, /FDM 是通过热熔材料逐层堆叠成型的3D打印工艺/);
  assert.match(source, /价格计算按0\.4喷嘴，0\.2mm层高，50%填充率进行价格计算/);
  assert.match(source, /如有特别要求，例如需改变喷嘴/);
  assert.doesNotMatch(source, /3MF/);
  assert.doesNotMatch(source, /价格和计费说明/);
  assert.doesNotMatch(source, /材料费/);
});

test("account pages expose registration, login, forgot password, and reset password forms", async () => {
  const registerSource = await readSource("src/app/account/register/page.tsx");
  const loginSource = await readSource("src/app/account/login/page.tsx");
  const loginFormSource = await readSource("src/frontend/components/CustomerLoginForm.tsx");
  const forgotSource = await readSource("src/app/account/forgot-password/page.tsx");

  assert.match(registerSource, /name="phone"/);
  assert.match(registerSource, /inputMode="numeric"/);
  assert.match(registerSource, /maxLength=\{11\}/);
  assert.match(registerSource, /pattern={mainlandPhoneHtmlPattern}/);
  assert.match(registerSource, /title={mainlandPhoneErrorMessage}/);
  assert.match(registerSource, /name="password"/);
  assert.match(registerSource, /minLength=\{8\}/);
  assert.match(registerSource, /name="name"/);
  assert.match(registerSource, /name="wechat"/);
  assert.match(registerSource, /name="email"/);
  assert.doesNotMatch(registerSource, /name="defaultAddress"/);
  assert.match(registerSource, /微信很重要/);
  assert.match(loginSource, /CustomerLoginForm/);
  assert.match(loginFormSource, /\/api\/account\/login/);
  assert.match(loginFormSource, /inputMode="numeric"/);
  assert.match(loginFormSource, /maxLength=\{11\}/);
  assert.match(loginFormSource, /pattern={mainlandPhoneHtmlPattern}/);
  assert.match(loginFormSource, /title={mainlandPhoneErrorMessage}/);
  assert.match(forgotSource, /\/api\/account\/forgot-password/);
});

test("customer account page routes and APIs exist", async () => {
  await Promise.all([
    assertFileExists("src/app/account/register/page.tsx"),
    assertFileExists("src/app/account/login/page.tsx"),
    assertFileExists("src/app/account/forgot-password/page.tsx"),
    assertFileExists("src/app/account/page.tsx"),
    assertFileExists("src/app/api/account/register/route.ts"),
    assertFileExists("src/app/api/account/login/route.ts"),
    assertFileExists("src/app/api/account/logout/route.ts"),
    assertFileExists("src/app/api/account/me/route.ts"),
    assertFileExists("src/app/api/account/forgot-password/route.ts"),
  ]);
});

test("wechat account binding explains keyword service mode", async () => {
  const bindCardSource = await readSource("src/frontend/components/WechatBindCard.tsx");
  const customerServiceSource = await readSource("src/app/admin/customer-service/page.tsx");
  const menuScriptSource = await readSource("scripts/wechat-menu.mjs");
  const readmeSource = await readSource("README.md");

  assert.match(bindCardSource, /当前公众号采用关键词服务模式/);
  assert.match(bindCardSource, /发送【报价】获取在线报价入口/);
  assert.match(bindCardSource, /发送【订单】查看订单入口/);
  assert.match(bindCardSource, /发送【付款】查看付款说明/);
  assert.match(bindCardSource, /发送【人工】联系人工客服/);
  assert.match(bindCardSource, /发送绑定码完成账号绑定/);
  assert.match(customerServiceSource, /客户可发送 报价 \/ 订单 \/ 付款 \/ 人工 获取对应服务/);
  assert.match(menuScriptSource, /WECHAT_MP_MENU_ENABLED/);
  assert.match(menuScriptSource, /Wechat menu API creation is paused/);
  assert.match(menuScriptSource, /This is non-blocking/);
  assert.match(readmeSource, /不把 `npm run wechat:menu` 作为部署或验证必需步骤/);
});

test("quote form supports disabled guest mode and customer prefill", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const quoteSource = await readSource("src/app/quote/page.tsx");

  assert.match(quoteSource, /<QuoteForm/);
  assert.match(quoteSource, /disabled={!customer}/);
  assert.match(quoteSource, /quoteCustomer/);
  assert.match(quoteSource, /customer={quoteCustomer}/);
  assert.match(quoteSource, /登录后可上传模型文件，自动计算打印价格和预计交货期。/);
  assert.match(quoteSource, /xl:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(formSource, /disabled = false/);
  assert.match(formSource, /customer\?: QuoteFormCustomer/);
  assert.match(formSource, /guestUploadGateMessage/);
  assert.match(formSource, /xl:sticky xl:top-6/);
  assert.match(formSource, /if \(disabled\) \{/);
  assert.match(formSource, /disabled={disabled}/);
  assert.match(formSource, /disabled={isSubmitting \|\| isSubmitted \|\| hasPendingQuotes \|\| disabled}/);
  assert.match(formSource, /defaultValue={customer\?\.name \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.phone \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.wechat \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.email \|\| ""}/);
  assert.match(formSource, /文件卡片区域/);
  assert.match(formSource, /router\.push\(`\/account\/orders\/\$\{result\.id\}\/confirm`\)/);
});

test("quote form exposes merged contact and shipping fields with customer validation", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

  assert.match(formSource, /收货地址信息/);
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /pattern={customerNamePattern}/);
  assert.match(formSource, /至少2个汉字，或至少4个英文字母/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /inputMode="numeric"/);
  assert.match(formSource, /maxLength=\{11\}/);
  assert.match(formSource, /pattern={mainlandPhoneHtmlPattern}/);
  assert.match(formSource, /title={mainlandPhoneErrorMessage}/);
  assert.match(formSource, /isValidMainlandPhone\(phone\)/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /type="hidden"/);
  assert.match(formSource, /name="shippingMethod"/);
  assert.match(formSource, /name="addressDetail"/);
  assert.match(formSource, /name="remark"/);
  assert.match(formSource, /formData\.set\("recipientName", getRequiredFormValue\(formData, "customerName"\)\)/);
  assert.match(formSource, /formData\.set\("recipientPhone", phone\)/);
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
  assert.match(formSource, /\/api\/quote\/slice/);
  assert.match(formSource, /fileSliceStatus/);
  assert.match(formSource, /fileFilamentWeightG/);
  assert.match(formSource, /filePrintTimeSeconds/);
  assert.match(formSource, /fileQuantities/);
  assert.match(formSource, /fileUnitPrice/);
  assert.match(formSource, /fileSubtotalPrice/);
  assert.match(formSource, /updateFileQuantity/);
  assert.match(formSource, /validateFileQuantities/);
  assert.match(formSource, /数量必须是 1-1000 的整数/);
  assert.match(formSource, /min="1"/);
  assert.match(formSource, /max="1000"/);
  assert.match(formSource, /step="1"/);
  assert.match(formSource, /inputMode="numeric"/);
  assert.match(formSource, /progress/);
  assert.match(formSource, /phase/);
  assert.match(formSource, /startedAt/);
  assert.match(formSource, /elapsedSeconds/);
  assert.match(formSource, /等待上传完成/);
  assert.match(formSource, /文件已上传/);
  assert.match(formSource, /正在准备切片任务/);
  assert.match(formSource, /正在调用 PrusaSlicer/);
  assert.match(formSource, /正在解析 G-code/);
  assert.match(formSource, /正在计算价格/);
  assert.match(formSource, /报价完成/);
  assert.match(formSource, /已等待/);
  assert.match(formSource, /模型较复杂，正在继续计算，请稍候/);
  assert.match(formSource, /计算超时，需人工确认/);
  assert.match(formSource, /切片超时/);
  assert.match(formSource, /文件格式不支持/);
  assert.match(formSource, /切片配置缺失/);
  assert.match(formSource, /服务器繁忙/);
  assert.match(formSource, /整单计算报价/);
  assert.match(formSource, /切片按 PETG 密度计算重量/);
  assert.match(formSource, /calculateOrderQuote/);
  assert.match(formSource, /SLICE_MATERIAL = "PETG"/);
  assert.match(formSource, /部分文件尚未计算或正在计算，完成后将更新总价。/);
  assert.match(formSource, /请先计算报价/);
  assert.match(formSource, /disabled={isSubmitting \|\| isSubmitted \|\| hasPendingQuotes \|\| disabled}/);
  assert.match(formSource, /等待计算/);
  assert.match(formSource, /正在计算/);
  assert.match(formSource, /已完成/);
  assert.match(formSource, /计算失败，需人工确认/);
  assert.match(formSource, /需人工确认/);
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
  assert.match(formSource, /打印单价/);
  assert.match(formSource, /报价状态/);
  assert.doesNotMatch(formSource, /耗材重量/);
  assert.doesNotMatch(formSource, /材料费/);
  assert.doesNotMatch(formSource, /工时费/);
  assert.doesNotMatch(formSource, /预估价格区间/);
  assert.doesNotMatch(formSource, /打印时间/);
  assert.match(formSource, /如需加急，请在备注中说明，加急可能产生额外费用。/);
  assert.match(formSource, /打印费合计/);
  assert.match(formSource, /应付总价/);
  assert.match(formSource, /预计交货期/);
  assert.match(formSource, /最终价格以人工确认为准/);
  assert.doesNotMatch(formSource, /DimensionField/);
  assert.doesNotMatch(formSource, /label="包装费"/);
  assert.match(formSource, /PrusaSlicer/);
  assert.match(formSource, /文件小计/);
  assert.match(formSource, /getFileSubtotalPrice/);
  assert.match(formSource, /quote\.result\.printTimeSeconds \* quote\.quantity/);
  assert.match(formSource, /getMaterialRate\(material\)/);
});

test("quote form handles failed auto quote API responses without staying calculating", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");

  assert.match(formSource, /sliceQuotesRef/);
  assert.match(formSource, /sliceQuotesRef\.current = sliceQuotes/);
  assert.doesNotMatch(formSource, /sliceRequestKey/);
  assert.match(formSource, /const quoteResult = result\.result/);
  assert.match(formSource, /if \(!response\.ok \|\| !result\.success \|\| !quoteResult\)/);
  assert.match(formSource, /console\.error\("Auto quote API failed"/);
  assert.match(formSource, /status: "failed"/);
  assert.match(formSource, /phase: "计算失败，需人工确认"/);
  assert.match(formSource, /message: getSliceFailureReason\(result\)/);
  assert.match(formSource, /请先登录后使用自动报价/);
  assert.match(formSource, /本地未启用切片，需人工确认/);
  assert.doesNotMatch(formSource, /PrusaSlicer未启用/);
  assert.doesNotMatch(formSource, /本地未安装PrusaSlicer/);
  assert.match(formSource, /计算失败，需人工确认/);
  assert.match(formSource, /文件未保存成功/);
  assert.match(formSource, /文件格式暂不支持/);
  assert.match(formSource, /部分文件需人工确认/);
  assert.match(formSource, /订单提交失败，网络或服务器暂时无响应，请检查网络后重试。/);
  assert.match(formSource, /已提交/);
});

test("admin pages display contact fields from the matching order properties", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");
  const requestsSource = await readSource("src/app/admin/requests/page.tsx");

  assert.match(listSource, /{order\.customerName}/);
  assert.match(listSource, /{order\.phone}/);
  assert.match(listSource, /{order\.wechat}/);
  assert.match(listSource, /href="\/admin\/requests"/);
  assert.match(requestsSource, /需求类型/);
  assert.match(requestsSource, /项目名称/);
  assert.match(requestsSource, /手机号/);
  assert.match(detailSource, /value={order\.customerName}/);
  assert.match(detailSource, /value={order\.phone}/);
  assert.match(detailSource, /value={order\.wechat}/);
  assert.match(detailSource, /value={order\.email \|\| "-"}/);
  assert.match(detailSource, /value={order\.company \|\| "-"}/);
});

test("admin pages show V2 estimate and shipping fields", async () => {
  const listSource = await readSource("src/app/admin/orders/page.tsx");
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(listSource, /searchOrders/);
  assert.match(listSource, /状态筛选/);
  assert.match(listSource, /QuickStatusLinks/);
  assert.match(listSource, /需要确认/);
  assert.match(listSource, /等待付款/);
  assert.match(listSource, /待排产/);
  assert.match(listSource, /待发货/);
  assert.match(listSource, /最终报价/);
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
  assert.match(detailSource, /assignedPrinter/);
  assert.match(detailSource, /estimatedStartAt/);
  assert.match(detailSource, /estimatedFinishAt/);
  assert.match(detailSource, /actualStartAt/);
  assert.match(detailSource, /actualFinishAt/);
  assert.match(detailSource, /internalNote/);
  assert.match(detailSource, /shippedAt/);
  assert.match(detailSource, /shippingNote/);
  assert.match(detailSource, /AdminFinalQuoteForm/);
  assert.match(detailSource, /priceAdjustmentReason/);
  assert.match(detailSource, /finalPrice/);
});

test("admin order detail page shows complete order fields and per-file V2 estimate actions", async () => {
  const detailSource = await readSource("src/app/admin/orders/[id]/page.tsx");

  assert.match(detailSource, /getPrusaSlicerConfig/);
  assert.match(detailSource, /AdminSlicerTestButton/);
  assert.match(detailSource, /getSliceJobsByOrderId/);
  assert.match(detailSource, /SliceJobResults/);
  assert.match(detailSource, /orderId={order\.id}/);
  assert.match(detailSource, /enabled={slicerConfig\.enabled}/);
  assert.match(detailSource, /profilePath={slicerConfig\.profilePath}/);
  assert.match(detailSource, /自动切片报价尚未启用。/);
  assert.match(detailSource, /requireAdminSession/);
  assert.match(detailSource, /redirect\("\/admin\/login"\)/);
  assert.match(detailSource, /<AdminStatusForm/);
  assert.match(detailSource, /assignedPrinter={order\.assignedPrinter}/);
  assert.match(detailSource, /shippingNote={order\.shippingNote}/);
  assert.match(detailSource, /getOrderStatusLogsByOrderId/);
  assert.match(detailSource, /状态历史/);
  assert.match(detailSource, /生产管理/);
  assert.match(detailSource, /配送与物流/);
  assert.match(detailSource, /shippingCompany/);
  assert.match(detailSource, /trackingNumber/);
  assert.match(detailSource, /adminRemark/);
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
  assert.match(detailSource, /file\.quantity/);
  assert.match(detailSource, /file\.unitPrice/);
  assert.match(detailSource, /file\.subtotalPrice/);
  assert.match(detailSource, /order\.printFeeTotal/);
  assert.match(detailSource, /order\.payablePrice/);
  assert.match(detailSource, /order\.estimatedLeadTimeHours/);
  assert.match(detailSource, /file\.estimatedLeadTimeMaxHours/);
  assert.match(detailSource, /file\.riskNotice/);
  assert.match(detailSource, /file\.filesize/);
  assert.match(detailSource, /\/api\/admin\/files\/\$\{file\.id\}\/download/);
});

test("orders API accepts V2 estimates, dimensions, shipping, address, and uploaded files", async () => {
  const apiSource = await readSource("src/app/api/orders/route.ts");

  assert.match(apiSource, /MAX_FILE_COUNT = 5/);
  assert.match(apiSource, /getCustomerFromRequest/);
  assert.match(apiSource, /请先登录后提交订单/);
  assert.match(apiSource, /customerId: customer\.id/);
  assert.match(apiSource, /formData\.getAll\("modelFiles"\)/);
  assert.match(apiSource, /formData\.getAll\("fileMaterials"\)/);
  assert.match(apiSource, /formData\.getAll\("fileColors"\)/);
  assert.match(apiSource, /getQuantityList\(formData, "fileQuantities"\)/);
  assert.match(apiSource, /fileUnitPrice/);
  assert.match(apiSource, /fileSubtotalPrice/);
  assert.match(apiSource, /printFeeTotal/);
  assert.match(apiSource, /payablePrice/);
  assert.match(apiSource, /estimatedLeadTimeHours/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionX"\)/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionY"\)/);
  assert.match(apiSource, /getNumberList\(formData, "fileDimensionZ"\)/);
  assert.match(apiSource, /estimateFileBySize/);
  assert.match(apiSource, /estimateOrderSummary/);
  assert.match(apiSource, /isValidMainlandPhone\(phone\)/);
  assert.match(apiSource, /mainlandPhoneErrorMessage/);
  assert.match(apiSource, /packagingFee: estimate\.packagingFee/);
  assert.match(apiSource, /shippingFee: shipping\.amount/);
  assert.match(apiSource, /shippingMethod: getString\(formData, "shippingMethod"\)/);
  assert.match(apiSource, /recipientName: getString\(formData, "recipientName"\)/);
  assert.match(apiSource, /recipientPhone,/);
  assert.match(apiSource, /addressRegion: getString\(formData, "addressRegion"\)/);
  assert.match(apiSource, /addressDetail: getString\(formData, "addressDetail"\)/);
  assert.match(apiSource, /shippingRemark: getString\(formData, "shippingRemark"\)/);
  assert.match(apiSource, /createOrderWithFiles/);
  assert.match(apiSource, /getSliceQuoteList/);
  assert.match(apiSource, /createSliceJob/);
  assert.match(apiSource, /updateSliceJobSuccess/);
  assert.match(apiSource, /calculateAutoLeadTimeHours/);
  assert.doesNotMatch(apiSource, /company: getString\(formData, "company"\)/);
});

test("customer APIs require login before quote slicing and order submission", async () => {
  const sliceSource = await readSource("src/app/api/quote/slice/route.ts");
  const orderSource = await readSource("src/app/api/orders/route.ts");

  assert.match(sliceSource, /getCustomerFromRequestCookie/);
  assert.match(sliceSource, /status\), 401\)|}, 401\)/);
  assert.match(orderSource, /getCustomerFromRequest/);
  assert.match(orderSource, /status: 401/);
});

test("admin order status API records admin workflow and notifies customers", async () => {
  const source = await readSource("src/app/api/admin/orders/[id]/status/route.ts");

  assert.match(source, /updateOrderStatusAndNotify/);
  assert.match(source, /operator: "admin"/);
  assert.match(source, /paymentMethod/);
  assert.match(source, /paymentNote/);
  assert.match(source, /assignedPrinter/);
  assert.match(source, /estimatedStartAt/);
  assert.match(source, /actualStartAt/);
  assert.match(source, /internalNote/);
  assert.match(source, /shippingCompany/);
  assert.match(source, /trackingNumber/);
  assert.match(source, /shippedAt/);
  assert.match(source, /shippingNote/);
  assert.match(source, /adminRemark/);
  assert.match(source, /wechatStatus/);
});

test("manual payment confirmation workflow pages avoid customer proof upload", async () => {
  const accountSource = await readSource("src/app/account/page.tsx");
  const customerDetailSource = await readSource("src/app/account/orders/[id]/page.tsx");
  const customerConfirmSource = await readSource("src/app/account/orders/[id]/confirm/page.tsx");
  const customerPaymentSource = await readSource("src/frontend/components/CustomerPaymentOptions.tsx");
  const adminDetailSource = await readSource("src/app/admin/orders/[id]/page.tsx");
  const adminFinalQuoteSource = await readSource("src/frontend/components/AdminFinalQuoteForm.tsx");
  const adminPaymentConfirmSource = await readSource("src/frontend/components/AdminPaymentConfirmForm.tsx");
  const adminPaymentSettingsFormSource = await readSource("src/frontend/components/AdminPaymentSettingsForm.tsx");
  const paymentConfirmSource = await readSource("src/app/api/admin/orders/[id]/payment-confirm/route.ts");
  const finalQuoteSource = await readSource("src/app/api/admin/orders/[id]/final-quote/route.ts");

  assert.match(customerDetailSource, /订单正在人工确认，自动估价仅供参考/);
  assert.match(customerDetailSource, /请按最终报价付款/);
  assert.match(customerDetailSource, /付款完成后，工作人员核对到账后会更新订单状态。/);
  assert.match(accountSource, /查看付款方式/);
  assert.match(customerConfirmSource, /CustomerPaymentOptions/);
  assert.match(customerConfirmSource, /付款完成后，工作人员核对到账后会更新订单状态。/);
  assert.match(customerPaymentSource, /微信转账/);
  assert.match(customerPaymentSource, /支付宝转账/);
  assert.match(customerPaymentSource, /闲鱼链接/);
  assert.match(customerPaymentSource, /淘宝链接/);
  assert.doesNotMatch(customerDetailSource, /付款凭证|paymentProof|上传截图|我已付款/);
  assert.doesNotMatch(customerConfirmSource, /付款凭证|paymentProof|上传截图|我已付款/);
  assert.doesNotMatch(customerPaymentSource, /付款凭证|paymentProof|上传截图|我已付款/);

  assert.match(adminFinalQuoteSource, /确认报价并通知客户/);
  assert.match(adminPaymentConfirmSource, /确认到账/);
  assert.match(adminDetailSource, /付款时请备注：订单编号\/手机号/);
  assert.match(paymentConfirmSource, /updateOrderStatusAndNotify/);
  assert.match(paymentConfirmSource, /status: "已付款"/);
  assert.match(paymentConfirmSource, /paymentNote/);
  assert.match(paymentConfirmSource, /wechatStatus/);
  assert.match(finalQuoteSource, /confirmOrderFinalQuote/);
  assert.match(finalQuoteSource, /notifyCustomerOrderStatus/);
});

test("admin payment settings page and API exist", async () => {
  const pageSource = await readSource("src/app/admin/settings/payment/page.tsx");
  const formSource = await readSource("src/frontend/components/AdminPaymentSettingsForm.tsx");
  const apiSource = await readSource("src/app/api/admin/settings/payment/route.ts");

  assert.match(formSource, /微信收款二维码图片路径/);
  assert.match(formSource, /支付宝收款二维码图片路径/);
  assert.match(formSource, /闲鱼付款链接/);
  assert.match(formSource, /淘宝付款链接/);
  assert.match(pageSource, /AdminPaymentSettingsForm/);
  assert.match(apiSource, /updatePaymentSettings/);
  assert.match(apiSource, /requireAdminSession/);
});

test("success page and contact information section remain available", async () => {
  const successSource = await readSource("src/app/success/page.tsx");
  const contactSource = await readSource("src/frontend/components/ContactSection.tsx");

  assert.match(successSource, /提交成功|鎻愪氦鎴愬姛/);
  assert.match(contactSource, /21899835@qq\.com/);
  assert.match(contactSource, /ContactSection/);
});
