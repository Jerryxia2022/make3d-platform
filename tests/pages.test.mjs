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

test("global footer shows official company ICP filing information", async () => {
  const layoutSource = await readSource("src/app/layout.tsx");
  const footerSource = await readSource("src/frontend/components/SiteFooter.tsx");
  const siteConfigSource = await readSource("src/shared/siteConfig.ts");
  const envExample = await readSource(".env.example");
  const productionEnvExample = await readSource(".env.production.example");

  assert.match(layoutSource, /SiteFooter/);
  assert.match(layoutSource, /<SiteFooter \/>/);
  assert.match(footerSource, /SITE_CONFIG\.legalEntityName/);
  assert.match(footerSource, /SITE_CONFIG\.filingSiteName/);
  assert.match(footerSource, /SITE_CONFIG\.icpFilingNumber/);
  assert.match(siteConfigSource, /beian\.miit\.gov\.cn/);
  assert.match(footerSource, /target="_blank"/);
  assert.match(footerSource, /rel="noopener noreferrer"/);
  assert.match(footerSource, /&copy; 2026/);
  assert.match(siteConfigSource, /西安瑞淞增材技术有限公司/);
  assert.match(siteConfigSource, /瑞淞增材制造服务/);
  assert.match(siteConfigSource, /陕ICP备2026016776号-1/);
  assert.doesNotMatch(siteConfigSource, new RegExp(`陕ICP备202601${"4335"}号-1`));
  assert.doesNotMatch(footerSource, new RegExp(`公网${"安备"}|${"0000000"}0000000`));
  assert.match(envExample, /NEXT_PUBLIC_ICP_BEIAN=/);
  assert.match(productionEnvExample, /NEXT_PUBLIC_ICP_BEIAN=陕ICP备2026016776号-1/);
});

test("legal v1.0 page is based on the v0.11 source package and shows company registration details", async () => {
  await assertFileExists("docs/legal-source/V0.11/Make3D_协议与证据留存资料包_v0.11_法律风险修订稿.zip");
  await Promise.all([
    assertFileExists("src/app/legal/page.tsx"),
    assertFileExists("src/app/legal/terms/page.tsx"),
    assertFileExists("src/app/legal/privacy/page.tsx"),
    assertFileExists("src/app/legal/fdm-service/page.tsx"),
    assertFileExists("src/app/legal/refund-shipping/page.tsx"),
    assertFileExists("src/app/legal/ip-confidentiality/page.tsx"),
    assertFileExists("src/app/legal/order-risk/page.tsx"),
  ]);
  const legalPageSource = await readSource("src/app/legal/page.tsx");
  const legalDocumentSource = await readSource("src/app/legal/LegalDocument.tsx");
  const legalPolicySource = await readSource("src/shared/legalPolicy.ts");
  const footerSource = await readSource("src/frontend/components/SiteFooter.tsx");
  const registerSource = await readSource("src/app/account/register/page.tsx");
  const quoteFormSource = await readSource("src/frontend/components/QuoteForm.tsx");

  assert.match(legalPolicySource, /LEGAL_SOURCE_PACKAGE/);
  assert.match(legalPolicySource, /LEGAL_DOCUMENT_PAGES/);
  assert.match(legalPolicySource, /用户服务协议/);
  assert.match(legalPolicySource, /隐私政策/);
  assert.match(legalPolicySource, /定制制造服务条款及FDM工艺标准/);
  assert.match(legalPolicySource, /Legal Hold/);
  assert.match(legalPageSource, /LEGAL_PUBLIC_VERSION/);
  assert.match(legalPageSource, /\/legal\/\$\{item\.slug\}/);
  assert.match(legalDocumentSource, /getLegalDocumentPage/);
  assert.match(legalPolicySource, /v1\.0/);
  assert.match(legalPolicySource, /2026-07-08/);
  assert.match(legalPolicySource, /陕西省西安市雁塔区小寨东路196号1幢11907室华博众创081号（集群）/);
  assert.doesNotMatch(legalPageSource, /内部审阅稿|v0\.11|草案|待律师审阅|仅供内部参考/);
  for (const href of [
    "/legal/terms",
    "/legal/privacy",
    "/legal/fdm-service",
    "/legal/refund-shipping",
    "/legal/ip-confidentiality",
    "/legal/order-risk",
  ]) {
    assert.match(footerSource, new RegExp(href.replace(/\//g, "\\/")));
  }
  assert.match(registerSource, /href="\/legal\/terms"/);
  assert.match(registerSource, /href="\/legal\/privacy"/);
  assert.match(registerSource, /href="\/legal\/order-risk"/);
  assert.match(quoteFormSource, /href="\/legal\/fdm-service"/);
  assert.match(quoteFormSource, /href="\/legal\/refund-shipping"/);
  assert.match(quoteFormSource, /href="\/legal\/ip-confidentiality"/);
  assert.match(quoteFormSource, /href="\/legal\/order-risk"/);
});

test("invoice UI hides public surcharge wording while showing invoice type and final payable total", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const adminDetailSource = await readSource("src/app/admin/orders/[id]/page.tsx");
  const ordersApiSource = await readSource("src/app/api/orders/route.ts");
  const registerFormSource = await readSource("src/frontend/components/RegisterForm.tsx");
  const registerApiSource = await readSource("src/app/api/account/register/route.ts");

  assert.doesNotMatch(formSource, /开票费|普通发票 \+3%|专票 \+7%|发票加收费|专票收费比例|普票加收比例/);
  assert.doesNotMatch(formSource, /\+3%|\+7%/);
  assert.match(formSource, /发票类型/);
  assert.match(formSource, /票面税率/);
  assert.match(formSource, /最终应付总价/);
  assert.match(formSource, /INVOICE_TYPE_LABELS/);
  assert.match(formSource, /useState<InvoiceSelection>\(""\)/);
  assert.match(formSource, /请选择发票类型/);
  assert.match(formSource, /formData\.set\("invoiceType", invoiceType\)/);
  assert.match(formSource, /name="riskAccepted"/);
  assert.match(formSource, /formData\.set\("riskAccepted", riskAccepted \? "true" : ""\)/);
  assert.match(formSource, /invoiceType !== "" && invoiceType !== "none"/);
  assert.match(ordersApiSource, /invoiceTypes\.includes/);
  assert.match(ordersApiSource, /calculateInvoiceTotalCents/);
  assert.match(ordersApiSource, /createOrderRiskAcceptance/);
  assert.match(ordersApiSource, /createOrderEvidenceSnapshot/);
  assert.match(ordersApiSource, /hashFileContent/);
  assert.doesNotMatch(ordersApiSource, /invoiceTotalAmountCents.*getString/);
  assert.match(registerFormSource, /name="acceptTerms"/);
  assert.match(registerFormSource, /name="acceptPrivacy"/);
  assert.match(registerApiSource, /recordRequiredUserLegalAcceptances/);
  assert.match(adminDetailSource, /基础金额 = 打印费 \+ 配送费/);
  assert.match(adminDetailSource, /发票方案调整比例/);
  assert.match(adminDetailSource, /发票调整金额/);
  assert.match(adminDetailSource, /最终应付金额/);
  assert.match(adminDetailSource, /票面税率/);
  assert.match(adminDetailSource, /getOrderRiskAcceptanceByOrderId/);
  assert.match(adminDetailSource, /getOrderEvidenceSnapshotByOrderId/);
});

test("brand logo assets are generated and applied to public entry points", async () => {
  const layoutSource = await readSource("src/app/layout.tsx");
  const navSource = await readSource("src/frontend/components/CustomerAuthBar.tsx");
  const footerSource = await readSource("src/frontend/components/SiteFooter.tsx");
  const loginSource = await readSource("src/app/account/login/page.tsx");
  const registerSource = await readSource("src/app/account/register/page.tsx");
  const bindCardSource = await readSource("src/frontend/components/WechatBindCard.tsx");
  const adminLoginSource = await readSource("src/app/admin/login/page.tsx");
  const adminOrdersSource = await readSource("src/app/admin/orders/page.tsx");

  await Promise.all([
    assertFileExists("public/brand/make3d-logo-horizontal.svg"),
    assertFileExists("public/brand/make3d-logo-horizontal.png"),
    assertFileExists("public/brand/make3d-logo-horizontal-transparent.png"),
    assertFileExists("public/brand/make3d-icon-square.svg"),
    assertFileExists("public/brand/make3d-icon-square.png"),
    assertFileExists("public/brand/make3d-icon-square-512.png"),
    assertFileExists("public/brand/make3d-icon-square-256.png"),
    assertFileExists("public/brand/make3d-icon-square-128.png"),
    assertFileExists("public/brand/make3d-icon-square-transparent.png"),
    assertFileExists("public/brand/make3d-wechat-avatar.png"),
    assertFileExists("public/brand/favicon.ico"),
    assertFileExists("design/brand/make3d-logo-horizontal.ai"),
    assertFileExists("design/brand/make3d-logo-horizontal.pdf"),
    assertFileExists("design/brand/make3d-icon-square.ai"),
    assertFileExists("design/brand/make3d-icon-square.pdf"),
    assertFileExists("design/brand/make3d-logo-source.png"),
  ]);

  assert.match(layoutSource, /\/brand\/favicon\.ico/);
  assert.match(layoutSource, /\/brand\/make3d-icon-square-256\.png/);
  assert.match(layoutSource, /\/brand\/make3d-icon-square-512\.png/);
  assert.match(navSource, /BrandLogo/);
  assert.match(footerSource, /BrandLogo/);
  assert.match(loginSource, /BrandLogo/);
  assert.match(registerSource, /BrandLogo/);
  assert.match(bindCardSource, /make3d-icon-square\.svg/);
  assert.match(adminLoginSource, /AdminBrand/);
  assert.match(adminOrdersSource, /AdminBrand/);
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
  assert.match(accountSource, /\/account\/change-password/);
  assert.doesNotMatch(accountSource, /ChangePasswordForm/);
  assert.match(accountSource, /\/account\/addresses/);
  assert.match(accountSource, /管理地址簿/);
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
  assert.match(detailSource, /付款已确认，订单已进入生产准备。/);
  assert.match(detailSource, /后续将更新为生产中。/);
  assert.match(detailSource, /订单正在生产中。/);
  assert.doesNotMatch(detailSource, /订单正在进行后处理、检查或包装。/);
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

test("quote page shows compact FDM, material, process and manual-review sidebar", async () => {
  const source = await readSource("src/app/quote/page.tsx");

  assert.match(source, /getCurrentCustomer/);
  assert.doesNotMatch(source, /QuoteLoginPrompt/);

  assert.match(source, /FDM打印说明/);
  assert.match(source, /FDM通过熔融材料逐层成型/);
  assert.match(source, /默认报价按0\.4mm喷嘴、0\.2mm层高、50%填充计算/);
  assert.match(source, /材料特性/);
  assert.match(source, /MATERIAL_GUIDANCE\.map/);
  assert.match(source, /工艺提示/);
  assert.match(source, /需要人工确认？/);
  assert.match(source, /STEP\/STP、多实体、破面、超尺寸/);
  assert.match(source, /href="\/request\/design"/);
  assert.match(source, /ContactSupportButton/);
  assert.doesNotMatch(source, /设备能力|打印设备|P1S|评估时效/);
  assert.doesNotMatch(source, /需要模型修改或工装夹具/);
  assert.doesNotMatch(source, /3MF/);
  assert.doesNotMatch(source, /价格和计费说明/);
  assert.doesNotMatch(source, /材料费/);
});

test("account pages expose registration, login, forgot password, and reset password forms", async () => {
  const registerSource = await readSource("src/app/account/register/page.tsx");
  const loginSource = await readSource("src/app/account/login/page.tsx");
  const loginFormSource = await readSource("src/frontend/components/CustomerLoginForm.tsx");
  const forgotSource = await readSource("src/app/account/forgot-password/page.tsx");

  const registerFormSource = await readSource("src/frontend/components/RegisterForm.tsx");

  assert.match(registerFormSource, /name="phone"/);
  assert.match(registerFormSource, /inputMode="numeric"/);
  assert.match(registerFormSource, /maxLength=\{11\}/);
  assert.match(registerFormSource, /pattern={mainlandPhoneHtmlPattern}/);
  assert.match(registerFormSource, /title={mainlandPhoneErrorMessage}/);
  assert.match(registerFormSource, /name="password"/);
  assert.match(registerFormSource, /name="confirmPassword"/);
  assert.match(registerFormSource, /minLength=\{8\}/);
  assert.match(registerFormSource, /name="name"/);
  assert.doesNotMatch(registerFormSource, /name="wechat"/);
  assert.match(registerFormSource, /name="email"/);
  assert.doesNotMatch(registerSource, /name="defaultAddress"/);
  assert.doesNotMatch(registerFormSource, /微信很重要/);
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
    assertFileExists("src/app/account/addresses/page.tsx"),
    assertFileExists("src/app/api/account/register/route.ts"),
    assertFileExists("src/app/api/account/login/route.ts"),
    assertFileExists("src/app/api/account/logout/route.ts"),
    assertFileExists("src/app/api/account/me/route.ts"),
    assertFileExists("src/app/api/account/forgot-password/route.ts"),
    assertFileExists("src/app/api/account/addresses/route.ts"),
    assertFileExists("src/app/api/account/addresses/[id]/route.ts"),
    assertFileExists("src/app/api/account/addresses/[id]/default/route.ts"),
  ]);
});

test("customer address book page and APIs manage owned addresses only", async () => {
  const pageSource = await readSource("src/app/account/addresses/page.tsx");
  const managerSource = await readSource("src/frontend/components/AddressBookManager.tsx");
  const addressApiSource = await readSource("src/app/api/account/addresses/route.ts");
  const addressItemApiSource = await readSource("src/app/api/account/addresses/[id]/route.ts");
  const addressDefaultApiSource = await readSource("src/app/api/account/addresses/[id]/default/route.ts");
  const databaseSource = await readSource("src/backend/database.ts");

  assert.match(pageSource, /redirect\("\/account\/login"\)/);
  assert.match(pageSource, /listCustomerAddresses/);
  assert.match(pageSource, /AddressBookManager/);
  assert.match(managerSource, /最多可保存 5 个常用地址/);
  assert.match(managerSource, /默认地址/);
  assert.match(managerSource, /确定删除该地址吗？/);
  assert.match(managerSource, /\/api\/account\/addresses\/\$\{address\.id\}\/default/);
  assert.match(managerSource, /mainlandPhoneHtmlPattern/);
  assert.match(managerSource, /CHINA_REGION_TREE/);
  assert.match(managerSource, /OTHER_DISTRICT_CODE/);
  assert.match(managerSource, /请选择省份/);
  assert.match(managerSource, /maxLength=\{10\}/);

  assert.match(addressApiSource, /getCustomerFromRequestCookie/);
  assert.match(addressApiSource, /createCustomerAddress/);
  assert.match(addressApiSource, /listCustomerAddresses/);
  assert.match(addressApiSource, /validateAndNormalizeCustomerAddressInput/);
  assert.match(addressApiSource, /readCustomerAddressInput/);
  assert.match(addressItemApiSource, /updateCustomerAddress/);
  assert.match(addressItemApiSource, /deleteCustomerAddress/);
  assert.match(addressItemApiSource, /validateAndNormalizeCustomerAddressInput/);
  assert.match(addressItemApiSource, /session\.customerId/);
  assert.match(addressDefaultApiSource, /setCustomerDefaultAddress/);
  assert.match(addressDefaultApiSource, /session\.customerId/);

  assert.match(databaseSource, /CREATE TABLE IF NOT EXISTS customer_addresses/);
  assert.match(databaseSource, /CUSTOMER_ADDRESS_LIMIT = 5/);
  assert.match(databaseSource, /province_code/);
  assert.match(databaseSource, /city_custom/);
  assert.match(databaseSource, /district_custom/);
  assert.match(databaseSource, /idx_customer_addresses_default/);
  assert.match(databaseSource, /createCustomerAddress/);
  assert.match(databaseSource, /setCustomerDefaultAddress/);
  assert.match(databaseSource, /ensureCustomerHasDefaultAddress/);

  const addressManagerSource = await readSource("src/frontend/components/AddressBookManager.tsx");
  const addressValidationSource = await readSource("src/shared/customerAddressValidation.ts");
  assert.match(addressManagerSource, /OTHER_CITY_CODE/);
  assert.match(addressManagerSource, /其他城市名称/);
  assert.match(addressValidationSource, /cityCustom/);
  assert.match(addressValidationSource, /选择其他城市时，请填写城市名称/);
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
  assert.match(menuScriptSource, /Wechat menu API creation is disabled/);
  assert.match(menuScriptSource, /certified account with custom menu API permission/);
  assert.match(menuScriptSource, /This is non-blocking/);
  assert.match(menuScriptSource, /地址管理/);
  assert.match(menuScriptSource, /订单帮助/);
  assert.match(menuScriptSource, /官方网站/);
  assert.match(readmeSource, /不把 `npm run wechat:menu` 作为部署或验证必需步骤/);
});

test("quote form supports disabled guest mode and customer prefill", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const quoteSource = await readSource("src/app/quote/page.tsx");

  assert.match(quoteSource, /<QuoteForm/);
  assert.match(quoteSource, /disabled={!customer}/);
  assert.match(quoteSource, /quoteCustomer/);
  assert.match(quoteSource, /customer={quoteCustomer}/);
  assert.match(quoteSource, /listCustomerAddresses/);
  assert.match(quoteSource, /addresses={addresses}/);
  assert.match(quoteSource, /xl:grid-cols-\[260px_minmax\(0,1fr\)\]/);
  assert.match(formSource, /disabled = false/);
  assert.match(formSource, /addresses = \[\]/);
  assert.match(formSource, /addresses\?: CustomerAddressView\[\]/);
  assert.match(formSource, /customer\?: QuoteFormCustomer/);
  assert.match(formSource, /guestUploadGateMessage/);
  assert.match(quoteSource, /SmartStickyColumn/);
  assert.match(formSource, /SmartStickyColumn/);
  assert.match(formSource, /if \(disabled\) \{/);
  assert.match(formSource, /disabled={disabled}/);
  assert.match(formSource, /disabled={isSubmitting \|\| isSubmitted \|\| hasPendingQuotes \|\| disabled \|\| !hasAddresses \|\| !riskAccepted}/);
  assert.match(formSource, /defaultValue={customer\?\.name \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.phone \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.wechat \|\| ""}/);
  assert.match(formSource, /defaultValue={customer\?\.email \|\| ""}/);
  assert.match(formSource, /文件卡片区域/);
  assert.match(formSource, /router\.push\(`\/account\/orders\/\$\{result\.id\}\/confirm`\)/);
});

test("quote form selects saved address book entries instead of editing shipping address", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

  assert.match(formSource, /选择收货地址/);
  assert.match(formSource, /管理地址簿/);
  assert.match(formSource, /\/account\/addresses/);
  assert.match(formSource, /getDefaultAddress\(addresses\)/);
  assert.match(formSource, /selectedAddressId/);
  assert.match(formSource, /selectedAddress/);
  assert.match(formSource, /formatCustomerAddress\(address\)/);
  assert.match(formSource, /formatCustomerAddress\(selectedAddress\)/);
  assert.match(formSource, /name="addressId"/);
  assert.match(formSource, /请先添加收货地址后再提交订单。/);
  assert.match(formSource, /添加地址/);
  assert.match(formSource, /name="customerName"/);
  assert.match(formSource, /name="phone"/);
  assert.match(formSource, /isValidMainlandPhone\(phone\)/);
  assert.match(formSource, /name="wechat"/);
  assert.match(formSource, /name="email"/);
  assert.match(formSource, /type="hidden"/);
  assert.match(formSource, /name="shippingMethod"/);
  assert.match(formSource, /name="remark"/);
  assert.match(formSource, /formData\.set\("addressId", String\(selectedAddress\.id\)\)/);
  assert.doesNotMatch(formSource, /name="recipientName"/);
  assert.doesNotMatch(formSource, /name="recipientPhone"/);
  assert.doesNotMatch(formSource, /name="addressRegion"/);
  assert.doesNotMatch(formSource, /name="addressDetail"/);

  assert.match(estimateSource, /DEFAULT_LEAD_TIME_MIN_HOURS = 48/);
  assert.match(estimateSource, /DEFAULT_LEAD_TIME_MAX_HOURS = 72/);
});

test("quote form keeps upload, per-file options, safe dimensions, estimates, and summary", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

  assert.match(formSource, /onDrop={handleDrop}/);
  assert.match(formSource, /\/api\/quote\/slice/);
  assert.match(formSource, /fileSliceStatus/);
  assert.match(formSource, /fileSliceMessage/);
  assert.match(formSource, /fileFilamentWeightG/);
  assert.match(formSource, /filePrintTimeSeconds/);
  assert.match(formSource, /fileQuantities/);
  assert.match(formSource, /fileUnitPrice/);
  assert.match(formSource, /fileSubtotalPrice/);
  assert.match(formSource, /savedFilenames/);
  assert.match(formSource, /savedFilepaths/);
  assert.match(formSource, /savedFilesizes/);
  assert.match(formSource, /savedUpload/);
  assert.doesNotMatch(formSource, /formData\.append\("modelFiles", item\.file\)/);
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
  assert.match(formSource, /正在上传/);
  assert.match(formSource, /正在分析模型/);
  assert.match(formSource, /正在生成报价/);
  assert.match(formSource, /报价完成/);
  assert.match(formSource, /已等待/);
  assert.match(formSource, /模型较复杂，正在继续计算，请稍候/);
  assert.match(formSource, /计算超时，需人工确认/);
  assert.match(formSource, /切片超时/);
  assert.match(formSource, /文件格式不支持/);
  assert.match(formSource, /切片配置缺失/);
  assert.match(formSource, /服务器繁忙/);
  assert.match(formSource, /void runSliceForFile\(item\)/);
  assert.match(formSource, /runSliceForFile/);
  assert.match(formSource, /DEFAULT_COLOR = "白"/);
  assert.match(formSource, /SLICE_MATERIAL = "PETG"/);
  assert.match(formSource, /文件正在自动切片，完成后将更新总价。调整材料和颜色不会重新切片。/);
  assert.match(formSource, /报价计算中/);
  assert.doesNotMatch(formSource, /整单计算报价/);
  assert.doesNotMatch(formSource, /calculateOrderQuote/);
  assert.doesNotMatch(formSource, /请先计算报价/);
  assert.match(formSource, /disabled={isSubmitting \|\| isSubmitted \|\| hasPendingQuotes \|\| disabled \|\| !hasAddresses \|\| !riskAccepted}/);
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
  assert.match(formSource, /formatSliceStatus\(quote\)/);
  assert.doesNotMatch(formSource, /<QuoteMetric label="报价状态"/);
  assert.doesNotMatch(formSource, /<QuoteMetric label="材料"/);
  assert.doesNotMatch(formSource, /<QuoteMetric label="数量"/);
  assert.doesNotMatch(formSource, /耗材重量/);
  assert.doesNotMatch(formSource, /材料费/);
  assert.doesNotMatch(formSource, /工时费/);
  assert.doesNotMatch(formSource, /预估价格区间/);
  assert.doesNotMatch(formSource, /打印时间/);
  assert.match(formSource, /如需加急，请在备注中说明，加急可能产生额外费用。/);
  assert.match(formSource, /打印费用/);
  assert.match(formSource, /应付总价/);
  assert.match(formSource, /预计交货期/);
  assert.match(formSource, /最终价格以人工确认为准/);
  assert.doesNotMatch(formSource, /DimensionField/);
  assert.doesNotMatch(formSource, /label="包装费"/);
  assert.doesNotMatch(formSource, /正在调用 PrusaSlicer/);
  assert.match(formSource, /文件小计/);
  assert.match(formSource, /getFileSubtotalPrice/);
  assert.match(formSource, /quote\.result\.printTimeSeconds \* quote\.quantity/);
  assert.match(formSource, /getMaterialRate\(material\)/);
  assert.match(formSource, /fileSliceMessage/);
});

test("quote form displays zero before valid auto quotes and removes the whole-order minimum", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const orderSource = await readSource("src/app/api/orders/route.ts");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");

  assert.match(formSource, /applyMinimumPrintUnitPrice/);
  assert.match(formSource, /calculateLinePrintTotal/);
  assert.match(formSource, /const isZeroDisplay = !hasFiles \|\| isCalculating/);
  assert.match(formSource, /formatMoney\(0\)/);
  assert.match(formSource, /上传模型并完成报价后自动计算/);
  assert.match(formSource, /正在生成报价/);
  assert.match(formSource, /待人工确认/);
  assert.match(formSource, /当前自动报价小计/);
  assert.match(formSource, /报价完成后计入/);
  assert.doesNotMatch(formSource, /Math\.max\(printFeeTotal \+ shippingAmount, 20\)/);
  assert.doesNotMatch(formSource, /<h2 className="text-lg font-bold">材料特性<\/h2>/);

  assert.match(orderSource, /calculateLinePrintTotal/);
  assert.match(orderSource, /isSameMoney/);
  assert.match(orderSource, /报价金额已更新，请刷新后重试/);
  assert.match(orderSource, /请先上传模型并完成报价/);
  assert.match(orderSource, /payablePrice: exactOrderPrice/);
  assert.doesNotMatch(orderSource, /Math\.max\(autoPrintPrice \+ shippingAmount, 20\)/);
  assert.doesNotMatch(estimateSource, /ORDER_MIN_PRICE/);
});

test("quote form restores active drafts without re-slicing saved results", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const estimateSource = await readSource("src/frontend/lib/quote-estimates.ts");
  const databaseSource = await readSource("src/backend/database.ts");
  const sliceSource = await readSource("src/app/api/quote/slice/route.ts");
  const draftSource = await readSource("src/app/api/quote/draft/route.ts");
  const draftFileSource = await readSource("src/app/api/quote/draft/files/[id]/route.ts");
  const draftDownloadSource = await readSource("src/app/api/quote/draft/files/[id]/download/route.ts");
  const orderSource = await readSource("src/app/api/orders/route.ts");
  const uploadsSource = await readSource("src/backend/uploads.ts");

  assert.match(databaseSource, /QUOTE_DRAFT_TTL_MS = 24 \* 60 \* 60 \* 1000/);
  assert.match(databaseSource, /CREATE TABLE IF NOT EXISTS quote_drafts/);
  assert.match(databaseSource, /CREATE TABLE IF NOT EXISTS quote_draft_files/);
  assert.match(databaseSource, /getActiveQuoteDraft/);
  assert.match(databaseSource, /addQuoteDraftFile/);
  assert.match(databaseSource, /markActiveQuoteDraftSubmitted/);
  assert.match(estimateSource, /export function estimateFiles<T extends SelectedQuoteFile>/);

  assert.match(formSource, /fetch\("\/api\/quote\/draft", \{ credentials: "same-origin", cache: "no-store" \}\)/);
  assert.match(formSource, /restoreQuoteDraft\(data\.draft\.files\)/);
  assert.match(formSource, /createDraftModelFile/);
  assert.match(formSource, /createDraftQuoteState/);
  assert.match(formSource, /fileUrl: `\/api\/quote\/draft\/files\/\$\{draftFile\.id\}\/download`/);
  assert.match(formSource, /if \(!\(item\.file instanceof File\)\) \{/);
  assert.match(formSource, /rememberDraftFile\(item\.id, draftFileId\)/);
  assert.match(formSource, /draft_file_id/);
  assert.match(formSource, /updateQuoteDraftFile\(currentFile\.draftFileId/);
  assert.match(formSource, /deleteQuoteDraftFile\(currentFile\.draftFileId\)/);
  assert.match(formSource, /updatePreviewDimensions/);
  assert.match(formSource, /fileUrl={item\.fileUrl}/);

  assert.match(sliceSource, /addQuoteDraftFile/);
  assert.match(sliceSource, /material = getString\(formData, "material"\) \|\| WEIGHT_MATERIAL/);
  assert.match(sliceSource, /color = getString\(formData, "color"\) \|\|/);
  assert.match(sliceSource, /quantity = getQuantity\(formData, "quantity"\)/);
  assert.match(sliceSource, /draft_file_id: draftFileId/);

  assert.match(draftSource, /getActiveQuoteDraft/);
  assert.match(draftSource, /getCustomerFromRequestCookie/);
  assert.match(draftFileSource, /updateQuoteDraftFile/);
  assert.match(draftFileSource, /deleteQuoteDraftFile/);
  assert.match(draftFileSource, /deleteSavedUploadArtifacts/);
  assert.match(uploadsSource, /getUploadCleanupFailureLogPath/);
  assert.match(uploadsSource, /upload-cleanup-failures\.jsonl/);
  assert.match(uploadsSource, /recordUploadCleanupFailure/);
  assert.match(draftDownloadSource, /getQuoteDraftFileForCustomer/);
  assert.match(draftDownloadSource, /readFile/);
  assert.match(orderSource, /markActiveQuoteDraftSubmitted\(db, customer\.id\)/);
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

test("browser STL preview renders dimensions without server thumbnail work", async () => {
  const formSource = await readSource("src/frontend/components/QuoteForm.tsx");
  const previewSource = await readSource("src/frontend/components/StlModelPreview.tsx");
  const previewLibSource = await readSource("src/frontend/lib/stl-preview.ts");
  const customerDetailSource = await readSource("src/app/account/orders/[id]/page.tsx");
  const adminDetailSource = await readSource("src/app/admin/orders/[id]/page.tsx");
  const customerDownloadSource = await readSource("src/app/api/account/files/[id]/download/route.ts");

  assert.match(previewLibSource, /import\("three"\)/);
  assert.match(previewLibSource, /import\("three\/addons\/loaders\/STLLoader\.js"\)/);
  assert.match(previewLibSource, /import\("three\/addons\/controls\/OrbitControls\.js"\)/);
  assert.match(previewLibSource, /new STLLoader\(\)\.parse\(buffer\)/);
  assert.match(previewLibSource, /MAX_AUTO_STL_PREVIEW_BYTES = 50 \* 1024 \* 1024/);
  assert.match(previewLibSource, /shouldAutoLoadStlPreview/);
  assert.match(previewLibSource, /value > 260/);
  assert.match(previewLibSource, /value > 0 && value < 10/);
  assert.match(previewLibSource, /该模型尺寸超过单台设备推荐成型范围/);
  assert.match(previewLibSource, /该模型存在较小尺寸/);
  assert.match(previewLibSource, /disposeRenderer/);
  assert.doesNotMatch(previewLibSource, /headless|OpenGL|Blender|VTK/i);

  assert.match(previewSource, /use client/);
  assert.match(previewSource, /if \(!isStl \|\| !autoLoad \|\| !canvasRef\.current\)/);
  assert.match(previewSource, /点击加载预览/);
  assert.match(previewSource, /filesize > MAX_AUTO_STL_PREVIEW_BYTES/);
  assert.match(previewSource, /setModalOpen\(true\)/);
  assert.match(previewSource, /查看3D模型/);
  assert.match(previewSource, /handleRef\.current\?\.dispose\(\)/);
  assert.match(previewSource, /模型预览加载失败，不影响报价提交/);
  assert.match(previewSource, /STL 文件通常不包含单位，系统默认按 mm 识别/);

  assert.match(formSource, /StlModelPreview/);
  assert.match(formSource, /stlDimensions/);
  assert.match(formSource, /updatePreviewDimensions/);
  assert.match(formSource, /file={item\.file instanceof File \? item\.file : undefined}/);
  assert.match(formSource, /formatDimensionFormValue\(displayDimensions\?\.x\)/);

  assert.match(customerDetailSource, /StlModelPreview/);
  assert.match(customerDetailSource, /\/api\/account\/files\/\$\{file\.id\}\/download/);
  assert.match(adminDetailSource, /StlModelPreview/);
  assert.match(adminDetailSource, /\/api\/admin\/files\/\$\{file\.id\}\/download/);
  assert.match(customerDownloadSource, /getCustomerFromRequestCookie/);
  assert.match(customerDownloadSource, /getOrderByIdForCustomer/);
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
  assert.match(detailSource, /shippingProvince/);
  assert.match(detailSource, /shippingCity/);
  assert.match(detailSource, /shippingDistrict/);
  assert.match(detailSource, /shippingDetailAddress/);
  assert.match(detailSource, /shippingPostalCode/);
  assert.match(detailSource, /shippingLabel/);
  assert.match(detailSource, /formatShippingAddress/);
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
  assert.match(detailSource, /quoteDefaultPrice/);
  assert.match(detailSource, /quoteDefaultLeadTime/);
  assert.match(detailSource, /当前状态/);
  assert.match(detailSource, /最终金额/);
  assert.match(detailSource, /下一步/);
  assert.match(detailSource, /模型与报价/);
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
  assert.match(apiSource, /getSavedUploadList/);
  assert.match(apiSource, /validateSavedUploadReference/);
  assert.match(apiSource, /savedFilenames/);
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
  assert.match(apiSource, /shippingFee: allFilesAutoQuoted \? shipping\.amount : null/);
  assert.match(apiSource, /shippingMethod: getString\(formData, "shippingMethod"\)/);
  assert.match(apiSource, /getCustomerAddressByIdForCustomer/);
  assert.match(apiSource, /getPositiveInteger\(formData, "addressId"\)/);
  assert.match(apiSource, /recipientName: shippingAddress\.recipientName/);
  assert.match(apiSource, /recipientPhone: shippingAddress\.phone/);
  assert.match(apiSource, /addressRegion,/);
  assert.match(apiSource, /addressDetail: shippingAddress\.detailAddress/);
  assert.match(apiSource, /shippingProvince: shippingAddress\.province/);
  assert.match(apiSource, /shippingAddressSnapshot: JSON\.stringify\(addressSnapshot\)/);
  assert.match(apiSource, /shippingRemark: getString\(formData, "shippingRemark"\)/);
  assert.match(apiSource, /createOrderWithFiles/);
  assert.match(apiSource, /getSliceQuoteList/);
  assert.match(apiSource, /getManualReviewReason/);
  assert.match(apiSource, /STEP\/STP 文件暂不自动切片/);
  assert.match(apiSource, /自动切片失败/);
  assert.match(apiSource, /createSliceJob/);
  assert.match(apiSource, /updateSliceJobSuccess/);
  assert.match(apiSource, /calculateAutoLeadTimeHours/);
  assert.doesNotMatch(apiSource, /company: getString\(formData, "company"\)/);
});

test("customer APIs require login before quote slicing and order submission", async () => {
  const sliceSource = await readSource("src/app/api/quote/slice/route.ts");
  const orderSource = await readSource("src/app/api/orders/route.ts");

  assert.match(sliceSource, /getCustomerFromRequestCookie/);
  assert.match(sliceSource, /analyzeStlTopology/);
  assert.match(sliceSource, /检测到该文件包含多个可拆分实体，需要人工确认报价。/);
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

test("admin order detail keeps core cards in the main content column", async () => {
  const source = await readSource("src/app/admin/orders/[id]/page.tsx");
  const stickySource = await readSource("src/frontend/components/SmartStickyColumn.tsx");

  assert.match(source, /orderPageGrid/);
  assert.match(source, /orderMainColumn/);
  assert.match(source, /orderActionColumn/);
  assert.match(source, /orderInfoGrid/);
  assert.match(source, /xl:grid-cols-\[minmax\(0,1fr\)_360px\]/);
  assert.match(source, /SmartStickyColumn/);
  assert.match(source, /<main className="orderMainColumn/);
  assert.match(source, /<SmartStickyColumn topOffset=\{20\}>[\s\S]*<aside className="orderActionColumn/);
  assert.doesNotMatch(source, /orderActionColumn[^"]*sticky/);
  assert.doesNotMatch(source, /orderActionColumn[^"]*overflow/);
  assert.doesNotMatch(source, /xl:sticky xl:top-5/);
  assert.match(stickySource, /ResizeObserver/);
  assert.match(stickySource, /requestAnimationFrame/);
  assert.match(stickySource, /disabledBelow = DEFAULT_DESKTOP_WIDTH/);
  assert.match(stickySource, /contentHeight <= availableHeight/);
  assert.match(stickySource, /long-down/);
  assert.match(stickySource, /long-up/);
  assert.match(stickySource, /window\.innerWidth < disabledBelow/);
  assert.match(stickySource, /content\.style\.transform = "none"/);
  assert.match(stickySource, /translate3d/);
  assert.match(source, /lg:grid-cols-2/);
  assert.match(source, /lg:col-span-2/);
  assert.doesNotMatch(source, /className="contents"/);
  assert.doesNotMatch(source, /xl:col-start|xl:row-start|row-span/);
  assert.match(source, /TEST账号/);
  assert.match(source, /NotificationDiagnostics/);
  assert.match(source, /maskPhone/);
  assert.match(source, /formatShippingCopyBlock\(order\)/);
  assert.match(source, /shippingCityCustom \|\| order\.shippingCity/);
});

test("manual payment confirmation workflow pages avoid customer proof upload", async () => {
  const accountSource = await readSource("src/app/account/page.tsx");
  const customerDetailSource = await readSource("src/app/account/orders/[id]/page.tsx");
  const customerConfirmSource = await readSource("src/app/account/orders/[id]/confirm/page.tsx");
  const customerPaymentSource = await readSource("src/frontend/components/CustomerPaymentOptions.tsx");
  const adminDetailSource = await readSource("src/app/admin/orders/[id]/page.tsx");
  const adminFinalQuoteSource = await readSource("src/frontend/components/AdminFinalQuoteForm.tsx");
  const adminPaymentConfirmSource = await readSource("src/frontend/components/AdminPaymentConfirmForm.tsx");
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
  assert.match(customerPaymentSource, /银行转账/);
  assert.match(customerPaymentSource, /在线付款资料正在配置中/);
  assert.doesNotMatch(customerPaymentSource, /闲鱼链接|淘宝链接/);
  assert.doesNotMatch(customerDetailSource, /付款凭证|paymentProof|上传截图|我已付款/);
  assert.doesNotMatch(customerConfirmSource, /付款凭证|paymentProof|上传截图|我已付款/);
  assert.doesNotMatch(customerPaymentSource, /付款凭证|paymentProof|上传截图|我已付款/);

  assert.match(adminFinalQuoteSource, /确认报价并通知客户/);
  assert.match(adminPaymentConfirmSource, /确认到账/);
  assert.match(adminPaymentConfirmSource, /实收金额/);
  assert.match(adminPaymentConfirmSource, /差额原因/);
  assert.match(adminDetailSource, /付款时请备注：订单编号\/手机号/);
  assert.match(adminDetailSource, /PaymentRecords/);
  assert.match(paymentConfirmSource, /updateOrderStatusAndNotify/);
  assert.match(paymentConfirmSource, /status: "已付款"/);
  assert.match(paymentConfirmSource, /paidAmount/);
  assert.match(paymentConfirmSource, /paymentNote/);
  assert.match(paymentConfirmSource, /wechatStatus/);
  assert.match(finalQuoteSource, /confirmOrderFinalQuote/);
  assert.match(finalQuoteSource, /notifyCustomerOrderStatus/);
});

test("admin payment settings page and API exist", async () => {
  const pageSource = await readSource("src/app/admin/settings/payment/page.tsx");
  const formSource = await readSource("src/frontend/components/AdminPaymentSettingsForm.tsx");
  const apiSource = await readSource("src/app/api/admin/settings/payment/route.ts");

  assert.match(formSource, /微信收款码图片路径/);
  assert.match(formSource, /支付宝收款码图片路径/);
  assert.match(formSource, /银行转账/);
  assert.match(formSource, /付款方式默认关闭/);
  assert.doesNotMatch(formSource, /闲鱼付款链接|淘宝付款链接/);
  assert.match(pageSource, /AdminPaymentSettingsForm/);
  assert.match(apiSource, /updatePaymentSettings/);
  assert.match(apiSource, /bankEnabled/);
  assert.match(apiSource, /requireAdminSession/);
});

test("success page and contact information section remain available", async () => {
  const successSource = await readSource("src/app/success/page.tsx");
  const contactSource = await readSource("src/frontend/components/ContactSection.tsx");

  assert.match(successSource, /提交成功|鎻愪氦鎴愬姛/);
  assert.match(contactSource, /21899835@qq\.com/);
  assert.match(contactSource, /ContactSection/);
});
