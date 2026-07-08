export const LEGAL_SOURCE_VERSION = "v0.11 legal risk revision draft";
export const LEGAL_PUBLIC_VERSION = "v1.0";
export const LEGAL_EFFECTIVE_DATE = "2026-07-08";
export const LEGAL_LAST_UPDATED_DATE = "2026-07-08";

export const LEGAL_SOURCE_PACKAGE = {
  directory: "docs/legal-source/V0.11/",
  zip: "docs/legal-source/V0.11/Make3D_协议与证据留存资料包_v0.11_法律风险修订稿.zip",
  requiredModules: [
    "用户服务协议",
    "隐私政策",
    "定制制造服务条款及FDM工艺标准",
    "售后返工退换退款与物流规则",
    "模型文件知识产权保密与禁止制造规则",
    "注册订单与异常模型确认文案",
    "FDM风险与责任划分表",
    "数据保存期限",
    "数据库字段和证据快照",
    "后台协议版本管理",
    "企业客户定制制造补充协议",
    "知识产权投诉暂停隔离与反通知流程",
    "违法违禁模型识别复核与报告流程",
    "Legal Hold / 争议保留 / 证据留存相关规则",
  ],
};

export const COMPANY_LEGAL_SNAPSHOT = {
  company_name: "西安瑞淞增材技术有限公司",
  unified_social_credit_code: "91610113MAEK6AUB19",
  registered_address: "陕西省西安市雁塔区小寨东路196号1幢11907室华博众创081号（集群）",
  legal_representative: "胡云玲",
  contact_address: "陕西省西安市雁塔区小寨东路196号",
  customer_service_phone: "",
  customer_service_email: "",
  customer_service_hours: "工作日 9:00-22:00",
};

export const CANCELLATION_POLICY_SNAPSHOT = {
  policy_version: LEGAL_PUBLIC_VERSION,
  unpaid_cancel_rule: "未支付订单客户可取消，不产生打印费用。",
  before_processing_rule: "已支付但平台尚未开始处理的订单原则上可取消并退款，具体以后端订单状态和实际处理进度为准。",
  after_slicing_rule:
    "已进入切片、模型检查、排产、备料、打印任一环节的，视为定制服务已经开始履行；客户因自身原因取消的，仅退还尚未发生的配送费用，打印费、模型处理费、排产占用等服务费用不予退还。",
  after_scheduling_rule:
    "已排产或备料后客户因自身原因取消的，仅退还尚未发生的配送费用，已发生的定制制造服务费用不予退还。",
  after_printing_rule:
    "已打印但未发货的订单，客户因自身原因取消的，仅退还尚未发生的配送费用；打印费用不退。",
  after_shipping_rule:
    "已发货订单客户因自身原因不支持取消；如发生质量问题或物流损坏，按售后规则处理。",
  shipping_refund_rule:
    "平台责任、质量问题或普通快递、顺丰、跑腿配送损坏，经客户提交有效证明后按售后规则免费补件、返工或退款。",
};

export const FILE_RETENTION_SNAPSHOT = {
  retention_version: LEGAL_PUBLIC_VERSION,
  retention_months: 6,
  retention_start_event: "最后一次打印或订单完成之日",
  last_print_extends_retention: true,
  legal_hold_exception: true,
};

export const LEGAL_PAGE_SECTIONS = [
  {
    title: "用户服务协议",
    body: [
      "Make3D 为客户提供模型上传、报价、订单确认、FDM 定制制造、配送及售后协助服务。客户提交订单前应确认模型文件、材料颜色、数量、配送方式、发票类型和联系信息。",
      "平台可对异常模型、违法违禁模型、疑似侵权模型或超出工艺能力的订单进行人工复核、暂停、隔离、拒绝制造或要求客户补充确认。",
    ],
  },
  {
    title: "隐私政策与数据保存",
    body: [
      "平台为完成报价、生产、支付、发票、物流、售后、争议处理、安全审计和法律义务，处理客户提交的账户、联系方式、订单、模型文件、支付和物流信息。",
      "客户上传的模型文件、订单生产文件和相关记录，默认自最后一次打印或订单完成之日起保留 6 个月；再次打印同一文件或基于同一文件产生新订单的，保留期限自最近一次打印或订单完成之日起重新计算 6 个月。",
      "保留期届满后，平台可删除、归档或脱敏处理相关文件。与订单、售后、发票、支付、物流、争议处理、安全审计、法律义务有关的必要记录，可依法在必要期限内继续保存。",
      "客户可联系客服申请删除不再需要的平台文件，但未完成订单、售后、争议、法定义务或安全审计所必需的文件可暂缓删除。平台不承诺无限期保存客户原始文件，客户应自行保留源文件备份。",
    ],
  },
  {
    title: "定制制造服务条款及 FDM 工艺标准",
    body: [
      "FDM 打印存在层纹、支撑痕、轻微色差、尺寸公差、孔径和装配间隙偏差等正常工艺风险。精密装配、承重、高温、密封或安全关键用途应在订单中明确说明并由平台人工确认。",
      "订单证据将保存模型摘要、报价、风险确认、客户选择、发票计算、公司信息、取消规则、文件保留规则及后台处理记录，用于售后、争议和合规留存。",
    ],
  },
  {
    title: "发票规则",
    body: [
      "客户提交订单前必须选择不需要发票、电子普通发票或增值税专用发票。选择发票的，应先完善并选择对应发票资料。",
      "电子普通发票和增值税专用发票票面税率均为 1%。订单提交后原则上不支持变更发票类型。",
      "每个客户最多保存 2 条发票资料。普通发票资料至少包括发票抬头全称、纳税人识别号或统一社会信用代码、接收邮箱或手机号。专用发票资料包括发票抬头全称、纳税人识别号或统一社会信用代码、注册地址、注册电话、开户银行、银行账号、接收邮箱或手机号。",
    ],
  },
  {
    title: "取消、售后、物流与退款",
    body: [
      CANCELLATION_POLICY_SNAPSHOT.unpaid_cancel_rule,
      CANCELLATION_POLICY_SNAPSHOT.before_processing_rule,
      CANCELLATION_POLICY_SNAPSHOT.after_slicing_rule,
      CANCELLATION_POLICY_SNAPSHOT.after_printing_rule,
      CANCELLATION_POLICY_SNAPSHOT.after_shipping_rule,
      "平台不支持到付，不支持客户自提。支持普通快递、顺丰和系统可用的跑腿配送。",
      "配送过程中发生损坏，经客户按要求提供外包装照片、破损部位照片、快递面单照片、订单号、收货时间，必要时提供开箱视频后，平台按售后规则免费补件。",
    ],
  },
  {
    title: "模型文件知识产权、保密与禁止制造",
    body: [
      "客户应确保其上传模型及委托制造行为不侵犯第三方知识产权，不涉及违法违禁物品、危险用途或平台禁止制造范围。",
      "平台对客户模型文件和订单生产文件按订单履行、售后、证据留存和法律义务范围使用，不向无关第三方公开。收到知识产权投诉或违法违禁线索时，平台可暂停、隔离、复核、通知客户提交说明，并在必要时依法配合处理。",
    ],
  },
  {
    title: "企业客户补充与争议保留",
    body: [
      "企业客户可另行签署定制制造补充协议，对批量交付、验收、保密、知识产权、账期和违约责任进行约定。",
      "出现投诉、争议、监管要求、安全事件或潜在法律责任时，平台可对相关订单、模型、沟通、支付、物流、售后和后台操作记录采取 Legal Hold、争议保留或证据留存措施。",
    ],
  },
];

export const LEGAL_DOCUMENT_PAGES = [
  {
    slug: "terms",
    navTitle: "用户服务协议",
    title: LEGAL_PAGE_SECTIONS[0].title,
    body: LEGAL_PAGE_SECTIONS[0].body,
  },
  {
    slug: "privacy",
    navTitle: "隐私政策",
    title: LEGAL_PAGE_SECTIONS[1].title,
    body: LEGAL_PAGE_SECTIONS[1].body,
  },
  {
    slug: "fdm-service",
    navTitle: "定制制造服务条款及FDM工艺标准",
    title: LEGAL_PAGE_SECTIONS[2].title,
    body: LEGAL_PAGE_SECTIONS[2].body,
  },
  {
    slug: "refund-shipping",
    navTitle: "售后返工退换退款与物流规则",
    title: LEGAL_PAGE_SECTIONS[4].title,
    body: LEGAL_PAGE_SECTIONS[4].body,
  },
  {
    slug: "ip-confidentiality",
    navTitle: "模型文件知识产权保密与禁止制造规则",
    title: LEGAL_PAGE_SECTIONS[5].title,
    body: LEGAL_PAGE_SECTIONS[5].body,
  },
  {
    slug: "order-risk",
    navTitle: "注册订单与异常模型确认文案",
    title: "注册订单与异常模型确认文案",
    body: [
      "客户提交注册、报价和订单信息时，应确保联系方式、模型文件、材料颜色、数量、配送方式、发票类型和备注要求真实、完整、可用于履约。",
      "平台发现异常模型、尺寸风险、工艺风险、疑似侵权、违法违禁、危险用途、超出 FDM 工艺能力或需要人工复核的情形时，可以暂停自动报价、要求补充确认、转人工处理或拒绝制造。",
      ...LEGAL_PAGE_SECTIONS[2].body,
      ...LEGAL_PAGE_SECTIONS[4].body,
    ],
  },
] as const;

export const LEGAL_ACCEPTANCE_DOCUMENT_SLUGS = ["terms", "privacy"] as const;

export const ORDER_RISK_CONFIRMATION_VERSION = LEGAL_PUBLIC_VERSION;

export const ORDER_RISK_CONFIRMATION_ITEMS = [
  "我已确认模型文件、材料、颜色、数量、配送方式、发票类型和联系方式真实完整。",
  "我理解 FDM 打印可能存在层纹、支撑痕、轻微色差、尺寸公差、孔径和装配间隙偏差等正常工艺风险。",
  "我理解异常模型、疑似侵权、违法违禁、危险用途或超出工艺能力的订单可能被暂停、复核、拒绝制造或要求补充确认。",
  "我已阅读并同意定制制造、取消订单、售后退款、物流损坏补件、文件保密和保存期限相关规则。",
] as const;

export function getLegalDocumentPage(slug: string) {
  return LEGAL_DOCUMENT_PAGES.find((page) => page.slug === slug) || null;
}
