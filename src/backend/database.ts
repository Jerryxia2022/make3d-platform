import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { verifyCustomerSessionToken } from "./customerSessionCore.js";

export type OrderInput = {
  customerId?: number | null;
  customerName: string;
  phone: string;
  wechat: string;
  email?: string;
  company?: string;
  material?: string;
  color?: string;
  quantity: number;
  remark?: string;
  estimatedPrice: number;
  estimatedPriceMin?: number | null;
  estimatedPriceMax?: number | null;
  estimatedLeadTimeMinHours?: number;
  estimatedLeadTimeMaxHours?: number;
  packagingFee?: number;
  shippingFee?: number | null;
  shippingMethod?: string;
  shippingFeeEstimate?: string;
  recipientName?: string;
  recipientPhone?: string;
  addressRegion?: string;
  addressDetail?: string;
  shippingProvince?: string | null;
  shippingCity?: string | null;
  shippingCityCustom?: string | null;
  shippingDistrict?: string | null;
  shippingProvinceCode?: string | null;
  shippingProvinceName?: string | null;
  shippingCityCode?: string | null;
  shippingCityName?: string | null;
  shippingDistrictCode?: string | null;
  shippingDistrictName?: string | null;
  shippingDistrictCustom?: string | null;
  shippingDetailAddress?: string | null;
  shippingPostalCode?: string | null;
  shippingLabel?: string | null;
  shippingAddressSnapshot?: string | null;
  shippingRemark?: string;
  printFeeTotal?: number;
  payablePrice?: number | null;
  estimatedLeadTimeHours?: number;
  finalPrice?: number | null;
  finalLeadTimeHours?: number | null;
  priceAdjustmentReason?: string | null;
  productionNote?: string | null;
  assignedPrinter?: string | null;
  estimatedStartAt?: string | null;
  estimatedFinishAt?: string | null;
  actualStartAt?: string | null;
  actualFinishAt?: string | null;
  internalNote?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  paidAt?: string | null;
  paymentNote?: string | null;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  shippingNote?: string | null;
  adminRemark?: string | null;
  files: OrderFileInput[];
};

export type OrderFileInput = {
  filename: string;
  filepath: string;
  filesize: number;
  material: string;
  color: string;
  boundingBoxX?: number | null;
  boundingBoxY?: number | null;
  boundingBoxZ?: number | null;
  estimatedPriceMin?: number | null;
  estimatedPriceMax?: number | null;
  estimatedLeadTimeMinHours?: number;
  estimatedLeadTimeMaxHours?: number;
  riskNotice?: string;
  riskLevel?: string;
  requiresManualConfirmation?: boolean;
  materialSalesRate?: number;
  materialCostRate?: number;
  quantity?: number;
  unitPrice?: number | null;
  subtotalPrice?: number | null;
};

export const QUOTE_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type QuoteDraftFileInput = {
  customerId: number;
  originalFilename: string;
  filename: string;
  filepath: string;
  filesize: number;
  material: string;
  color: string;
  quantity: number;
  boundingBoxX?: number | null;
  boundingBoxY?: number | null;
  boundingBoxZ?: number | null;
  sliceStatus: string;
  errorMessage?: string | null;
  filamentWeightG?: number | null;
  printTimeSeconds?: number | null;
  rawFilamentUsedMm?: number | null;
  rawFilamentUsedCm3?: number | null;
  rawFilamentUsedG?: number | null;
  filamentWeightSource?: string | null;
  materialDensity?: number | null;
  materialFee?: number | null;
  timeFee?: number | null;
  basePrintPrice?: number | null;
};

export type QuoteDraftFileUpdateInput = {
  material?: string | null;
  color?: string | null;
  quantity?: number | null;
  boundingBoxX?: number | null;
  boundingBoxY?: number | null;
  boundingBoxZ?: number | null;
};

export type QuoteDraftRecord = {
  id: number;
  customerId: number;
  status: string;
  expiresAt: number;
  createdAt: string;
  updatedAt: string;
};

export type QuoteDraftFileRecord = {
  id: number;
  draftId: number;
  originalFilename: string;
  filename: string;
  filepath: string;
  filesize: number;
  material: string | null;
  color: string | null;
  quantity: number;
  boundingBoxX: number | null;
  boundingBoxY: number | null;
  boundingBoxZ: number | null;
  sliceStatus: string;
  errorMessage: string | null;
  filamentWeightG: number | null;
  printTimeSeconds: number | null;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: string | null;
  materialDensity: number | null;
  materialFee: number | null;
  timeFee: number | null;
  basePrintPrice: number | null;
  createdAt: string;
  updatedAt: string;
};

export type QuoteDraftDetail = QuoteDraftRecord & {
  files: QuoteDraftFileRecord[];
};

export const CUSTOMER_ADDRESS_LIMIT = 5;

export type CustomerAddressInput = {
  recipientName: string;
  phone: string;
  province?: string;
  city?: string;
  district?: string;
  provinceCode?: string | null;
  provinceName?: string | null;
  cityCode?: string | null;
  cityName?: string | null;
  cityCustom?: string | null;
  districtCode?: string | null;
  districtName?: string | null;
  districtCustom?: string | null;
  detailAddress: string;
  postalCode?: string | null;
  label?: string | null;
  isDefault?: boolean;
};

export type CustomerAddressRecord = CustomerAddressInput & {
  id: number;
  customerId: number;
  province: string;
  city: string;
  district: string;
  provinceCode: string | null;
  provinceName: string | null;
  cityCode: string | null;
  cityName: string | null;
  cityCustom: string | null;
  districtCode: string | null;
  districtName: string | null;
  districtCustom: string | null;
  postalCode: string | null;
  label: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SingleFileOrderInput = Omit<OrderInput, "files"> & {
  material: string;
  file: {
    filename: string;
    filepath: string;
    filesize: number;
  };
};

export type CreatedOrder = {
  id: number;
  orderNo: string;
};

export type CustomerAccountInput = {
  phone: string;
  password: string;
  name: string;
  wechat: string;
  email?: string;
  defaultAddress?: string;
};

export type CustomerRecord = {
  id: number;
  phone: string;
  passwordHash: string;
  name: string;
  wechat: string;
  email: string | null;
  defaultAddress: string | null;
  isTestAccount: boolean;
  createdAt: string;
};

export type WechatAccountRecord = {
  id: number;
  customerId: number | null;
  openid: string | null;
  unionid: string | null;
  subscribed: boolean;
  bindCode: string | null;
  bindCodeExpiresAt: number | null;
  lastMessageAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type WechatNotificationRecord = {
  id: number;
  customerId: number | null;
  openid: string | null;
  orderId: number | null;
  type: string;
  content: string;
  sendStatus: string;
  errorMessage: string | null;
  sentAt: string | null;
  platformMessageId: string | null;
  errorCode: string | null;
  retryCount: number;
  idempotencyKey: string | null;
  createdAt: string;
};

export const CUSTOMER_SERVICE_REQUEST_STATUSES = [
  "pending",
  "processing",
  "waiting_customer",
  "resolved",
  "closed",
] as const;

export type CustomerServiceRequestStatus =
  (typeof CUSTOMER_SERVICE_REQUEST_STATUSES)[number];

export type CustomerServiceRequestInput = {
  customerId?: number | null;
  openid?: string | null;
  phone?: string | null;
  orderId?: number | null;
  message: string;
  source?: string | null;
  category?: string | null;
};

export type CustomerServiceRequestRecord = {
  id: number;
  customerId: number | null;
  customerName: string | null;
  openid: string | null;
  phone: string | null;
  orderId: number | null;
  orderNo: string | null;
  message: string;
  status: CustomerServiceRequestStatus;
  source: string | null;
  category: string | null;
  adminNote: string | null;
  customerVisibleReply: string | null;
  handledBy: string | null;
  handledAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const SERVICE_REQUEST_TYPES = ["design", "development"] as const;

export type ServiceRequestType = (typeof SERVICE_REQUEST_TYPES)[number];

export const SERVICE_REQUEST_STATUSES = [
  "待评估",
  "已联系",
  "已报价",
  "已接受",
  "已拒绝",
  "已完成",
] as const;

export type ServiceRequestStatus = (typeof SERVICE_REQUEST_STATUSES)[number];

export type ServiceRequestFileInput = {
  filename: string;
  filepath: string;
  filesize: number;
};

export type ServiceRequestInput = {
  requestType: ServiceRequestType;
  customerId: number;
  projectName: string;
  customerName: string;
  phone: string;
  wechat?: string | null;
  email?: string | null;
  budgetRange: string;
  expectedDeliveryTime?: string | null;
  modificationNotes?: string | null;
  keyDimensions?: string | null;
  needsPrinting?: string | null;
  projectType?: string | null;
  functionDescription?: string | null;
  hasDrawingsOrSample?: string | null;
  needsOnsiteMeasurement?: string | null;
  acceptsEveningOrWeekendContact?: string | null;
  remarks?: string | null;
  files?: ServiceRequestFileInput[];
};

export type ServiceRequestFileRecord = {
  id: number;
  requestId: number;
  filename: string;
  filepath: string;
  filesize: number;
  createdAt: string;
};

export type ServiceRequestRecord = {
  id: number;
  requestType: ServiceRequestType;
  customerId: number | null;
  projectName: string;
  customerName: string;
  phone: string;
  wechat: string | null;
  email: string | null;
  budgetRange: string;
  expectedDeliveryTime: string | null;
  modificationNotes: string | null;
  keyDimensions: string | null;
  needsPrinting: string | null;
  projectType: string | null;
  functionDescription: string | null;
  hasDrawingsOrSample: string | null;
  needsOnsiteMeasurement: string | null;
  acceptsEveningOrWeekendContact: string | null;
  remarks: string | null;
  adminNote: string | null;
  status: ServiceRequestStatus;
  fileCount: number;
  createdAt: string;
  updatedAt: string;
};

export type ServiceRequestDetail = ServiceRequestRecord & {
  files: ServiceRequestFileRecord[];
};

export type ServiceRequestLogRecord = {
  id: number;
  requestId: number;
  fromStatus: string | null;
  toStatus: string;
  operator: string;
  note: string | null;
  createdAt: string;
};

export const ORDER_STATUSES = [
  "待确认",
  "待付款",
  "已付款",
  "排产中",
  "生产中",
  "后处理",
  "已发货",
  "已完成",
  "已取消",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderFileRecord = {
  id: number;
  orderId: number;
  filename: string;
  filepath: string;
  filesize: number;
  material: string | null;
  color: string | null;
  boundingBoxX: number | null;
  boundingBoxY: number | null;
  boundingBoxZ: number | null;
  volume: number | null;
  surfaceArea: number | null;
  processType: string | null;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  estimatedLeadTimeMinHours: number | null;
  estimatedLeadTimeMaxHours: number | null;
  riskNotice: string | null;
  riskLevel: string | null;
  requiresManualConfirmation: boolean;
  materialSalesRate: number | null;
  materialCostRate: number | null;
  quantity: number;
  unitPrice: number | null;
  subtotalPrice: number | null;
  createdAt: string;
};

export type OrderRecord = {
  id: number;
  orderNo: string;
  customerId: number | null;
  customerName: string;
  phone: string;
  wechat: string;
  email: string | null;
  company: string | null;
  material: string;
  color: string | null;
  quantity: number;
  remark: string | null;
  estimatedPrice: number;
  estimatedPriceMin: number | null;
  estimatedPriceMax: number | null;
  estimatedLeadTimeMinHours: number | null;
  estimatedLeadTimeMaxHours: number | null;
  packagingFee: number | null;
  shippingFee: number | null;
  shippingMethod: string | null;
  shippingFeeEstimate: string | null;
  recipientName: string | null;
  recipientPhone: string | null;
  addressRegion: string | null;
  addressDetail: string | null;
  shippingProvince: string | null;
  shippingCity: string | null;
  shippingCityCustom: string | null;
  shippingDistrict: string | null;
  shippingProvinceCode: string | null;
  shippingProvinceName: string | null;
  shippingCityCode: string | null;
  shippingCityName: string | null;
  shippingDistrictCode: string | null;
  shippingDistrictName: string | null;
  shippingDistrictCustom: string | null;
  shippingDetailAddress: string | null;
  shippingPostalCode: string | null;
  shippingLabel: string | null;
  shippingAddressSnapshot: string | null;
  shippingRemark: string | null;
  printFeeTotal: number | null;
  payablePrice: number | null;
  estimatedLeadTimeHours: number | null;
  finalPrice: number | null;
  finalLeadTimeHours: number | null;
  priceAdjustmentReason: string | null;
  finalPriceUpdatedAt: string | null;
  productionNote: string | null;
  assignedPrinter: string | null;
  estimatedStartAt: string | null;
  estimatedFinishAt: string | null;
  actualStartAt: string | null;
  actualFinishAt: string | null;
  internalNote: string | null;
  paymentMethod: string | null;
  paymentStatus: string | null;
  paidAt: string | null;
  paymentConfirmedAt: string | null;
  paymentConfirmedBy: string | null;
  paymentNote: string | null;
  shippingCompany: string | null;
  trackingNumber: string | null;
  shippedAt: string | null;
  shippingNote: string | null;
  adminRemark: string | null;
  fileCount: number;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string | null;
};

export type OrderDetail = OrderRecord & {
  files: OrderFileRecord[];
  customerOrderCount: number;
};

export type SliceJobStatus = "queued" | "processing" | "success" | "failed";

export type OrderStatusLogRecord = {
  id: number;
  orderId: number;
  fromStatus: string | null;
  toStatus: string;
  operator: string;
  note: string | null;
  createdAt: string;
};

export type PaymentSettings = {
  wechatQrPath: string | null;
  alipayQrPath: string | null;
  wechatEnabled: boolean;
  wechatDisplayName: string | null;
  wechatQrImagePath: string | null;
  wechatPaymentInstruction: string | null;
  alipayEnabled: boolean;
  alipayDisplayName: string | null;
  alipayQrImagePath: string | null;
  alipayPaymentInstruction: string | null;
  bankEnabled: boolean;
  bankAccountName: string | null;
  bankName: string | null;
  bankBranch: string | null;
  bankAccount: string | null;
  bankPaymentInstruction: string | null;
  paymentNotice: string | null;
  customerServiceHours: string | null;
  serviceAccountQrPath: string | null;
  publicSecurityRecordNumber: string | null;
  publicSecurityRecordUrl: string | null;
  publicSecurityRecordEnabled: boolean;
};

export type OrderPaymentInput = {
  orderId: number;
  paymentMethod: string;
  expectedAmountCents: number;
  paidAmountCents: number;
  paidAt?: string | null;
  payerName?: string | null;
  payerReference?: string | null;
  platformTradeNo?: string | null;
  paymentNote?: string | null;
  paymentDifferenceReason?: string | null;
  confirmedBy?: string | null;
};

export type OrderPaymentRecord = {
  id: number;
  orderId: number;
  paymentMethod: string;
  expectedAmountCents: number;
  paidAmountCents: number;
  paidAt: string;
  payerName: string | null;
  payerReference: string | null;
  platformTradeNo: string | null;
  paymentNote: string | null;
  paymentDifferenceReason: string | null;
  refundStatus: string;
  refundAmountCents: number | null;
  refundNote: string | null;
  confirmedBy: string | null;
  createdAt: string;
};

export type SliceJobInput = {
  orderId: number;
  fileId: number;
  inputFilePath: string;
  gcodeFilePath: string;
  material: string;
  layerHeight: number;
  infillDensity: number;
  needSupport: boolean;
};

export type SliceJobSuccessInput = {
  filamentWeightG: number;
  printTimeSeconds: number;
  rawFilamentUsedMm?: number | null;
  rawFilamentUsedCm3?: number | null;
  rawFilamentUsedG?: number | null;
  filamentWeightSource?: string | null;
  materialDensity?: number | null;
  materialFee: number;
  timeFee: number;
  estimatedPrice: number;
};

export type SliceJobRecord = {
  id: number;
  orderId: number;
  fileId: number;
  status: SliceJobStatus;
  inputFilePath: string;
  gcodeFilePath: string | null;
  material: string | null;
  layerHeight: number | null;
  infillDensity: number | null;
  needSupport: boolean;
  filamentWeightG: number | null;
  printTimeSeconds: number | null;
  rawFilamentUsedMm: number | null;
  rawFilamentUsedCm3: number | null;
  rawFilamentUsedG: number | null;
  filamentWeightSource: string | null;
  materialDensity: number | null;
  materialFee: number | null;
  timeFee: number | null;
  estimatedPrice: number | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export function getDatabasePath() {
  return process.env.DATABASE_URL?.replace(/^file:/, "") || join(process.cwd(), "data", "make3d.db");
}

export function initDatabase(dbPath = getDatabasePath()) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_no TEXT NOT NULL UNIQUE,
      customer_id INTEGER,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      wechat TEXT NOT NULL,
      email TEXT,
      company TEXT,
      material TEXT NOT NULL,
      color TEXT,
      quantity INTEGER NOT NULL,
      remark TEXT,
      estimated_price REAL NOT NULL DEFAULT 0,
      estimated_price_min REAL,
      estimated_price_max REAL,
      estimated_lead_time_min_hours INTEGER,
      estimated_lead_time_max_hours INTEGER,
      packaging_fee REAL,
      shipping_fee REAL,
      shipping_method TEXT,
      shipping_fee_estimate TEXT,
      recipient_name TEXT,
      recipient_phone TEXT,
      address_region TEXT,
      address_detail TEXT,
      shipping_province TEXT,
      shipping_city TEXT,
      shipping_city_custom TEXT,
      shipping_district TEXT,
      shipping_province_code TEXT,
      shipping_province_name TEXT,
      shipping_city_code TEXT,
      shipping_city_name TEXT,
      shipping_district_code TEXT,
      shipping_district_name TEXT,
      shipping_district_custom TEXT,
      shipping_detail_address TEXT,
      shipping_postal_code TEXT,
      shipping_label TEXT,
      shipping_address_snapshot TEXT,
      shipping_remark TEXT,
      print_fee_total REAL,
      payable_price REAL,
      estimated_lead_time_hours INTEGER,
      final_price REAL,
      final_lead_time_hours INTEGER,
      price_adjustment_reason TEXT,
      final_price_updated_at DATETIME,
      production_note TEXT,
      assigned_printer TEXT,
      estimated_start_at DATETIME,
      estimated_finish_at DATETIME,
      actual_start_at DATETIME,
      actual_finish_at DATETIME,
      internal_note TEXT,
      payment_method TEXT,
      payment_status TEXT NOT NULL DEFAULT 'unpaid',
      paid_at DATETIME,
      payment_confirmed_at DATETIME,
      payment_confirmed_by TEXT,
      payment_note TEXT,
      shipping_company TEXT,
      tracking_number TEXT,
      shipped_at DATETIME,
      shipping_note TEXT,
      admin_remark TEXT,
      status TEXT NOT NULL DEFAULT '待确认',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      name TEXT NOT NULL,
      wechat TEXT NOT NULL,
      email TEXT,
      default_address TEXT,
      is_test_account INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      recipient_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      province TEXT NOT NULL,
      city TEXT NOT NULL,
      district TEXT NOT NULL,
      province_code TEXT,
      province_name TEXT,
      city_code TEXT,
      city_name TEXT,
      city_custom TEXT,
      district_code TEXT,
      district_name TEXT,
      district_custom TEXT,
      detail_address TEXT NOT NULL,
      postal_code TEXT,
      label TEXT,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      token_hash TEXT NOT NULL UNIQUE,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS auth_blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      identifier_type TEXT NOT NULL,
      identifier TEXT NOT NULL,
      failed_count INTEGER NOT NULL DEFAULT 0,
      block_stage INTEGER NOT NULL DEFAULT 0,
      blocked_until INTEGER,
      permanently_blocked INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(identifier_type, identifier),
      CHECK (identifier_type IN ('phone', 'ip'))
    );

    CREATE TABLE IF NOT EXISTS payment_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      wechat_qr_path TEXT,
      alipay_qr_path TEXT,
      xianyu_url TEXT,
      taobao_url TEXT,
      other_note TEXT,
      wechat_enabled INTEGER NOT NULL DEFAULT 0,
      wechat_display_name TEXT,
      wechat_qr_image_path TEXT,
      wechat_payment_instruction TEXT,
      alipay_enabled INTEGER NOT NULL DEFAULT 0,
      alipay_display_name TEXT,
      alipay_qr_image_path TEXT,
      alipay_payment_instruction TEXT,
      bank_enabled INTEGER NOT NULL DEFAULT 0,
      bank_account_name TEXT,
      bank_name TEXT,
      bank_branch TEXT,
      bank_account TEXT,
      bank_payment_instruction TEXT,
      payment_notice TEXT,
      customer_service_hours TEXT,
      service_account_qr_path TEXT,
      public_security_record_number TEXT,
      public_security_record_url TEXT,
      public_security_record_enabled INTEGER NOT NULL DEFAULT 0,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS order_payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      payment_method TEXT NOT NULL,
      expected_amount_cents INTEGER NOT NULL,
      paid_amount_cents INTEGER NOT NULL,
      paid_at DATETIME NOT NULL,
      payer_name TEXT,
      payer_reference TEXT,
      platform_trade_no TEXT,
      payment_note TEXT,
      payment_difference_reason TEXT,
      refund_status TEXT NOT NULL DEFAULT 'none',
      refund_amount_cents INTEGER,
      refund_note TEXT,
      confirmed_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS order_status_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      operator TEXT NOT NULL,
      note TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_type TEXT NOT NULL,
      customer_id INTEGER,
      project_name TEXT NOT NULL,
      customer_name TEXT NOT NULL,
      phone TEXT NOT NULL,
      wechat TEXT,
      email TEXT,
      budget_range TEXT NOT NULL,
      expected_delivery_time TEXT,
      modification_notes TEXT,
      key_dimensions TEXT,
      needs_printing TEXT,
      project_type TEXT,
      function_description TEXT,
      has_drawings_or_sample TEXT,
      needs_onsite_measurement TEXT,
      accepts_evening_or_weekend_contact TEXT,
      remarks TEXT,
      admin_note TEXT,
      status TEXT NOT NULL DEFAULT '待评估',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      CHECK (request_type IN ('design', 'development'))
    );

    CREATE TABLE IF NOT EXISTS service_request_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS service_request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_id INTEGER NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      operator TEXT NOT NULL,
      note TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (request_id) REFERENCES service_requests(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wechat_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER UNIQUE,
      openid TEXT UNIQUE,
      unionid TEXT,
      subscribed INTEGER NOT NULL DEFAULT 0,
      bind_code TEXT UNIQUE,
      bind_code_expires_at INTEGER,
      last_message_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wechat_notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      openid TEXT,
      order_id INTEGER,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      send_status TEXT NOT NULL,
      error_message TEXT,
      sent_at DATETIME,
      platform_message_id TEXT,
      error_code TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      idempotency_key TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS customer_service_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER,
      openid TEXT,
      phone TEXT,
      order_id INTEGER,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      source TEXT,
      category TEXT,
      admin_note TEXT,
      customer_visible_reply TEXT,
      handled_by TEXT,
      handled_at DATETIME,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS quote_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      expires_at INTEGER NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quote_draft_files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      draft_id INTEGER NOT NULL,
      original_filename TEXT NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      material TEXT,
      color TEXT,
      quantity INTEGER NOT NULL DEFAULT 1,
      bounding_box_x REAL,
      bounding_box_y REAL,
      bounding_box_z REAL,
      slice_status TEXT NOT NULL DEFAULT 'manual',
      error_message TEXT,
      filament_weight_g REAL,
      print_time_seconds INTEGER,
      raw_filament_used_mm REAL,
      raw_filament_used_cm3 REAL,
      raw_filament_used_g REAL,
      filament_weight_source TEXT,
      material_density REAL,
      material_fee REAL,
      time_fee REAL,
      base_print_price REAL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_id) REFERENCES quote_drafts(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS files (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      filename TEXT NOT NULL,
      filepath TEXT NOT NULL,
      filesize INTEGER NOT NULL,
      material TEXT,
      color TEXT,
      bounding_box_x REAL,
      bounding_box_y REAL,
      bounding_box_z REAL,
      volume REAL,
      surface_area REAL,
      process_type TEXT,
      estimated_price_min REAL,
      estimated_price_max REAL,
      estimated_lead_time_min_hours INTEGER,
      estimated_lead_time_max_hours INTEGER,
      risk_notice TEXT,
      risk_level TEXT,
      requires_manual_confirmation INTEGER NOT NULL DEFAULT 0,
      material_sales_rate REAL,
      material_cost_rate REAL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL,
      subtotal_price REAL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS slice_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      file_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      input_file_path TEXT NOT NULL,
      gcode_file_path TEXT,
      material TEXT,
      layer_height REAL,
      infill_density INTEGER,
      need_support INTEGER NOT NULL DEFAULT 0,
      filament_weight_g REAL,
      print_time_seconds INTEGER,
      raw_filament_used_mm REAL,
      raw_filament_used_cm3 REAL,
      raw_filament_used_g REAL,
      filament_weight_source TEXT,
      material_density REAL,
      material_fee REAL,
      time_fee REAL,
      estimated_price REAL,
      error_message TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE,
      CHECK (status IN ('queued', 'processing', 'success', 'failed'))
    );
  `);
  ensureColumns(db, "orders", [
    ["customer_id", "INTEGER"],
    ["estimated_price_min", "REAL"],
    ["estimated_price_max", "REAL"],
    ["estimated_lead_time_min_hours", "INTEGER"],
    ["estimated_lead_time_max_hours", "INTEGER"],
    ["packaging_fee", "REAL"],
    ["shipping_fee", "REAL"],
    ["shipping_method", "TEXT"],
    ["shipping_fee_estimate", "TEXT"],
    ["recipient_name", "TEXT"],
    ["recipient_phone", "TEXT"],
    ["address_region", "TEXT"],
    ["address_detail", "TEXT"],
    ["shipping_province", "TEXT"],
    ["shipping_city", "TEXT"],
    ["shipping_city_custom", "TEXT"],
    ["shipping_district", "TEXT"],
    ["shipping_province_code", "TEXT"],
    ["shipping_province_name", "TEXT"],
    ["shipping_city_code", "TEXT"],
    ["shipping_city_name", "TEXT"],
    ["shipping_district_code", "TEXT"],
    ["shipping_district_name", "TEXT"],
    ["shipping_district_custom", "TEXT"],
    ["shipping_detail_address", "TEXT"],
    ["shipping_postal_code", "TEXT"],
    ["shipping_label", "TEXT"],
    ["shipping_address_snapshot", "TEXT"],
    ["shipping_remark", "TEXT"],
    ["print_fee_total", "REAL"],
    ["payable_price", "REAL"],
    ["estimated_lead_time_hours", "INTEGER"],
    ["final_price", "REAL"],
    ["final_lead_time_hours", "INTEGER"],
    ["price_adjustment_reason", "TEXT"],
    ["final_price_updated_at", "DATETIME"],
    ["production_note", "TEXT"],
    ["assigned_printer", "TEXT"],
    ["estimated_start_at", "DATETIME"],
    ["estimated_finish_at", "DATETIME"],
    ["actual_start_at", "DATETIME"],
    ["actual_finish_at", "DATETIME"],
    ["internal_note", "TEXT"],
    ["payment_method", "TEXT"],
    ["payment_status", "TEXT NOT NULL DEFAULT 'unpaid'"],
    ["paid_at", "DATETIME"],
    ["payment_confirmed_at", "DATETIME"],
    ["payment_confirmed_by", "TEXT"],
    ["payment_note", "TEXT"],
    ["shipping_company", "TEXT"],
    ["tracking_number", "TEXT"],
    ["shipped_at", "DATETIME"],
    ["shipping_note", "TEXT"],
    ["admin_remark", "TEXT"],
    ["updated_at", "DATETIME"],
  ]);
  ensureColumns(db, "customers", [["is_test_account", "INTEGER NOT NULL DEFAULT 0"]]);
  ensureColumns(db, "customer_addresses", [
    ["customer_id", "INTEGER"],
    ["recipient_name", "TEXT"],
    ["phone", "TEXT"],
    ["province", "TEXT"],
    ["city", "TEXT"],
    ["district", "TEXT"],
    ["province_code", "TEXT"],
    ["province_name", "TEXT"],
    ["city_code", "TEXT"],
    ["city_name", "TEXT"],
    ["city_custom", "TEXT"],
    ["district_code", "TEXT"],
    ["district_name", "TEXT"],
    ["district_custom", "TEXT"],
    ["detail_address", "TEXT"],
    ["postal_code", "TEXT"],
    ["label", "TEXT"],
    ["is_default", "INTEGER NOT NULL DEFAULT 0"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customer_addresses_customer ON customer_addresses(customer_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_addresses_default ON customer_addresses(customer_id) WHERE is_default = 1;
  `);
  ensureColumns(db, "order_status_logs", [["note", "TEXT"]]);
  ensureColumns(db, "payment_settings", [
    ["wechat_qr_path", "TEXT"],
    ["alipay_qr_path", "TEXT"],
    ["xianyu_url", "TEXT"],
    ["taobao_url", "TEXT"],
    ["other_note", "TEXT"],
    ["wechat_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["wechat_display_name", "TEXT"],
    ["wechat_qr_image_path", "TEXT"],
    ["wechat_payment_instruction", "TEXT"],
    ["alipay_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["alipay_display_name", "TEXT"],
    ["alipay_qr_image_path", "TEXT"],
    ["alipay_payment_instruction", "TEXT"],
    ["bank_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["bank_account_name", "TEXT"],
    ["bank_name", "TEXT"],
    ["bank_branch", "TEXT"],
    ["bank_account", "TEXT"],
    ["bank_payment_instruction", "TEXT"],
    ["payment_notice", "TEXT"],
    ["customer_service_hours", "TEXT"],
    ["service_account_qr_path", "TEXT"],
    ["public_security_record_number", "TEXT"],
    ["public_security_record_url", "TEXT"],
    ["public_security_record_enabled", "INTEGER NOT NULL DEFAULT 0"],
    ["updated_at", "DATETIME"],
  ]);
  db.prepare("INSERT OR IGNORE INTO payment_settings (id) VALUES (1)").run();
  ensureColumns(db, "order_payments", [
    ["order_id", "INTEGER"],
    ["payment_method", "TEXT"],
    ["expected_amount_cents", "INTEGER"],
    ["paid_amount_cents", "INTEGER"],
    ["paid_at", "DATETIME"],
    ["payer_name", "TEXT"],
    ["payer_reference", "TEXT"],
    ["platform_trade_no", "TEXT"],
    ["payment_note", "TEXT"],
    ["payment_difference_reason", "TEXT"],
    ["refund_status", "TEXT NOT NULL DEFAULT 'none'"],
    ["refund_amount_cents", "INTEGER"],
    ["refund_note", "TEXT"],
    ["confirmed_by", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  db.exec("CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id, created_at DESC)");
  ensureColumns(db, "service_requests", [
    ["request_type", "TEXT"],
    ["customer_id", "INTEGER"],
    ["project_name", "TEXT"],
    ["customer_name", "TEXT"],
    ["phone", "TEXT"],
    ["wechat", "TEXT"],
    ["email", "TEXT"],
    ["budget_range", "TEXT"],
    ["expected_delivery_time", "TEXT"],
    ["modification_notes", "TEXT"],
    ["key_dimensions", "TEXT"],
    ["needs_printing", "TEXT"],
    ["project_type", "TEXT"],
    ["function_description", "TEXT"],
    ["has_drawings_or_sample", "TEXT"],
    ["needs_onsite_measurement", "TEXT"],
    ["accepts_evening_or_weekend_contact", "TEXT"],
    ["remarks", "TEXT"],
    ["admin_note", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT '待评估'"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  ensureColumns(db, "wechat_accounts", [
    ["customer_id", "INTEGER"],
    ["openid", "TEXT"],
    ["unionid", "TEXT"],
    ["subscribed", "INTEGER NOT NULL DEFAULT 0"],
    ["bind_code", "TEXT"],
    ["bind_code_expires_at", "INTEGER"],
    ["last_message_at", "DATETIME"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  ensureColumns(db, "wechat_notifications", [
    ["customer_id", "INTEGER"],
    ["openid", "TEXT"],
    ["order_id", "INTEGER"],
    ["type", "TEXT"],
    ["content", "TEXT"],
    ["send_status", "TEXT"],
    ["error_message", "TEXT"],
    ["sent_at", "DATETIME"],
    ["platform_message_id", "TEXT"],
    ["error_code", "TEXT"],
    ["retry_count", "INTEGER NOT NULL DEFAULT 0"],
    ["idempotency_key", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wechat_notifications_idempotency
      ON wechat_notifications(idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_wechat_notifications_order_created
      ON wechat_notifications(order_id, created_at DESC);
  `);
  ensureColumns(db, "customer_service_requests", [
    ["customer_id", "INTEGER"],
    ["openid", "TEXT"],
    ["phone", "TEXT"],
    ["order_id", "INTEGER"],
    ["message", "TEXT"],
    ["status", "TEXT NOT NULL DEFAULT 'pending'"],
    ["source", "TEXT"],
    ["category", "TEXT"],
    ["admin_note", "TEXT"],
    ["customer_visible_reply", "TEXT"],
    ["handled_by", "TEXT"],
    ["handled_at", "DATETIME"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  db.exec(`
    UPDATE customer_service_requests
    SET status = CASE status
      WHEN '待处理' THEN 'pending'
      WHEN '已处理' THEN 'resolved'
      ELSE status
    END
    WHERE status IN ('待处理', '已处理');
  `);
  ensureColumns(db, "quote_drafts", [
    ["customer_id", "INTEGER"],
    ["status", "TEXT NOT NULL DEFAULT 'active'"],
    ["expires_at", "INTEGER"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  ensureColumns(db, "quote_draft_files", [
    ["draft_id", "INTEGER"],
    ["original_filename", "TEXT"],
    ["filename", "TEXT"],
    ["filepath", "TEXT"],
    ["filesize", "INTEGER"],
    ["material", "TEXT"],
    ["color", "TEXT"],
    ["quantity", "INTEGER NOT NULL DEFAULT 1"],
    ["bounding_box_x", "REAL"],
    ["bounding_box_y", "REAL"],
    ["bounding_box_z", "REAL"],
    ["slice_status", "TEXT NOT NULL DEFAULT 'manual'"],
    ["error_message", "TEXT"],
    ["filament_weight_g", "REAL"],
    ["print_time_seconds", "INTEGER"],
    ["raw_filament_used_mm", "REAL"],
    ["raw_filament_used_cm3", "REAL"],
    ["raw_filament_used_g", "REAL"],
    ["filament_weight_source", "TEXT"],
    ["material_density", "REAL"],
    ["material_fee", "REAL"],
    ["time_fee", "REAL"],
    ["base_print_price", "REAL"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_quote_drafts_customer_status ON quote_drafts(customer_id, status, expires_at);
    CREATE INDEX IF NOT EXISTS idx_quote_draft_files_draft ON quote_draft_files(draft_id);
  `);
  ensureColumns(db, "files", [
    ["bounding_box_x", "REAL"],
    ["bounding_box_y", "REAL"],
    ["bounding_box_z", "REAL"],
    ["volume", "REAL"],
    ["surface_area", "REAL"],
    ["process_type", "TEXT"],
    ["material", "TEXT"],
    ["color", "TEXT"],
    ["estimated_price_min", "REAL"],
    ["estimated_price_max", "REAL"],
    ["estimated_lead_time_min_hours", "INTEGER"],
    ["estimated_lead_time_max_hours", "INTEGER"],
    ["risk_notice", "TEXT"],
    ["risk_level", "TEXT"],
    ["requires_manual_confirmation", "INTEGER NOT NULL DEFAULT 0"],
    ["material_sales_rate", "REAL"],
    ["material_cost_rate", "REAL"],
    ["quantity", "INTEGER NOT NULL DEFAULT 1"],
    ["unit_price", "REAL"],
    ["subtotal_price", "REAL"],
  ]);
  ensureColumns(db, "slice_jobs", [
    ["order_id", "INTEGER"],
    ["file_id", "INTEGER"],
    ["status", "TEXT NOT NULL DEFAULT 'queued'"],
    ["input_file_path", "TEXT"],
    ["gcode_file_path", "TEXT"],
    ["material", "TEXT"],
    ["layer_height", "REAL"],
    ["infill_density", "INTEGER"],
    ["need_support", "INTEGER NOT NULL DEFAULT 0"],
    ["filament_weight_g", "REAL"],
    ["print_time_seconds", "INTEGER"],
    ["raw_filament_used_mm", "REAL"],
    ["raw_filament_used_cm3", "REAL"],
    ["raw_filament_used_g", "REAL"],
    ["filament_weight_source", "TEXT"],
    ["material_density", "REAL"],
    ["material_fee", "REAL"],
    ["time_fee", "REAL"],
    ["estimated_price", "REAL"],
    ["error_message", "TEXT"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  migrateLegacyOrderStatuses(db);
  migrateOrderPaymentMetadata(db);

  return db;
}

export function openDatabase() {
  return initDatabase();
}

export function getActiveQuoteDraft(
  db: DatabaseSync,
  customerId: number,
  now = Date.now(),
): QuoteDraftDetail | null {
  expireQuoteDrafts(db, customerId, now);
  const draft = getActiveQuoteDraftRecord(db, customerId, now);

  return draft ? loadQuoteDraftDetail(db, draft) : null;
}

export function addQuoteDraftFile(
  db: DatabaseSync,
  input: QuoteDraftFileInput,
  now = Date.now(),
): QuoteDraftFileRecord {
  const draft = getOrCreateActiveQuoteDraft(db, input.customerId, now);
  const timestamp = getBeijingTimestamp();

  const result = db
    .prepare(
      `INSERT INTO quote_draft_files (
        draft_id,
        original_filename,
        filename,
        filepath,
        filesize,
        material,
        color,
        quantity,
        bounding_box_x,
        bounding_box_y,
        bounding_box_z,
        slice_status,
        error_message,
        filament_weight_g,
        print_time_seconds,
        raw_filament_used_mm,
        raw_filament_used_cm3,
        raw_filament_used_g,
        filament_weight_source,
        material_density,
        material_fee,
        time_fee,
        base_print_price,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      draft.id,
      input.originalFilename,
      input.filename,
      input.filepath,
      input.filesize,
      input.material,
      input.color,
      input.quantity,
      input.boundingBoxX ?? null,
      input.boundingBoxY ?? null,
      input.boundingBoxZ ?? null,
      input.sliceStatus,
      input.errorMessage ?? null,
      input.filamentWeightG ?? null,
      input.printTimeSeconds ?? null,
      input.rawFilamentUsedMm ?? null,
      input.rawFilamentUsedCm3 ?? null,
      input.rawFilamentUsedG ?? null,
      input.filamentWeightSource ?? null,
      input.materialDensity ?? null,
      input.materialFee ?? null,
      input.timeFee ?? null,
      input.basePrintPrice ?? null,
      timestamp,
      timestamp,
    );

  touchQuoteDraft(db, draft.id, now);
  return getQuoteDraftFileById(db, Number(result.lastInsertRowid));
}

export function updateQuoteDraftFile(
  db: DatabaseSync,
  customerId: number,
  fileId: number,
  input: QuoteDraftFileUpdateInput,
  now = Date.now(),
) {
  const file = getQuoteDraftFileForCustomer(db, customerId, fileId, now);
  const timestamp = getBeijingTimestamp();
  const result = db
    .prepare(
      `UPDATE quote_draft_files
       SET material = COALESCE(?, material),
           color = COALESCE(?, color),
           quantity = COALESCE(?, quantity),
           bounding_box_x = COALESCE(?, bounding_box_x),
           bounding_box_y = COALESCE(?, bounding_box_y),
           bounding_box_z = COALESCE(?, bounding_box_z),
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      normalizeOptionalText(input.material ?? undefined),
      normalizeOptionalText(input.color ?? undefined),
      input.quantity ?? null,
      input.boundingBoxX ?? null,
      input.boundingBoxY ?? null,
      input.boundingBoxZ ?? null,
      timestamp,
      file.id,
    );

  touchQuoteDraft(db, file.draftId, now);
  return result.changes > 0;
}

export function deleteQuoteDraftFile(
  db: DatabaseSync,
  customerId: number,
  fileId: number,
  now = Date.now(),
) {
  const file = getQuoteDraftFileForCustomer(db, customerId, fileId, now);
  const result = db.prepare("DELETE FROM quote_draft_files WHERE id = ?").run(file.id);
  touchQuoteDraft(db, file.draftId, now);

  return result.changes > 0;
}

export function getQuoteDraftFileForCustomer(
  db: DatabaseSync,
  customerId: number,
  fileId: number,
  now = Date.now(),
) {
  expireQuoteDrafts(db, customerId, now);
  const file = db
    .prepare(
      quoteDraftFileSelectSql(
        `JOIN quote_drafts ON quote_drafts.id = quote_draft_files.draft_id
         WHERE quote_draft_files.id = ?
           AND quote_drafts.customer_id = ?
           AND quote_drafts.status = 'active'
           AND quote_drafts.expires_at > ?`,
      ),
    )
    .get(fileId, customerId, now);

  if (!file) {
    throw new Error("草稿文件不存在或已过期");
  }

  return normalizeQuoteDraftFileRecord(file) as QuoteDraftFileRecord;
}

export function markActiveQuoteDraftSubmitted(
  db: DatabaseSync,
  customerId: number,
  now = Date.now(),
) {
  expireQuoteDrafts(db, customerId, now);
  db.prepare(
    `UPDATE quote_drafts
     SET status = 'submitted',
         updated_at = ?
     WHERE customer_id = ?
       AND status = 'active'
       AND expires_at > ?`,
  ).run(getBeijingTimestamp(), customerId, now);
}

function getOrCreateActiveQuoteDraft(db: DatabaseSync, customerId: number, now: number) {
  expireQuoteDrafts(db, customerId, now);
  const active = getActiveQuoteDraftRecord(db, customerId, now);

  if (active) {
    return active;
  }

  const timestamp = getBeijingTimestamp();
  const result = db
    .prepare(
      `INSERT INTO quote_drafts (
        customer_id,
        status,
        expires_at,
        created_at,
        updated_at
      ) VALUES (?, 'active', ?, ?, ?)`,
    )
    .run(customerId, now + QUOTE_DRAFT_TTL_MS, timestamp, timestamp);

  return {
    id: Number(result.lastInsertRowid),
    customerId,
    status: "active",
    expiresAt: now + QUOTE_DRAFT_TTL_MS,
    createdAt: timestamp,
    updatedAt: timestamp,
  } satisfies QuoteDraftRecord;
}

function getActiveQuoteDraftRecord(db: DatabaseSync, customerId: number, now: number) {
  const draft = db
    .prepare(
      `SELECT
        id,
        customer_id AS customerId,
        status,
        expires_at AS expiresAt,
        created_at AS createdAt,
        updated_at AS updatedAt
      FROM quote_drafts
      WHERE customer_id = ?
        AND status = 'active'
        AND expires_at > ?
      ORDER BY updated_at DESC, id DESC
      LIMIT 1`,
    )
    .get(customerId, now);

  return draft ? normalizeQuoteDraftRecord(draft) : null;
}

function loadQuoteDraftDetail(db: DatabaseSync, draft: QuoteDraftRecord): QuoteDraftDetail {
  const files = db
    .prepare(quoteDraftFileSelectSql("WHERE draft_id = ? ORDER BY created_at ASC, id ASC"))
    .all(draft.id)
    .map(normalizeQuoteDraftFileRecord) as QuoteDraftFileRecord[];

  return {
    ...draft,
    files,
  };
}

function getQuoteDraftFileById(db: DatabaseSync, id: number) {
  const file = db
    .prepare(quoteDraftFileSelectSql("WHERE id = ?"))
    .get(id);

  if (!file) {
    throw new Error("草稿文件不存在");
  }

  return normalizeQuoteDraftFileRecord(file) as QuoteDraftFileRecord;
}

function expireQuoteDrafts(db: DatabaseSync, customerId: number, now: number) {
  db.prepare(
    `UPDATE quote_drafts
     SET status = 'expired',
         updated_at = ?
     WHERE customer_id = ?
       AND status = 'active'
       AND expires_at <= ?`,
  ).run(getBeijingTimestamp(), customerId, now);
}

function touchQuoteDraft(db: DatabaseSync, draftId: number, now: number) {
  db.prepare(
    `UPDATE quote_drafts
     SET expires_at = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(now + QUOTE_DRAFT_TTL_MS, getBeijingTimestamp(), draftId);
}

export function listCustomerAddresses(db: DatabaseSync, customerId: number): CustomerAddressRecord[] {
  return db
    .prepare(
      customerAddressSelectSql(
        "WHERE customer_id = ? ORDER BY is_default DESC, updated_at DESC, id DESC",
      ),
    )
    .all(customerId)
    .map(normalizeCustomerAddressRecord) as CustomerAddressRecord[];
}

export function getCustomerAddressByIdForCustomer(
  db: DatabaseSync,
  customerId: number,
  addressId: number,
): CustomerAddressRecord {
  const address = db
    .prepare(customerAddressSelectSql("WHERE id = ? AND customer_id = ?"))
    .get(addressId, customerId);

  if (!address) {
    throw new Error("收货地址不存在");
  }

  return normalizeCustomerAddressRecord(address) as CustomerAddressRecord;
}

export function createCustomerAddress(
  db: DatabaseSync,
  customerId: number,
  input: CustomerAddressInput,
): CustomerAddressRecord {
  const count = getCustomerAddressCount(db, customerId);

  if (count >= CUSTOMER_ADDRESS_LIMIT) {
    throw new Error("最多可保存 5 个常用地址，如需新增请先删除旧地址。");
  }

  const normalized = normalizeCustomerAddressInput(input);
  const shouldDefault = count === 0 || Boolean(input.isDefault);
  const now = getBeijingTimestamp();

  try {
    db.exec("BEGIN");
    if (shouldDefault) {
      clearCustomerDefaultAddress(db, customerId);
    }

    const result = db
      .prepare(
        `INSERT INTO customer_addresses (
          customer_id,
          recipient_name,
          phone,
          province,
          city,
          district,
          province_code,
          province_name,
          city_code,
          city_name,
          city_custom,
          district_code,
          district_name,
          district_custom,
          detail_address,
          postal_code,
          label,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customerId,
        normalized.recipientName,
        normalized.phone,
        normalized.province || "",
        normalized.city || "",
        normalized.district || "",
        normalized.provinceCode ?? null,
        normalized.provinceName ?? normalized.province ?? "",
        normalized.cityCode ?? null,
        normalized.cityName ?? normalized.city ?? "",
        normalized.cityCustom ?? null,
        normalized.districtCode ?? null,
        normalized.districtName ?? normalized.district ?? "",
        normalized.districtCustom ?? null,
        normalized.detailAddress,
        normalized.postalCode ?? null,
        normalized.label ?? null,
        shouldDefault ? 1 : 0,
        now,
        now,
      );

    db.exec("COMMIT");
    return getCustomerAddressByIdForCustomer(db, customerId, Number(result.lastInsertRowid));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateCustomerAddress(
  db: DatabaseSync,
  customerId: number,
  addressId: number,
  input: CustomerAddressInput,
): CustomerAddressRecord {
  getCustomerAddressByIdForCustomer(db, customerId, addressId);
  const normalized = normalizeCustomerAddressInput(input);
  const now = getBeijingTimestamp();

  try {
    db.exec("BEGIN");
    if (input.isDefault) {
      clearCustomerDefaultAddress(db, customerId);
    }

    db
      .prepare(
        `UPDATE customer_addresses
         SET recipient_name = ?,
             phone = ?,
             province = ?,
             city = ?,
             district = ?,
             province_code = ?,
             province_name = ?,
             city_code = ?,
             city_name = ?,
             city_custom = ?,
             district_code = ?,
             district_name = ?,
             district_custom = ?,
             detail_address = ?,
             postal_code = ?,
             label = ?,
             is_default = CASE WHEN ? THEN 1 ELSE is_default END,
             updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
      .run(
        normalized.recipientName,
        normalized.phone,
        normalized.province || "",
        normalized.city || "",
        normalized.district || "",
        normalized.provinceCode ?? null,
        normalized.provinceName ?? normalized.province ?? "",
        normalized.cityCode ?? null,
        normalized.cityName ?? normalized.city ?? "",
        normalized.cityCustom ?? null,
        normalized.districtCode ?? null,
        normalized.districtName ?? normalized.district ?? "",
        normalized.districtCustom ?? null,
        normalized.detailAddress,
        normalized.postalCode ?? null,
        normalized.label ?? null,
        input.isDefault ? 1 : 0,
        now,
        addressId,
        customerId,
      );

    ensureCustomerHasDefaultAddress(db, customerId);
    db.exec("COMMIT");
    return getCustomerAddressByIdForCustomer(db, customerId, addressId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteCustomerAddress(db: DatabaseSync, customerId: number, addressId: number) {
  const address = getCustomerAddressByIdForCustomer(db, customerId, addressId);

  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?").run(addressId, customerId);

    if (address.isDefault) {
      ensureCustomerHasDefaultAddress(db, customerId);
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setCustomerDefaultAddress(
  db: DatabaseSync,
  customerId: number,
  addressId: number,
): CustomerAddressRecord {
  getCustomerAddressByIdForCustomer(db, customerId, addressId);

  try {
    db.exec("BEGIN");
    clearCustomerDefaultAddress(db, customerId);
    db
      .prepare(
        `UPDATE customer_addresses
         SET is_default = 1,
             updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
      .run(getBeijingTimestamp(), addressId, customerId);
    db.exec("COMMIT");
    return getCustomerAddressByIdForCustomer(db, customerId, addressId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getCustomerAddressCount(db: DatabaseSync, customerId: number) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM customer_addresses WHERE customer_id = ?")
    .get(customerId) as { count?: number } | undefined;

  return row?.count || 0;
}

function clearCustomerDefaultAddress(db: DatabaseSync, customerId: number) {
  db.prepare("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?").run(customerId);
}

function ensureCustomerHasDefaultAddress(db: DatabaseSync, customerId: number) {
  const defaultAddress = db
    .prepare("SELECT id FROM customer_addresses WHERE customer_id = ? AND is_default = 1 LIMIT 1")
    .get(customerId);

  if (defaultAddress) {
    return;
  }

  const latest = db
    .prepare(
      `SELECT id
       FROM customer_addresses
       WHERE customer_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
    )
    .get(customerId) as { id?: number } | undefined;

  if (latest?.id) {
    db.prepare("UPDATE customer_addresses SET is_default = 1 WHERE id = ?").run(latest.id);
  }
}

function normalizeCustomerAddressInput(input: CustomerAddressInput): CustomerAddressInput {
  const provinceName = (input.provinceName || input.province || "").trim();
  const cityName = (input.cityName || input.city || "").trim();
  const cityCustom = input.cityCustom?.trim() || null;
  const districtName = (input.districtName || input.district || "").trim();
  const districtCustom = input.districtCustom?.trim() || null;
  const city = cityCustom || cityName;
  const district = districtCustom || districtName;

  return {
    recipientName: input.recipientName.trim(),
    phone: input.phone.trim(),
    province: provinceName,
    city,
    district,
    provinceCode: input.provinceCode?.trim() || null,
    provinceName,
    cityCode: input.cityCode?.trim() || null,
    cityName,
    cityCustom,
    districtCode: input.districtCode?.trim() || null,
    districtName,
    districtCustom,
    detailAddress: input.detailAddress.trim(),
    postalCode: input.postalCode?.trim() || null,
    label: input.label?.trim() || null,
    isDefault: Boolean(input.isDefault),
  };
}

export function createOrderWithFiles(db: DatabaseSync, input: OrderInput): CreatedOrder {
  if (input.files.length === 0) {
    throw new Error("请上传模型文件");
  }

  const firstFile = input.files[0];
  const orderNo = createOrderNo();
  const now = getBeijingTimestamp();

  try {
    db.exec("BEGIN");
    const order = db
      .prepare(
        `INSERT INTO orders (
          order_no,
          customer_id,
          customer_name,
          phone,
          wechat,
          email,
          company,
          material,
          color,
          quantity,
          remark,
          estimated_price,
          estimated_price_min,
          estimated_price_max,
          estimated_lead_time_min_hours,
          estimated_lead_time_max_hours,
          packaging_fee,
          shipping_fee,
          shipping_method,
          shipping_fee_estimate,
          recipient_name,
          recipient_phone,
          address_region,
          address_detail,
          shipping_province,
          shipping_city,
          shipping_city_custom,
          shipping_district,
          shipping_province_code,
          shipping_province_name,
          shipping_city_code,
          shipping_city_name,
          shipping_district_code,
          shipping_district_name,
          shipping_district_custom,
          shipping_detail_address,
          shipping_postal_code,
          shipping_label,
          shipping_address_snapshot,
          shipping_remark,
          print_fee_total,
          payable_price,
          estimated_lead_time_hours,
          final_price,
          final_lead_time_hours,
          price_adjustment_reason,
          final_price_updated_at,
          production_note,
          payment_method,
          payment_confirmed_at,
          payment_confirmed_by,
          payment_note,
          shipping_company,
          tracking_number,
          admin_remark,
          status,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        orderNo,
        input.customerId ?? null,
        input.customerName,
        input.phone,
        input.wechat,
        input.email || null,
        input.company || null,
        input.material || firstFile.material,
        input.color || firstFile.color || null,
        input.quantity,
        input.remark || null,
        input.estimatedPrice,
        input.estimatedPriceMin ?? null,
        input.estimatedPriceMax ?? null,
        input.estimatedLeadTimeMinHours ?? null,
        input.estimatedLeadTimeMaxHours ?? null,
        input.packagingFee ?? null,
        input.shippingFee ?? null,
        input.shippingMethod || null,
        input.shippingFeeEstimate || null,
        input.recipientName || null,
        input.recipientPhone || null,
        input.addressRegion || null,
        input.addressDetail || null,
        input.shippingProvince || null,
        input.shippingCity || null,
        input.shippingCityCustom || null,
        input.shippingDistrict || null,
        input.shippingProvinceCode || null,
        input.shippingProvinceName || input.shippingProvince || null,
        input.shippingCityCode || null,
        input.shippingCityName || input.shippingCity || null,
        input.shippingDistrictCode || null,
        input.shippingDistrictName || input.shippingDistrict || null,
        input.shippingDistrictCustom || null,
        input.shippingDetailAddress || null,
        input.shippingPostalCode || null,
        input.shippingLabel || null,
        input.shippingAddressSnapshot || null,
        input.shippingRemark || null,
        input.printFeeTotal ?? null,
        input.payablePrice ?? null,
        input.estimatedLeadTimeHours ?? null,
        input.finalPrice ?? null,
        input.finalLeadTimeHours ?? null,
        input.priceAdjustmentReason || null,
        null,
        input.productionNote || null,
        input.paymentMethod || null,
        null,
        null,
        input.paymentNote || null,
        input.shippingCompany ?? null,
        input.trackingNumber ?? null,
        input.adminRemark ?? null,
        "待确认",
        now,
        now,
      );

    const orderId = Number(order.lastInsertRowid);
    const insertFile = db.prepare(
      `INSERT INTO files (
        order_id,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x,
        bounding_box_y,
        bounding_box_z,
        estimated_price_min,
        estimated_price_max,
        estimated_lead_time_min_hours,
        estimated_lead_time_max_hours,
        risk_notice,
        risk_level,
        requires_manual_confirmation,
        material_sales_rate,
        material_cost_rate,
        quantity,
        unit_price,
        subtotal_price,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    for (const file of input.files) {
      insertFile.run(
        orderId,
        file.filename,
        file.filepath,
        file.filesize,
        file.material,
        file.color || null,
        file.boundingBoxX ?? null,
        file.boundingBoxY ?? null,
        file.boundingBoxZ ?? null,
        file.estimatedPriceMin ?? null,
        file.estimatedPriceMax ?? null,
        file.estimatedLeadTimeMinHours ?? null,
        file.estimatedLeadTimeMaxHours ?? null,
        file.riskNotice || null,
        file.riskLevel || null,
        file.requiresManualConfirmation ? 1 : 0,
        file.materialSalesRate ?? null,
        file.materialCostRate ?? null,
        file.quantity ?? 1,
        file.unitPrice ?? null,
        file.subtotalPrice ?? null,
        now,
      );
    }

    db.exec("COMMIT");
    return { id: orderId, orderNo };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function createOrderWithFile(db: DatabaseSync, input: SingleFileOrderInput): CreatedOrder {
  return createOrderWithFiles(db, {
    ...input,
    estimatedPriceMin: input.estimatedPriceMin ?? input.estimatedPrice,
    estimatedPriceMax: input.estimatedPriceMax ?? input.estimatedPrice,
    files: [
      {
        ...input.file,
        material: input.material,
        color: input.color || "",
        quantity: input.quantity,
        unitPrice: input.estimatedPrice,
        subtotalPrice: input.estimatedPrice,
      },
    ],
  });
}

export function listOrders(db: DatabaseSync): OrderRecord[] {
  return db.prepare(orderSelectSql("ORDER BY created_at DESC")).all() as OrderRecord[];
}

export type OrderListFilters = {
  query?: string;
  status?: string;
};

export function searchOrders(db: DatabaseSync, filters: OrderListFilters): OrderRecord[] {
  const where: string[] = [];
  const values: string[] = [];
  const query = filters.query?.trim();
  const status = filters.status?.trim();

  if (query) {
    where.push(
      `(order_no LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR wechat LIKE ? OR email LIKE ?)`,
    );
    const like = `%${query}%`;
    values.push(like, like, like, like, like);
  }

  if (status && isOrderStatus(status)) {
    where.push("status = ?");
    values.push(status);
  }

  const suffix = `${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC`;
  return db.prepare(orderSelectSql(suffix)).all(...values) as OrderRecord[];
}

export function listOrdersByCustomerId(db: DatabaseSync, customerId: number): OrderRecord[] {
  return db
    .prepare(orderSelectSql("WHERE customer_id = ? ORDER BY created_at DESC"))
    .all(customerId) as OrderRecord[];
}

export function getOrderById(db: DatabaseSync, id: number): OrderDetail {
  const order = db.prepare(orderSelectSql("WHERE id = ?")).get(id) as OrderRecord | undefined;

  if (!order) {
    throw new Error("订单不存在");
  }

  return loadOrderDetail(db, order);
}

export function getOrderByIdForCustomer(db: DatabaseSync, id: number, customerId: number): OrderDetail {
  const order = db
    .prepare(orderSelectSql("WHERE id = ? AND customer_id = ?"))
    .get(id, customerId) as OrderRecord | undefined;

  if (!order) {
    throw new Error("订单不存在");
  }

  return loadOrderDetail(db, order);
}

function loadOrderDetail(db: DatabaseSync, order: OrderRecord): OrderDetail {
  const files = db
    .prepare(
      `SELECT
        id,
        order_id AS orderId,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x AS boundingBoxX,
        bounding_box_y AS boundingBoxY,
        bounding_box_z AS boundingBoxZ,
        volume,
        surface_area AS surfaceArea,
        process_type AS processType,
        estimated_price_min AS estimatedPriceMin,
        estimated_price_max AS estimatedPriceMax,
        estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
        estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
        risk_notice AS riskNotice,
        risk_level AS riskLevel,
        requires_manual_confirmation AS requiresManualConfirmation,
        material_sales_rate AS materialSalesRate,
        material_cost_rate AS materialCostRate,
        quantity,
        unit_price AS unitPrice,
        subtotal_price AS subtotalPrice,
        created_at AS createdAt
      FROM files
      WHERE order_id = ?
      ORDER BY created_at ASC`,
    )
    .all(order.id)
    .map(normalizeFileRecord) as OrderFileRecord[];
  const customerOrderCount = order.customerId
    ? Number(
        (db
          .prepare("SELECT COUNT(*) AS count FROM orders WHERE customer_id = ?")
          .get(order.customerId) as { count: number }).count,
      )
    : 0;

  return { ...order, files, customerOrderCount };
}

export function getFileById(db: DatabaseSync, id: number): OrderFileRecord {
  const file = db
    .prepare(
      `SELECT
        id,
        order_id AS orderId,
        filename,
        filepath,
        filesize,
        material,
        color,
        bounding_box_x AS boundingBoxX,
        bounding_box_y AS boundingBoxY,
        bounding_box_z AS boundingBoxZ,
        volume,
        surface_area AS surfaceArea,
        process_type AS processType,
        estimated_price_min AS estimatedPriceMin,
        estimated_price_max AS estimatedPriceMax,
        estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
        estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
        risk_notice AS riskNotice,
        risk_level AS riskLevel,
        requires_manual_confirmation AS requiresManualConfirmation,
        material_sales_rate AS materialSalesRate,
        material_cost_rate AS materialCostRate,
        quantity,
        unit_price AS unitPrice,
        subtotal_price AS subtotalPrice,
        created_at AS createdAt
      FROM files
      WHERE id = ?`,
    )
    .get(id);

  if (!file) {
    throw new Error("文件不存在");
  }

  return normalizeFileRecord(file) as OrderFileRecord;
}

export function createServiceRequest(
  db: DatabaseSync,
  input: ServiceRequestInput,
): { id: number } {
  if (!isServiceRequestType(input.requestType)) {
    throw new Error("无效需求类型");
  }

  const projectName = normalizeRequiredText(input.projectName, "请填写项目名称");
  const customerName = normalizeRequiredText(input.customerName, "请填写联系人");
  const phone = normalizeRequiredText(input.phone, "请填写联系方式");
  const budgetRange = normalizeRequiredText(input.budgetRange, "请选择预算范围");
  const files = input.files || [];

  try {
    db.exec("BEGIN");
    const result = db
      .prepare(
        `INSERT INTO service_requests (
          request_type,
          customer_id,
          project_name,
          customer_name,
          phone,
          wechat,
          email,
          budget_range,
          expected_delivery_time,
          modification_notes,
          key_dimensions,
          needs_printing,
          project_type,
          function_description,
          has_drawings_or_sample,
          needs_onsite_measurement,
          accepts_evening_or_weekend_contact,
          remarks,
          status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '待评估')`,
      )
      .run(
        input.requestType,
        input.customerId,
        projectName,
        customerName,
        phone,
        normalizeOptionalText(input.wechat),
        normalizeOptionalText(input.email),
        budgetRange,
        normalizeOptionalText(input.expectedDeliveryTime),
        normalizeOptionalText(input.modificationNotes),
        normalizeOptionalText(input.keyDimensions),
        normalizeOptionalText(input.needsPrinting),
        normalizeOptionalText(input.projectType),
        normalizeOptionalText(input.functionDescription),
        normalizeOptionalText(input.hasDrawingsOrSample),
        normalizeOptionalText(input.needsOnsiteMeasurement),
        normalizeOptionalText(input.acceptsEveningOrWeekendContact),
        normalizeOptionalText(input.remarks),
      );

    const requestId = Number(result.lastInsertRowid);
    const insertFile = db.prepare(
      `INSERT INTO service_request_files (
        request_id,
        filename,
        filepath,
        filesize
      ) VALUES (?, ?, ?, ?)`,
    );

    for (const file of files) {
      insertFile.run(requestId, file.filename, file.filepath, file.filesize);
    }

    insertServiceRequestLog(db, requestId, null, "待评估", "customer", "需求提交");
    db.exec("COMMIT");

    return { id: requestId };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export type ServiceRequestListFilters = {
  query?: string;
  status?: string;
  requestType?: string;
};

export function searchServiceRequests(
  db: DatabaseSync,
  filters: ServiceRequestListFilters = {},
): ServiceRequestRecord[] {
  const where: string[] = [];
  const values: string[] = [];
  const query = filters.query?.trim();
  const status = filters.status?.trim();
  const requestType = filters.requestType?.trim();

  if (query) {
    where.push(
      `(project_name LIKE ? OR customer_name LIKE ? OR phone LIKE ? OR wechat LIKE ? OR email LIKE ? OR modification_notes LIKE ? OR function_description LIKE ?)`,
    );
    const like = `%${query}%`;
    values.push(like, like, like, like, like, like, like);
  }

  if (status && isServiceRequestStatus(status)) {
    where.push("status = ?");
    values.push(status);
  }

  if (requestType && isServiceRequestType(requestType)) {
    where.push("request_type = ?");
    values.push(requestType);
  }

  const suffix = `${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY created_at DESC, id DESC`;
  return db
    .prepare(serviceRequestSelectSql(suffix))
    .all(...values)
    .map(normalizeServiceRequestRecord) as ServiceRequestRecord[];
}

export function listServiceRequestsByCustomerId(
  db: DatabaseSync,
  customerId: number,
): ServiceRequestRecord[] {
  return db
    .prepare(serviceRequestSelectSql("WHERE customer_id = ? ORDER BY created_at DESC, id DESC"))
    .all(customerId)
    .map(normalizeServiceRequestRecord) as ServiceRequestRecord[];
}

export function getServiceRequestById(db: DatabaseSync, id: number): ServiceRequestDetail {
  const request = db
    .prepare(serviceRequestSelectSql("WHERE id = ?"))
    .get(id);

  if (!request) {
    throw new Error("需求不存在");
  }

  return loadServiceRequestDetail(db, normalizeServiceRequestRecord(request));
}

export function getServiceRequestFileById(
  db: DatabaseSync,
  id: number,
): ServiceRequestFileRecord {
  const file = db
    .prepare(
      `SELECT
        id,
        request_id AS requestId,
        filename,
        filepath,
        filesize,
        created_at AS createdAt
      FROM service_request_files
      WHERE id = ?`,
    )
    .get(id) as ServiceRequestFileRecord | undefined;

  if (!file) {
    throw new Error("文件不存在");
  }

  return file;
}

export function updateServiceRequestStatus(
  db: DatabaseSync,
  id: number,
  input: {
    status: string;
    adminNote?: string | null;
    contactNote?: string | null;
    operator?: string;
  },
) {
  const status = input.status.trim();

  if (!isServiceRequestStatus(status)) {
    throw new Error("无效需求状态");
  }

  const current = db
    .prepare("SELECT status FROM service_requests WHERE id = ?")
    .get(id) as { status: string } | undefined;

  if (!current) {
    return false;
  }

  const adminNote = normalizeOptionalText(input.adminNote);
  const contactNote = normalizeOptionalText(input.contactNote);
  const operator = input.operator || "admin";
  const result = db
    .prepare(
      `UPDATE service_requests
       SET status = ?,
           admin_note = COALESCE(?, admin_note),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(status, adminNote, id);

  if (result.changes > 0 && (current.status !== status || contactNote)) {
    insertServiceRequestLog(db, id, current.status, status, operator, contactNote);
  }

  return result.changes > 0;
}

export function getServiceRequestLogsByRequestId(
  db: DatabaseSync,
  requestId: number,
): ServiceRequestLogRecord[] {
  return db
    .prepare(
      `SELECT
        id,
        request_id AS requestId,
        from_status AS fromStatus,
        to_status AS toStatus,
        operator,
        note,
        created_at AS createdAt
      FROM service_request_logs
      WHERE request_id = ?
      ORDER BY created_at DESC, id DESC`,
    )
    .all(requestId) as ServiceRequestLogRecord[];
}

export type OrderStatusUpdateInput = {
  status: string;
  operator?: string;
  note?: string | null;
  paymentMethod?: string | null;
  paymentNote?: string | null;
  paidAmount?: number | null;
  paidAmountCents?: number | null;
  paidAt?: string | null;
  payerName?: string | null;
  payerReference?: string | null;
  platformTradeNo?: string | null;
  paymentDifferenceReason?: string | null;
  assignedPrinter?: string | null;
  estimatedStartAt?: string | null;
  estimatedFinishAt?: string | null;
  actualStartAt?: string | null;
  actualFinishAt?: string | null;
  productionNote?: string | null;
  internalNote?: string | null;
  shippingCompany?: string | null;
  trackingNumber?: string | null;
  shippedAt?: string | null;
  shippingNote?: string | null;
  adminRemark?: string | null;
};

export function updateOrderStatus(
  db: DatabaseSync,
  id: number,
  input: string | OrderStatusUpdateInput,
) {
  const status = typeof input === "string" ? input : input.status;

  if (!isOrderStatus(status)) {
    throw new Error("无效订单状态");
  }

  const current = db
    .prepare(
      `SELECT
        status,
        final_price AS finalPrice,
        payable_price AS payablePrice,
        estimated_price AS estimatedPrice,
        payment_method AS paymentMethod,
        payment_confirmed_at AS paymentConfirmedAt,
        payment_status AS paymentStatus,
        paid_at AS paidAt,
        shipping_company AS shippingCompany,
        tracking_number AS trackingNumber,
        actual_start_at AS actualStartAt,
        actual_finish_at AS actualFinishAt,
        shipped_at AS shippedAt
      FROM orders
      WHERE id = ?`,
    )
    .get(id) as
    | {
        status: string;
        finalPrice: number | null;
        payablePrice: number | null;
        estimatedPrice: number | null;
        paymentMethod: string | null;
        paymentConfirmedAt: string | null;
        paymentStatus: string | null;
        paidAt: string | null;
        shippingCompany: string | null;
        trackingNumber: string | null;
        actualStartAt: string | null;
        actualFinishAt: string | null;
        shippedAt: string | null;
      }
    | undefined;

  if (!current) {
    return false;
  }

  const paidStatus = ORDER_STATUSES[2];
  const productionStatusSet = new Set<string>(ORDER_STATUSES.slice(3, 8));

  if (status === paidStatus && current.paymentStatus === "paid") {
    throw new Error("已完成到账确认的订单不能重复确认付款");
  }

  if (productionStatusSet.has(status) && current.paymentStatus !== "paid") {
    throw new Error("未付款不能进入生产流程");
  }

  assertAllowedStatusUpdate(current.status, status, current.finalPrice);

  const shippingCompany =
    typeof input === "string" ? null : normalizeOptionalText(input.shippingCompany);
  const trackingNumber =
    typeof input === "string" ? null : normalizeOptionalText(input.trackingNumber);
  const assignedPrinter =
    typeof input === "string" ? null : normalizeOptionalText(input.assignedPrinter);
  const estimatedStartAt =
    typeof input === "string" ? null : normalizeOptionalText(input.estimatedStartAt);
  const estimatedFinishAt =
    typeof input === "string" ? null : normalizeOptionalText(input.estimatedFinishAt);
  const actualStartAt =
    typeof input === "string" ? null : normalizeOptionalText(input.actualStartAt);
  const actualFinishAt =
    typeof input === "string" ? null : normalizeOptionalText(input.actualFinishAt);
  const productionNote =
    typeof input === "string" ? null : normalizeOptionalText(input.productionNote);
  const internalNote =
    typeof input === "string" ? null : normalizeOptionalText(input.internalNote);
  const paymentMethod =
    typeof input === "string" ? null : normalizeOptionalText(input.paymentMethod);
  const paymentNote =
    typeof input === "string" ? null : normalizeOptionalText(input.paymentNote);
  const paidAt =
    typeof input === "string" ? null : normalizeOptionalText(input.paidAt);
  const payerName =
    typeof input === "string" ? null : normalizeOptionalText(input.payerName);
  const payerReference =
    typeof input === "string" ? null : normalizeOptionalText(input.payerReference);
  const platformTradeNo =
    typeof input === "string" ? null : normalizeOptionalText(input.platformTradeNo);
  const paymentDifferenceReason =
    typeof input === "string" ? null : normalizeOptionalText(input.paymentDifferenceReason);
  const shippedAt =
    typeof input === "string" ? null : normalizeOptionalText(input.shippedAt);
  const shippingNote =
    typeof input === "string" ? null : normalizeOptionalText(input.shippingNote);
  const adminRemark =
    typeof input === "string" ? null : normalizeOptionalText(input.adminRemark);
  const operator = typeof input === "string" ? "admin" : input.operator || "admin";
  const note = typeof input === "string" ? null : normalizeOptionalText(input.note);
  const nextShippingCompany = shippingCompany ?? current.shippingCompany;
  const nextTrackingNumber = trackingNumber ?? current.trackingNumber;

  if (status === "已发货" && (!nextShippingCompany || !nextTrackingNumber)) {
    throw new Error("确认发货需要填写快递公司和运单号");
  }

  const now = getBeijingTimestamp();
  const confirmedPaidAt = paidAt || now;
  const shouldCreatePaymentRecord = current.status !== status && status === "已付款";
  const expectedAmountCents = shouldCreatePaymentRecord
    ? moneyToCents(current.finalPrice ?? current.payablePrice ?? current.estimatedPrice ?? 0)
    : 0;
  const paidAmountCents = shouldCreatePaymentRecord
    ? normalizePaidAmountCents(input, expectedAmountCents)
    : 0;

  if (shouldCreatePaymentRecord && paidAmountCents !== expectedAmountCents && !paymentDifferenceReason) {
    throw new Error("实收金额与应收金额不一致时，请填写差额原因");
  }

  const result = db
    .prepare(
      `UPDATE orders
       SET status = ?,
           payment_status = CASE
             WHEN ? = '已付款' THEN 'paid'
             WHEN ? = '已取消' THEN 'cancelled'
             ELSE payment_status
           END,
           paid_at = CASE
             WHEN ? = '已付款' THEN COALESCE(paid_at, ?)
             ELSE paid_at
           END,
           payment_method = COALESCE(?, payment_method),
           payment_confirmed_at = CASE
             WHEN ? = '已付款' THEN COALESCE(payment_confirmed_at, ?)
             ELSE payment_confirmed_at
           END,
           payment_confirmed_by = CASE
             WHEN ? = '已付款' THEN COALESCE(?, payment_confirmed_by)
             ELSE payment_confirmed_by
           END,
           payment_note = COALESCE(?, payment_note),
           assigned_printer = COALESCE(?, assigned_printer),
           estimated_start_at = COALESCE(?, estimated_start_at),
           estimated_finish_at = COALESCE(?, estimated_finish_at),
           actual_start_at = CASE
             WHEN ? IS NOT NULL THEN ?
             WHEN ? IN ('生产中', '后处理', '已发货', '已完成') AND actual_start_at IS NULL THEN ?
             ELSE actual_start_at
           END,
           actual_finish_at = CASE
             WHEN ? IS NOT NULL THEN ?
             WHEN ? = '已完成' AND actual_finish_at IS NULL THEN ?
             ELSE actual_finish_at
           END,
           production_note = COALESCE(?, production_note),
           internal_note = COALESCE(?, internal_note),
           shipping_company = COALESCE(?, shipping_company),
           tracking_number = COALESCE(?, tracking_number),
           shipped_at = CASE
             WHEN ? IS NOT NULL THEN ?
             WHEN ? = '已发货' AND shipped_at IS NULL THEN ?
             ELSE shipped_at
           END,
           shipping_note = COALESCE(?, shipping_note),
           admin_remark = COALESCE(?, admin_remark),
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status,
      status,
      status,
      status,
      confirmedPaidAt,
      paymentMethod,
      status,
      now,
      status,
      operator,
      paymentNote,
      assignedPrinter,
      estimatedStartAt,
      estimatedFinishAt,
      actualStartAt,
      actualStartAt,
      status,
      now,
      actualFinishAt,
      actualFinishAt,
      status,
      now,
      productionNote,
      internalNote,
      shippingCompany,
      trackingNumber,
      shippedAt,
      shippedAt,
      status,
      now,
      shippingNote,
      adminRemark,
      now,
      id,
    );

  if (result.changes > 0 && current.status !== status) {
    insertStatusLog(db, id, current.status, status, operator, note);
  }

  if (result.changes > 0 && shouldCreatePaymentRecord) {
    createOrderPaymentRecord(db, {
      orderId: id,
      paymentMethod: paymentMethod || "manual",
      expectedAmountCents,
      paidAmountCents,
      paidAt: confirmedPaidAt,
      payerName,
      payerReference,
      platformTradeNo,
      paymentNote,
      paymentDifferenceReason,
      confirmedBy: operator,
    });
  }

  return result.changes > 0;
}

export function updateOrderFinalQuote(
  db: DatabaseSync,
  id: number,
  input: {
    finalPrice: number | null;
    finalLeadTimeHours?: number | null;
    priceAdjustmentReason?: string | null;
    productionNote?: string | null;
  },
) {
  const finalPrice = input.finalPrice;

  if (finalPrice != null && (!Number.isFinite(finalPrice) || finalPrice < 0)) {
    throw new Error("最终报价必须为非负数字");
  }

  const finalLeadTimeHours = normalizeOptionalNonNegativeInteger(
    input.finalLeadTimeHours,
    "最终交货期必须为非负整数小时",
  );

  const result = db
    .prepare(
      `UPDATE orders
       SET final_price = ?,
           final_lead_time_hours = COALESCE(?, final_lead_time_hours),
           price_adjustment_reason = ?,
           production_note = COALESCE(?, production_note),
           final_price_updated_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      finalPrice,
      finalLeadTimeHours,
      normalizeOptionalText(input.priceAdjustmentReason),
      normalizeOptionalText(input.productionNote),
      id,
    );

  return result.changes > 0;
}

export function confirmOrderFinalQuote(
  db: DatabaseSync,
  id: number,
  input: {
    finalPrice: number;
    finalLeadTimeHours?: number | null;
    priceAdjustmentReason?: string | null;
    productionNote?: string | null;
    operator?: string;
  },
) {
  const finalPrice = input.finalPrice;

  if (!Number.isFinite(finalPrice) || finalPrice <= 0) {
    throw new Error("没有最终报价不能进入待付款");
  }

  const current = db.prepare("SELECT status FROM orders WHERE id = ?").get(id) as
    | { status: string }
    | undefined;

  if (!current) {
    return false;
  }

  if (current.status === "已取消") {
    throw new Error("已取消订单不能确认报价");
  }

  if (current.status === "已完成") {
    throw new Error("已完成订单不能重新确认报价");
  }

  if (["已付款", "排产中", "生产中", "后处理", "已发货"].includes(current.status)) {
    throw new Error("已付款订单不能退回未付款状态");
  }

  const finalLeadTimeHours = normalizeOptionalNonNegativeInteger(
    input.finalLeadTimeHours,
    "最终交货期必须为非负整数小时",
  );
  const result = db
    .prepare(
      `UPDATE orders
       SET final_price = ?,
           final_lead_time_hours = ?,
           price_adjustment_reason = ?,
           production_note = ?,
           final_price_updated_at = CURRENT_TIMESTAMP,
           payment_status = 'unpaid',
           status = '待付款',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      Math.round(finalPrice * 100) / 100,
      finalLeadTimeHours,
      normalizeOptionalText(input.priceAdjustmentReason),
      normalizeOptionalText(input.productionNote),
      id,
    );

  if (result.changes > 0 && current.status !== "待付款") {
    insertStatusLog(db, id, current.status, "待付款", input.operator || "admin");
  }

  return result.changes > 0;
}

export function confirmOrderPayment(
  db: DatabaseSync,
  id: number,
  input: {
    paymentMethod?: string | null;
    paymentNote?: string | null;
    paidAmount?: number | null;
    paidAmountCents?: number | null;
    paidAt?: string | null;
    payerName?: string | null;
    payerReference?: string | null;
    platformTradeNo?: string | null;
    paymentDifferenceReason?: string | null;
    operator?: string;
  },
) {
  return updateOrderStatus(db, id, {
    status: "已付款",
    operator: input.operator || "admin",
    paymentMethod: input.paymentMethod,
    paymentNote: input.paymentNote,
    paidAmount: input.paidAmount,
    paidAmountCents: input.paidAmountCents,
    paidAt: input.paidAt,
    payerName: input.payerName,
    payerReference: input.payerReference,
    platformTradeNo: input.platformTradeNo,
    paymentDifferenceReason: input.paymentDifferenceReason,
  });
}

export function createOrderPaymentRecord(
  db: DatabaseSync,
  input: OrderPaymentInput,
): number {
  const paidAt = normalizeOptionalText(input.paidAt) || getBeijingTimestamp();
  const result = db
    .prepare(
      `INSERT INTO order_payments (
        order_id,
        payment_method,
        expected_amount_cents,
        paid_amount_cents,
        paid_at,
        payer_name,
        payer_reference,
        platform_trade_no,
        payment_note,
        payment_difference_reason,
        confirmed_by,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.orderId,
      input.paymentMethod,
      input.expectedAmountCents,
      input.paidAmountCents,
      paidAt,
      normalizeOptionalText(input.payerName),
      normalizeOptionalText(input.payerReference),
      normalizeOptionalText(input.platformTradeNo),
      normalizeOptionalText(input.paymentNote),
      normalizeOptionalText(input.paymentDifferenceReason),
      normalizeOptionalText(input.confirmedBy),
      getBeijingTimestamp(),
    );

  return Number(result.lastInsertRowid);
}

export function listOrderPaymentsByOrderId(
  db: DatabaseSync,
  orderId: number,
): OrderPaymentRecord[] {
  return db
    .prepare(orderPaymentSelectSql("WHERE order_id = ? ORDER BY paid_at DESC, id DESC"))
    .all(orderId) as OrderPaymentRecord[];
}

export function getOrderStatusLogsByOrderId(
  db: DatabaseSync,
  orderId: number,
): OrderStatusLogRecord[] {
  return db
    .prepare(
      `SELECT
        id,
        order_id AS orderId,
        from_status AS fromStatus,
        to_status AS toStatus,
        operator,
        note,
        created_at AS createdAt
      FROM order_status_logs
      WHERE order_id = ?
      ORDER BY created_at DESC, id DESC`,
    )
    .all(orderId) as OrderStatusLogRecord[];
}

export function getPaymentSettings(db: DatabaseSync): PaymentSettings {
  const row = db
    .prepare(
      `SELECT
        wechat_qr_path AS wechatQrPath,
        alipay_qr_path AS alipayQrPath,
        other_note AS otherNote,
        wechat_enabled AS wechatEnabled,
        wechat_display_name AS wechatDisplayName,
        wechat_qr_image_path AS wechatQrImagePath,
        wechat_payment_instruction AS wechatPaymentInstruction,
        alipay_enabled AS alipayEnabled,
        alipay_display_name AS alipayDisplayName,
        alipay_qr_image_path AS alipayQrImagePath,
        alipay_payment_instruction AS alipayPaymentInstruction,
        bank_enabled AS bankEnabled,
        bank_account_name AS bankAccountName,
        bank_name AS bankName,
        bank_branch AS bankBranch,
        bank_account AS bankAccount,
        bank_payment_instruction AS bankPaymentInstruction,
        payment_notice AS paymentNotice,
        customer_service_hours AS customerServiceHours,
        service_account_qr_path AS serviceAccountQrPath,
        public_security_record_number AS publicSecurityRecordNumber,
        public_security_record_url AS publicSecurityRecordUrl,
        public_security_record_enabled AS publicSecurityRecordEnabled
      FROM payment_settings
      WHERE id = 1`,
    )
    .get() as
    | (Omit<PaymentSettings, "wechatEnabled" | "alipayEnabled" | "bankEnabled"> & {
        wechatEnabled?: 0 | 1 | boolean | null;
        alipayEnabled?: 0 | 1 | boolean | null;
        bankEnabled?: 0 | 1 | boolean | null;
        publicSecurityRecordEnabled?: 0 | 1 | boolean | null;
        otherNote?: string | null;
      })
    | undefined;

  return {
    wechatQrPath: row?.wechatQrPath ?? null,
    alipayQrPath: row?.alipayQrPath ?? null,
    wechatEnabled: Boolean(row?.wechatEnabled),
    wechatDisplayName: row?.wechatDisplayName ?? "微信转账",
    wechatQrImagePath: row?.wechatQrImagePath ?? row?.wechatQrPath ?? null,
    wechatPaymentInstruction: row?.wechatPaymentInstruction ?? null,
    alipayEnabled: Boolean(row?.alipayEnabled),
    alipayDisplayName: row?.alipayDisplayName ?? "支付宝转账",
    alipayQrImagePath: row?.alipayQrImagePath ?? row?.alipayQrPath ?? null,
    alipayPaymentInstruction: row?.alipayPaymentInstruction ?? null,
    bankEnabled: Boolean(row?.bankEnabled),
    bankAccountName: row?.bankAccountName ?? null,
    bankName: row?.bankName ?? null,
    bankBranch: row?.bankBranch ?? null,
    bankAccount: row?.bankAccount ?? null,
    bankPaymentInstruction: row?.bankPaymentInstruction ?? null,
    paymentNotice: row?.paymentNotice ?? row?.otherNote ?? null,
    customerServiceHours: row?.customerServiceHours ?? "工作日晚上和周末优先处理复杂沟通",
    serviceAccountQrPath: row?.serviceAccountQrPath ?? "/brand/make3d-service-qrcode.png",
    publicSecurityRecordNumber: row?.publicSecurityRecordNumber ?? null,
    publicSecurityRecordUrl: row?.publicSecurityRecordUrl ?? null,
    publicSecurityRecordEnabled: Boolean(row?.publicSecurityRecordEnabled),
  };
}

export function updatePaymentSettings(db: DatabaseSync, input: PaymentSettings) {
  db.prepare("INSERT OR IGNORE INTO payment_settings (id) VALUES (1)").run();

  const result = db
    .prepare(
      `UPDATE payment_settings
       SET wechat_qr_path = ?,
           alipay_qr_path = ?,
           other_note = ?,
           wechat_enabled = ?,
           wechat_display_name = ?,
           wechat_qr_image_path = ?,
           wechat_payment_instruction = ?,
           alipay_enabled = ?,
           alipay_display_name = ?,
           alipay_qr_image_path = ?,
           alipay_payment_instruction = ?,
           bank_enabled = ?,
           bank_account_name = ?,
           bank_name = ?,
           bank_branch = ?,
           bank_account = ?,
           bank_payment_instruction = ?,
           payment_notice = ?,
           customer_service_hours = ?,
           service_account_qr_path = ?,
           public_security_record_number = ?,
           public_security_record_url = ?,
           public_security_record_enabled = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
    )
    .run(
      normalizeOptionalText(input.wechatQrImagePath || input.wechatQrPath),
      normalizeOptionalText(input.alipayQrImagePath || input.alipayQrPath),
      normalizeOptionalText(input.paymentNotice),
      input.wechatEnabled ? 1 : 0,
      normalizeOptionalText(input.wechatDisplayName) || "微信转账",
      normalizeOptionalText(input.wechatQrImagePath || input.wechatQrPath),
      normalizeOptionalText(input.wechatPaymentInstruction),
      input.alipayEnabled ? 1 : 0,
      normalizeOptionalText(input.alipayDisplayName) || "支付宝转账",
      normalizeOptionalText(input.alipayQrImagePath || input.alipayQrPath),
      normalizeOptionalText(input.alipayPaymentInstruction),
      input.bankEnabled ? 1 : 0,
      normalizeOptionalText(input.bankAccountName),
      normalizeOptionalText(input.bankName),
      normalizeOptionalText(input.bankBranch),
      normalizeOptionalText(input.bankAccount),
      normalizeOptionalText(input.bankPaymentInstruction),
      normalizeOptionalText(input.paymentNotice),
      normalizeOptionalText(input.customerServiceHours),
      normalizeOptionalText(input.serviceAccountQrPath) || "/brand/make3d-service-qrcode.png",
      normalizeOptionalText(input.publicSecurityRecordNumber),
      normalizeOptionalText(input.publicSecurityRecordUrl),
      input.publicSecurityRecordEnabled ? 1 : 0,
    );

  return result.changes > 0;
}

export function createCustomerAccount(db: DatabaseSync, input: CustomerAccountInput) {
  if (!/^1[3-9][0-9]{9}$/.test(input.phone.trim())) {
    throw new Error("请填写正确的11位中国大陆手机号");
  }

  if (input.password.length < 8) {
    throw new Error("密码至少8位");
  }

  const result = db
    .prepare(
      `INSERT INTO customers (
        phone,
        password_hash,
        name,
        wechat,
        email,
        default_address
      ) VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.phone,
      hashPassword(input.password),
      input.name,
      input.wechat,
      input.email || null,
      input.defaultAddress || null,
    );

  return { id: Number(result.lastInsertRowid), phone: input.phone };
}

export function findCustomerByLogin(db: DatabaseSync, login: string) {
  const normalized = login.trim();
  const customer = db
    .prepare(customerSelectSql("WHERE phone = ? OR email = ? LIMIT 1"))
    .get(normalized, normalized);

  return customer ? normalizeCustomer(customer) : null;
}

export function getCustomerById(db: DatabaseSync, id: number) {
  const customer = db.prepare(customerSelectSql("WHERE id = ? LIMIT 1")).get(id);
  return customer ? normalizeCustomer(customer) : null;
}

export function markCustomerTestAccount(db: DatabaseSync, customerId: number, isTestAccount = true) {
  const result = db
    .prepare("UPDATE customers SET is_test_account = ? WHERE id = ?")
    .run(isTestAccount ? 1 : 0, customerId);

  return result.changes > 0;
}

export function listProtectedTestCustomerIds(db: DatabaseSync) {
  return (
    db
      .prepare("SELECT id FROM customers WHERE is_test_account = 1 ORDER BY id")
      .all() as Array<{ id: number }>
  ).map((row) => row.id);
}

export function getCustomerBySessionToken(db: DatabaseSync, token?: string) {
  const session = verifyCustomerSessionToken(token);
  return session ? getCustomerById(db, session.customerId) : null;
}

export function createWechatBindCode(
  db: DatabaseSync,
  customerId: number,
  now = Date.now(),
) {
  const expiresAt = now + 30 * 60 * 1000;
  const bindCode = createUniqueWechatBindCode(db);

  db.prepare(
    `INSERT INTO wechat_accounts (
      customer_id,
      bind_code,
      bind_code_expires_at,
      updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(customer_id) DO UPDATE SET
      bind_code = excluded.bind_code,
      bind_code_expires_at = excluded.bind_code_expires_at,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(customerId, bindCode, expiresAt);

  return { bindCode, expiresAt };
}

export function getWechatAccountByCustomerId(
  db: DatabaseSync,
  customerId: number,
): WechatAccountRecord | null {
  const account = db
    .prepare(wechatAccountSelectSql("WHERE customer_id = ? LIMIT 1"))
    .get(customerId);

  return account ? normalizeWechatAccountRecord(account) : null;
}

export function getWechatAccountByOpenid(
  db: DatabaseSync,
  openid: string,
): WechatAccountRecord | null {
  const account = db.prepare(wechatAccountSelectSql("WHERE openid = ? LIMIT 1")).get(openid);
  return account ? normalizeWechatAccountRecord(account) : null;
}

export function getBoundWechatAccountByCustomerId(
  db: DatabaseSync,
  customerId: number | null | undefined,
): WechatAccountRecord | null {
  if (!customerId) {
    return null;
  }

  const account = db
    .prepare(wechatAccountSelectSql("WHERE customer_id = ? AND openid IS NOT NULL LIMIT 1"))
    .get(customerId);

  return account ? normalizeWechatAccountRecord(account) : null;
}

export function markWechatSubscribed(
  db: DatabaseSync,
  input: { openid: string; unionid?: string | null; subscribed: boolean },
) {
  const existing = getWechatAccountByOpenid(db, input.openid);

  if (existing) {
    db.prepare(
      `UPDATE wechat_accounts
       SET subscribed = ?,
           unionid = COALESCE(?, unionid),
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE openid = ?`,
    ).run(input.subscribed ? 1 : 0, normalizeOptionalText(input.unionid), input.openid);
    return getWechatAccountByOpenid(db, input.openid);
  }

  db.prepare(
    `INSERT INTO wechat_accounts (
      openid,
      unionid,
      subscribed,
      last_message_at,
      updated_at
    ) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(input.openid, normalizeOptionalText(input.unionid), input.subscribed ? 1 : 0);

  return getWechatAccountByOpenid(db, input.openid);
}

export function touchWechatAccountMessage(db: DatabaseSync, openid: string) {
  db.prepare(
    `UPDATE wechat_accounts
     SET last_message_at = CURRENT_TIMESTAMP,
         updated_at = CURRENT_TIMESTAMP
     WHERE openid = ?`,
  ).run(openid);
}

export function bindWechatAccountByCode(
  db: DatabaseSync,
  input: { openid: string; bindCode: string; unionid?: string | null; now?: number },
): WechatAccountRecord | null {
  const now = input.now ?? Date.now();
  const bindCode = input.bindCode.trim().toUpperCase();
  const account = db
    .prepare(
      wechatAccountSelectSql(
        "WHERE bind_code = ? AND bind_code_expires_at IS NOT NULL AND bind_code_expires_at >= ? LIMIT 1",
      ),
    )
    .get(bindCode, now);

  if (!account) {
    return null;
  }

  const bindAccount = normalizeWechatAccountRecord(account);

  try {
    db.exec("BEGIN");
    db.prepare(
      `UPDATE wechat_accounts
       SET openid = NULL,
           subscribed = 0,
           updated_at = CURRENT_TIMESTAMP
       WHERE openid = ? AND (customer_id IS NULL OR customer_id != ?)`,
    ).run(input.openid, bindAccount.customerId);
    db.prepare(
      `UPDATE wechat_accounts
       SET openid = ?,
           unionid = COALESCE(?, unionid),
           subscribed = 1,
           bind_code = NULL,
           bind_code_expires_at = NULL,
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(input.openid, normalizeOptionalText(input.unionid), bindAccount.id);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  return bindAccount.customerId
    ? getWechatAccountByCustomerId(db, bindAccount.customerId)
    : getWechatAccountByOpenid(db, input.openid);
}

export function createWechatNotification(
  db: DatabaseSync,
  input: {
    customerId?: number | null;
    openid?: string | null;
    orderId?: number | null;
    type: string;
    content: string;
    sendStatus: string;
    errorMessage?: string | null;
    sentAt?: string | null;
    platformMessageId?: string | null;
    errorCode?: string | null;
    retryCount?: number | null;
    idempotencyKey?: string | null;
  },
) {
  const result = db
    .prepare(
      `INSERT INTO wechat_notifications (
        customer_id,
        openid,
        order_id,
        type,
        content,
        send_status,
        error_message,
        sent_at,
        platform_message_id,
        error_code,
        retry_count,
        idempotency_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.customerId ?? null,
      input.openid ?? null,
      input.orderId ?? null,
      input.type,
      input.content,
      input.sendStatus,
      normalizeOptionalText(input.errorMessage),
      normalizeOptionalText(input.sentAt),
      normalizeOptionalText(input.platformMessageId),
      normalizeOptionalText(input.errorCode),
      Math.max(0, Math.floor(input.retryCount ?? 0)),
      normalizeOptionalText(input.idempotencyKey),
    );

  return Number(result.lastInsertRowid);
}

export function getWechatNotificationByIdempotencyKey(
  db: DatabaseSync,
  idempotencyKey: string,
): WechatNotificationRecord | null {
  const notification = db
    .prepare(wechatNotificationSelectSql("WHERE idempotency_key = ? LIMIT 1"))
    .get(idempotencyKey);

  return notification ? normalizeWechatNotificationRecord(notification) : null;
}

export function getLatestWechatNotificationByOrderId(
  db: DatabaseSync,
  orderId: number,
): WechatNotificationRecord | null {
  const notification = db
    .prepare(wechatNotificationSelectSql("WHERE order_id = ? ORDER BY created_at DESC, id DESC LIMIT 1"))
    .get(orderId);

  return notification ? normalizeWechatNotificationRecord(notification) : null;
}

export function listWechatNotificationsByOrderId(
  db: DatabaseSync,
  orderId: number,
): WechatNotificationRecord[] {
  return db
    .prepare(wechatNotificationSelectSql("WHERE order_id = ? ORDER BY created_at DESC, id DESC"))
    .all(orderId)
    .map(normalizeWechatNotificationRecord) as WechatNotificationRecord[];
}

export function createCustomerServiceRequest(
  db: DatabaseSync,
  input: CustomerServiceRequestInput,
) {
  const message = normalizeRequiredText(input.message, "请填写客服请求内容");
  if (message.length > 1000) {
    throw new Error("客服请求内容最多 1000 字");
  }
  const links = resolveCustomerServiceRequestLinks(db, {
    ...input,
    message,
  });
  const result = db
    .prepare(
      `INSERT INTO customer_service_requests (
        customer_id,
        openid,
        phone,
        order_id,
        message,
        status,
        source,
        category
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
    )
    .run(
      links.customerId,
      normalizeOptionalText(input.openid),
      links.phone,
      links.orderId,
      message,
      normalizeOptionalText(input.source) || "wechat_keyword",
      normalizeOptionalText(input.category) || "other",
    );

  return { id: Number(result.lastInsertRowid) };
}

function resolveCustomerServiceRequestLinks(
  db: DatabaseSync,
  input: CustomerServiceRequestInput & { message: string },
) {
  const orderNo = extractOrderNo(input.message);
  let phone = normalizeOptionalText(input.phone) || extractMainlandPhone(input.message);
  let customerId = input.customerId ?? null;
  let orderId = input.orderId ?? null;

  if (orderNo && !orderId) {
    const order = db
      .prepare(
        `SELECT
          id,
          customer_id AS customerId,
          phone
        FROM orders
        WHERE order_no = ?
        LIMIT 1`,
      )
      .get(orderNo) as { id: number; customerId: number | null; phone: string | null } | undefined;

    if (order) {
      orderId = order.id;
      customerId = customerId ?? order.customerId;
      phone = order.phone || phone || null;
    }
  }

  if (!customerId && input.openid) {
    customerId = getWechatAccountByOpenid(db, input.openid)?.customerId ?? null;
  }

  if (!customerId && phone) {
    customerId = findCustomerByLogin(db, phone)?.id ?? null;
  }

  if (!orderId && customerId) {
    const order = db
      .prepare(
        `SELECT id
        FROM orders
        WHERE customer_id = ?
          AND status NOT IN ('已完成', '已取消')
        ORDER BY created_at DESC, id DESC
        LIMIT 1`,
      )
      .get(customerId) as { id: number } | undefined;

    orderId = order?.id ?? null;
  }

  if (customerId && !phone) {
    phone = getCustomerById(db, customerId)?.phone ?? null;
  }

  return {
    customerId,
    orderId,
    phone,
  };
}

export function searchCustomerServiceRequests(
  db: DatabaseSync,
  filters: { status?: string; query?: string } = {},
): CustomerServiceRequestRecord[] {
  const where: string[] = [];
  const values: string[] = [];
  const status = filters.status?.trim();
  const query = filters.query?.trim();

  if (status && isCustomerServiceRequestStatus(status)) {
    where.push("customer_service_requests.status = ?");
    values.push(status);
  }

  if (query) {
    where.push(
      `(customer_service_requests.message LIKE ? OR customer_service_requests.phone LIKE ? OR customer_service_requests.openid LIKE ? OR customers.name LIKE ? OR orders.order_no LIKE ?)`,
    );
    const like = `%${query}%`;
    values.push(like, like, like, like, like);
  }

  const suffix = `${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY customer_service_requests.created_at DESC, customer_service_requests.id DESC`;
  return db.prepare(customerServiceRequestSelectSql(suffix)).all(...values) as CustomerServiceRequestRecord[];
}

export function markCustomerServiceRequestHandled(db: DatabaseSync, id: number) {
  return updateCustomerServiceRequest(db, id, {
    status: "resolved",
    handledBy: "admin",
  });
}

export function updateCustomerServiceRequest(
  db: DatabaseSync,
  id: number,
  input: {
    status?: CustomerServiceRequestStatus;
    adminNote?: string | null;
    customerVisibleReply?: string | null;
    handledBy?: string | null;
  },
) {
  const status = input.status || null;
  if (status && !isCustomerServiceRequestStatus(status)) {
    throw new Error("无效客服状态");
  }

  const handledAt = status && ["resolved", "closed"].includes(status) ? getBeijingTimestamp() : null;
  const result = db
    .prepare(
      `UPDATE customer_service_requests
       SET status = COALESCE(?, status),
           admin_note = COALESCE(?, admin_note),
           customer_visible_reply = COALESCE(?, customer_visible_reply),
           handled_by = COALESCE(?, handled_by),
           handled_at = COALESCE(?, handled_at),
           updated_at = ?
       WHERE id = ?`,
    )
    .run(
      status,
      normalizeOptionalText(input.adminNote),
      normalizeOptionalText(input.customerVisibleReply),
      normalizeOptionalText(input.handledBy),
      handledAt,
      getBeijingTimestamp(),
      id,
    );

  return result.changes > 0;
}

export function listCustomerServiceRequestsForCustomer(
  db: DatabaseSync,
  customerId: number,
  orderId?: number | null,
): CustomerServiceRequestRecord[] {
  const where = ["customer_service_requests.customer_id = ?"];
  const values: number[] = [customerId];

  if (orderId) {
    where.push("customer_service_requests.order_id = ?");
    values.push(orderId);
  }

  return db
    .prepare(
      customerServiceRequestSelectSql(
        `WHERE ${where.join(" AND ")} ORDER BY customer_service_requests.created_at DESC, customer_service_requests.id DESC`,
      ),
    )
    .all(...values) as CustomerServiceRequestRecord[];
}

export function createPasswordResetToken(db: DatabaseSync, customerId: number, now = Date.now()) {
  const recentCount = Number(
    (db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM password_reset_tokens
         WHERE customer_id = ? AND created_at >= ?`,
      )
      .get(customerId, now - 10 * 60 * 1000) as { count: number }).count,
  );

  if (recentCount >= 3) {
    throw new Error("10分钟内最多请求3次重置邮件");
  }

  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashResetToken(token);
  db.prepare(
    `INSERT INTO password_reset_tokens (
      customer_id,
      token_hash,
      expires_at,
      created_at
    ) VALUES (?, ?, ?, ?)`,
  ).run(customerId, tokenHash, now + 30 * 60 * 1000, now);

  return { token, tokenHash };
}

export function verifyPasswordResetToken(db: DatabaseSync, token: string, now = Date.now()) {
  const record = db
    .prepare(
      `SELECT id, customer_id AS customerId
       FROM password_reset_tokens
       WHERE token_hash = ? AND used_at IS NULL AND expires_at >= ?
       LIMIT 1`,
    )
    .get(hashResetToken(token), now) as { id: number; customerId: number } | undefined;

  return record || null;
}

export function consumePasswordResetToken(
  db: DatabaseSync,
  token: string,
  newPassword: string,
  now = Date.now(),
) {
  if (newPassword.length < 8) {
    throw new Error("密码至少8位");
  }

  const record = verifyPasswordResetToken(db, token, now);

  if (!record) {
    return false;
  }

  const passwordHash = hashPassword(newPassword);
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE customers SET password_hash = ? WHERE id = ?").run(passwordHash, record.customerId);
    db.prepare("UPDATE password_reset_tokens SET used_at = ? WHERE customer_id = ?").run(now, record.customerId);
    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("base64url");
  return `scrypt.${salt}.${hash}`;
}

export function verifyPassword(password: string, passwordHash: string) {
  const [, salt, hash] = passwordHash.split(".");

  if (!salt || !hash) {
    return false;
  }

  const expected = Buffer.from(hash);
  const actual = Buffer.from(scryptSync(password, salt, 64).toString("base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function createSliceJob(db: DatabaseSync, input: SliceJobInput) {
  const result = db
    .prepare(
      `INSERT INTO slice_jobs (
        order_id,
        file_id,
        status,
        input_file_path,
        gcode_file_path,
        material,
        layer_height,
        infill_density,
        need_support
      ) VALUES (?, ?, 'processing', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.orderId,
      input.fileId,
      input.inputFilePath,
      input.gcodeFilePath,
      input.material,
      input.layerHeight,
      input.infillDensity,
      input.needSupport ? 1 : 0,
    );

  return Number(result.lastInsertRowid);
}

export function updateSliceJobSuccess(
  db: DatabaseSync,
  id: number,
  input: SliceJobSuccessInput,
) {
  const result = db
    .prepare(
      `UPDATE slice_jobs
       SET status = 'success',
           filament_weight_g = ?,
           print_time_seconds = ?,
           raw_filament_used_mm = ?,
           raw_filament_used_cm3 = ?,
           raw_filament_used_g = ?,
           filament_weight_source = ?,
           material_density = ?,
           material_fee = ?,
           time_fee = ?,
           estimated_price = ?,
           error_message = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(
      input.filamentWeightG,
      input.printTimeSeconds,
      input.rawFilamentUsedMm ?? null,
      input.rawFilamentUsedCm3 ?? null,
      input.rawFilamentUsedG ?? null,
      input.filamentWeightSource ?? null,
      input.materialDensity ?? null,
      input.materialFee,
      input.timeFee,
      input.estimatedPrice,
      id,
    );

  return result.changes > 0;
}

export function updateSliceJobFailure(db: DatabaseSync, id: number, errorMessage: string) {
  const result = db
    .prepare(
      `UPDATE slice_jobs
       SET status = 'failed',
           error_message = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    )
    .run(errorMessage, id);

  return result.changes > 0;
}

export function getLatestSliceJobByOrderId(db: DatabaseSync, orderId: number) {
  const job = db
    .prepare(sliceJobSelectSql("WHERE order_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1"))
    .get(orderId);

  return job ? normalizeSliceJobRecord(job) : null;
}

export function getSliceJobsByOrderId(db: DatabaseSync, orderId: number) {
  return db
    .prepare(sliceJobSelectSql("WHERE order_id = ? ORDER BY updated_at DESC, id DESC"))
    .all(orderId)
    .map(normalizeSliceJobRecord) as SliceJobRecord[];
}

function serviceRequestSelectSql(suffix: string) {
  return `SELECT
    id,
    request_type AS requestType,
    customer_id AS customerId,
    project_name AS projectName,
    customer_name AS customerName,
    phone,
    wechat,
    email,
    budget_range AS budgetRange,
    expected_delivery_time AS expectedDeliveryTime,
    modification_notes AS modificationNotes,
    key_dimensions AS keyDimensions,
    needs_printing AS needsPrinting,
    project_type AS projectType,
    function_description AS functionDescription,
    has_drawings_or_sample AS hasDrawingsOrSample,
    needs_onsite_measurement AS needsOnsiteMeasurement,
    accepts_evening_or_weekend_contact AS acceptsEveningOrWeekendContact,
    remarks,
    admin_note AS adminNote,
    status,
    (SELECT COUNT(*) FROM service_request_files WHERE service_request_files.request_id = service_requests.id) AS fileCount,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM service_requests
  ${suffix}`;
}

function loadServiceRequestDetail(
  db: DatabaseSync,
  request: ServiceRequestRecord,
): ServiceRequestDetail {
  const files = db
    .prepare(
      `SELECT
        id,
        request_id AS requestId,
        filename,
        filepath,
        filesize,
        created_at AS createdAt
      FROM service_request_files
      WHERE request_id = ?
      ORDER BY created_at ASC, id ASC`,
    )
    .all(request.id) as ServiceRequestFileRecord[];

  return { ...request, files };
}

function orderSelectSql(suffix: string) {
  return `SELECT
    id,
    order_no AS orderNo,
    customer_id AS customerId,
    customer_name AS customerName,
    phone,
    wechat,
    email,
    company,
    material,
    color,
    quantity,
    remark,
    estimated_price AS estimatedPrice,
    estimated_price_min AS estimatedPriceMin,
    estimated_price_max AS estimatedPriceMax,
    estimated_lead_time_min_hours AS estimatedLeadTimeMinHours,
    estimated_lead_time_max_hours AS estimatedLeadTimeMaxHours,
    packaging_fee AS packagingFee,
    shipping_fee AS shippingFee,
    shipping_method AS shippingMethod,
    shipping_fee_estimate AS shippingFeeEstimate,
    recipient_name AS recipientName,
    recipient_phone AS recipientPhone,
    address_region AS addressRegion,
    address_detail AS addressDetail,
    shipping_province AS shippingProvince,
    shipping_city AS shippingCity,
    shipping_city_custom AS shippingCityCustom,
    shipping_district AS shippingDistrict,
    shipping_province_code AS shippingProvinceCode,
    shipping_province_name AS shippingProvinceName,
    shipping_city_code AS shippingCityCode,
    shipping_city_name AS shippingCityName,
    shipping_district_code AS shippingDistrictCode,
    shipping_district_name AS shippingDistrictName,
    shipping_district_custom AS shippingDistrictCustom,
    shipping_detail_address AS shippingDetailAddress,
    shipping_postal_code AS shippingPostalCode,
    shipping_label AS shippingLabel,
    shipping_address_snapshot AS shippingAddressSnapshot,
    shipping_remark AS shippingRemark,
    print_fee_total AS printFeeTotal,
    payable_price AS payablePrice,
    estimated_lead_time_hours AS estimatedLeadTimeHours,
    final_price AS finalPrice,
    final_lead_time_hours AS finalLeadTimeHours,
    price_adjustment_reason AS priceAdjustmentReason,
    final_price_updated_at AS finalPriceUpdatedAt,
    production_note AS productionNote,
    assigned_printer AS assignedPrinter,
    estimated_start_at AS estimatedStartAt,
    estimated_finish_at AS estimatedFinishAt,
    actual_start_at AS actualStartAt,
    actual_finish_at AS actualFinishAt,
    internal_note AS internalNote,
    payment_method AS paymentMethod,
    payment_status AS paymentStatus,
    paid_at AS paidAt,
    payment_confirmed_at AS paymentConfirmedAt,
    payment_confirmed_by AS paymentConfirmedBy,
    payment_note AS paymentNote,
    shipping_company AS shippingCompany,
    tracking_number AS trackingNumber,
    shipped_at AS shippedAt,
    shipping_note AS shippingNote,
    admin_remark AS adminRemark,
    (SELECT COUNT(*) FROM files WHERE files.order_id = orders.id) AS fileCount,
    status,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM orders
  ${suffix}`;
}

function quoteDraftFileSelectSql(suffix: string) {
  return `SELECT
    quote_draft_files.id,
    quote_draft_files.draft_id AS draftId,
    quote_draft_files.original_filename AS originalFilename,
    quote_draft_files.filename,
    quote_draft_files.filepath,
    quote_draft_files.filesize,
    quote_draft_files.material,
    quote_draft_files.color,
    quote_draft_files.quantity,
    quote_draft_files.bounding_box_x AS boundingBoxX,
    quote_draft_files.bounding_box_y AS boundingBoxY,
    quote_draft_files.bounding_box_z AS boundingBoxZ,
    quote_draft_files.slice_status AS sliceStatus,
    quote_draft_files.error_message AS errorMessage,
    quote_draft_files.filament_weight_g AS filamentWeightG,
    quote_draft_files.print_time_seconds AS printTimeSeconds,
    quote_draft_files.raw_filament_used_mm AS rawFilamentUsedMm,
    quote_draft_files.raw_filament_used_cm3 AS rawFilamentUsedCm3,
    quote_draft_files.raw_filament_used_g AS rawFilamentUsedG,
    quote_draft_files.filament_weight_source AS filamentWeightSource,
    quote_draft_files.material_density AS materialDensity,
    quote_draft_files.material_fee AS materialFee,
    quote_draft_files.time_fee AS timeFee,
    quote_draft_files.base_print_price AS basePrintPrice,
    quote_draft_files.created_at AS createdAt,
    quote_draft_files.updated_at AS updatedAt
  FROM quote_draft_files
  ${suffix}`;
}

function sliceJobSelectSql(suffix: string) {
  return `SELECT
    id,
    order_id AS orderId,
    file_id AS fileId,
    status,
    input_file_path AS inputFilePath,
    gcode_file_path AS gcodeFilePath,
    material,
    layer_height AS layerHeight,
    infill_density AS infillDensity,
    need_support AS needSupport,
    filament_weight_g AS filamentWeightG,
    print_time_seconds AS printTimeSeconds,
    raw_filament_used_mm AS rawFilamentUsedMm,
    raw_filament_used_cm3 AS rawFilamentUsedCm3,
    raw_filament_used_g AS rawFilamentUsedG,
    filament_weight_source AS filamentWeightSource,
    material_density AS materialDensity,
    material_fee AS materialFee,
    time_fee AS timeFee,
    estimated_price AS estimatedPrice,
    error_message AS errorMessage,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM slice_jobs
  ${suffix}`;
}

function customerSelectSql(suffix: string) {
  return `SELECT
    id,
    phone,
    password_hash AS passwordHash,
    name,
    wechat,
    email,
    default_address AS defaultAddress,
    is_test_account AS isTestAccount,
    created_at AS createdAt
  FROM customers
  ${suffix}`;
}

function customerAddressSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    recipient_name AS recipientName,
    phone,
    province,
    city,
    district,
    province_code AS provinceCode,
    province_name AS provinceName,
    city_code AS cityCode,
    city_name AS cityName,
    city_custom AS cityCustom,
    district_code AS districtCode,
    district_name AS districtName,
    district_custom AS districtCustom,
    detail_address AS detailAddress,
    postal_code AS postalCode,
    label,
    is_default AS isDefault,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM customer_addresses
  ${suffix}`;
}

function wechatAccountSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    openid,
    unionid,
    subscribed,
    bind_code AS bindCode,
    bind_code_expires_at AS bindCodeExpiresAt,
    last_message_at AS lastMessageAt,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM wechat_accounts
  ${suffix}`;
}

function wechatNotificationSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    openid,
    order_id AS orderId,
    type,
    content,
    send_status AS sendStatus,
    error_message AS errorMessage,
    sent_at AS sentAt,
    platform_message_id AS platformMessageId,
    error_code AS errorCode,
    retry_count AS retryCount,
    idempotency_key AS idempotencyKey,
    created_at AS createdAt
  FROM wechat_notifications
  ${suffix}`;
}

function orderPaymentSelectSql(suffix: string) {
  return `SELECT
    id,
    order_id AS orderId,
    payment_method AS paymentMethod,
    expected_amount_cents AS expectedAmountCents,
    paid_amount_cents AS paidAmountCents,
    paid_at AS paidAt,
    payer_name AS payerName,
    payer_reference AS payerReference,
    platform_trade_no AS platformTradeNo,
    payment_note AS paymentNote,
    payment_difference_reason AS paymentDifferenceReason,
    refund_status AS refundStatus,
    refund_amount_cents AS refundAmountCents,
    refund_note AS refundNote,
    confirmed_by AS confirmedBy,
    created_at AS createdAt
  FROM order_payments
  ${suffix}`;
}

function customerServiceRequestSelectSql(suffix: string) {
  return `SELECT
    customer_service_requests.id,
    customer_service_requests.customer_id AS customerId,
    customers.name AS customerName,
    customer_service_requests.openid,
    customer_service_requests.phone,
    customer_service_requests.order_id AS orderId,
    orders.order_no AS orderNo,
    customer_service_requests.message,
    customer_service_requests.status,
    customer_service_requests.source,
    customer_service_requests.category,
    customer_service_requests.admin_note AS adminNote,
    customer_service_requests.customer_visible_reply AS customerVisibleReply,
    customer_service_requests.handled_by AS handledBy,
    customer_service_requests.handled_at AS handledAt,
    customer_service_requests.created_at AS createdAt,
    customer_service_requests.updated_at AS updatedAt
  FROM customer_service_requests
  LEFT JOIN customers ON customers.id = customer_service_requests.customer_id
  LEFT JOIN orders ON orders.id = customer_service_requests.order_id
  ${suffix}`;
}

function normalizeCustomer(customer: unknown) {
  const record = customer as Record<string, unknown> & { isTestAccount?: 0 | 1 | boolean };
  return {
    ...record,
    isTestAccount: Boolean(record.isTestAccount),
  } as CustomerRecord;
}

function normalizeWechatNotificationRecord(notification: unknown) {
  const record = notification as Record<string, unknown> & { retryCount?: number | null };
  return {
    ...record,
    retryCount: Number(record.retryCount ?? 0),
  } as WechatNotificationRecord;
}

function normalizeWechatAccountRecord(account: unknown) {
  const record = account as Record<string, unknown> & { subscribed: 0 | 1 | boolean };
  return {
    ...record,
    subscribed: Boolean(record.subscribed),
  } as WechatAccountRecord;
}

function hashResetToken(token: string) {
  return createHash("sha256").update(token).digest("base64url");
}

function normalizeFileRecord(file: unknown) {
  const record = file as Record<string, unknown> & { requiresManualConfirmation: 0 | 1 };
  return {
    ...record,
    requiresManualConfirmation: Boolean(record.requiresManualConfirmation),
  } as OrderFileRecord;
}

function normalizeQuoteDraftRecord(draft: unknown) {
  return draft as QuoteDraftRecord;
}

function normalizeQuoteDraftFileRecord(file: unknown) {
  return file as QuoteDraftFileRecord;
}

function normalizeCustomerAddressRecord(address: unknown) {
  const record = address as Record<string, unknown> & { isDefault: 0 | 1 | boolean };
  const provinceName = (record.provinceName as string | null) || (record.province as string) || "";
  const cityCustom = (record.cityCustom as string | null) || null;
  const cityName = (record.cityName as string | null) || (record.city as string) || "";
  const districtCustom = (record.districtCustom as string | null) || null;
  const districtName = (record.districtName as string | null) || (record.district as string) || "";
  return {
    ...record,
    province: provinceName,
    city: cityCustom || cityName,
    district: districtCustom || districtName,
    provinceName,
    cityName,
    cityCustom,
    districtName,
    districtCustom,
    provinceCode: (record.provinceCode as string | null) || null,
    cityCode: (record.cityCode as string | null) || null,
    districtCode: (record.districtCode as string | null) || null,
    isDefault: Boolean(record.isDefault),
  } as CustomerAddressRecord;
}

function normalizeSliceJobRecord(job: unknown) {
  const record = job as Record<string, unknown> & { needSupport: 0 | 1 };
  return {
    ...record,
    needSupport: Boolean(record.needSupport),
  } as SliceJobRecord;
}

function normalizeServiceRequestRecord(request: unknown) {
  return request as ServiceRequestRecord;
}

function createUniqueWechatBindCode(db: DatabaseSync) {
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const code = createWechatBindCodeCandidate();
    const exists = db
      .prepare("SELECT 1 FROM wechat_accounts WHERE bind_code = ? LIMIT 1")
      .get(code);

    if (!exists) {
      return code;
    }
  }

  throw new Error("绑定码生成失败，请稍后重试");
}

function createWechatBindCodeCandidate() {
  const value = randomBytes(4).readUInt32BE(0) % 1000000;
  return `M3D-${String(value).padStart(6, "0")}`;
}

export function getBeijingTimestamp(now = new Date()) {
  const parts = getBeijingDateParts(now);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`;
}

function createOrderNo(now = new Date()) {
  const parts = getBeijingDateParts(now);
  const timestamp = [
    parts.year,
    parts.month,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  ].join("");
  const suffix = String(Math.floor(Math.random() * 1000)).padStart(3, "0");

  return `M3D${timestamp}${suffix}`;
}

function getBeijingDateParts(now: Date) {
  const beijing = new Date(now.getTime() + 8 * 60 * 60 * 1000);

  return {
    year: String(beijing.getUTCFullYear()),
    month: String(beijing.getUTCMonth() + 1).padStart(2, "0"),
    day: String(beijing.getUTCDate()).padStart(2, "0"),
    hour: String(beijing.getUTCHours()).padStart(2, "0"),
    minute: String(beijing.getUTCMinutes()).padStart(2, "0"),
    second: String(beijing.getUTCSeconds()).padStart(2, "0"),
  };
}

function isOrderStatus(status: string): status is OrderStatus {
  return ORDER_STATUSES.includes(status as OrderStatus);
}

function isServiceRequestType(type: string): type is ServiceRequestType {
  return SERVICE_REQUEST_TYPES.includes(type as ServiceRequestType);
}

function isServiceRequestStatus(status: string): status is ServiceRequestStatus {
  return SERVICE_REQUEST_STATUSES.includes(status as ServiceRequestStatus);
}

function isCustomerServiceRequestStatus(
  status: string,
): status is CustomerServiceRequestStatus {
  return CUSTOMER_SERVICE_REQUEST_STATUSES.includes(status as CustomerServiceRequestStatus);
}

function assertAllowedStatusUpdate(currentStatus: string, nextStatus: string, finalPrice: number | null) {
  if (currentStatus === nextStatus) {
    return;
  }

  if (currentStatus === "已取消") {
    throw new Error("已取消订单不能继续流转");
  }

  if (currentStatus === "已完成") {
    throw new Error("已完成订单不能继续流转");
  }

  if (nextStatus === "待付款" && (finalPrice == null || finalPrice <= 0)) {
    throw new Error("没有最终报价不能进入待付款");
  }

  if (nextStatus === "已付款") {
    if (currentStatus !== "待付款") {
      throw new Error("只有待付款订单可以确认到账");
    }

    if (finalPrice == null || finalPrice <= 0) {
      throw new Error("没有最终报价不能确认到账");
    }
  }

  const productionStatuses = new Set(["排产中", "生产中", "后处理", "已发货", "已完成"]);
  const paidOrProductionStatuses = new Set(["已付款", "排产中", "生产中", "后处理", "已发货", "已完成"]);
  const unpaidStatuses = new Set(["待确认", "待付款"]);

  if (paidOrProductionStatuses.has(currentStatus) && unpaidStatuses.has(nextStatus)) {
    throw new Error("已付款订单不能退回未付款状态");
  }

  if (productionStatuses.has(nextStatus) && !paidOrProductionStatuses.has(currentStatus)) {
    throw new Error("未付款不能进入生产流程");
  }
}

function insertStatusLog(
  db: DatabaseSync,
  orderId: number,
  fromStatus: string | null,
  toStatus: string,
  operator: string,
  note?: string | null,
) {
  db.prepare(
    `INSERT INTO order_status_logs (
      order_id,
      from_status,
      to_status,
      operator,
      note,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(orderId, fromStatus, toStatus, operator, normalizeOptionalText(note), getBeijingTimestamp());
}

function insertServiceRequestLog(
  db: DatabaseSync,
  requestId: number,
  fromStatus: string | null,
  toStatus: string,
  operator: string,
  note?: string | null,
) {
  db.prepare(
    `INSERT INTO service_request_logs (
      request_id,
      from_status,
      to_status,
      operator,
      note
    ) VALUES (?, ?, ?, ?, ?)`,
  ).run(requestId, fromStatus, toStatus, operator, normalizeOptionalText(note));
}

function normalizeOptionalText(value: string | null | undefined) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function moneyToCents(value: number) {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }

  return Math.round(value * 100);
}

function normalizePaidAmountCents(
  input: string | OrderStatusUpdateInput,
  expectedAmountCents: number,
) {
  if (typeof input === "string") {
    return expectedAmountCents;
  }

  if (Number.isFinite(input.paidAmountCents ?? NaN) && input.paidAmountCents != null) {
    return Math.round(input.paidAmountCents);
  }

  if (Number.isFinite(input.paidAmount ?? NaN) && input.paidAmount != null) {
    return moneyToCents(input.paidAmount);
  }

  return expectedAmountCents;
}

function extractOrderNo(value: string) {
  return value.match(/M3D\d{12,24}/i)?.[0].toUpperCase() || null;
}

function extractMainlandPhone(value: string) {
  return value.match(/1[3-9]\d{9}/)?.[0] || null;
}

function normalizeRequiredText(value: string | null | undefined, errorMessage: string) {
  const normalized = normalizeOptionalText(value);

  if (!normalized) {
    throw new Error(errorMessage);
  }

  return normalized;
}

function normalizeOptionalNonNegativeInteger(value: number | null | undefined, errorMessage: string) {
  if (value == null) {
    return null;
  }

  if (!Number.isFinite(value) || value < 0) {
    throw new Error(errorMessage);
  }

  return Math.ceil(value);
}

function migrateLegacyOrderStatuses(db: DatabaseSync) {
  const legacyStatusMap = [
    ["待处理", "待确认"],
    ["已报价", "待付款"],
    ["打印中", "生产中"],
  ] as const;

  for (const [legacyStatus, nextStatus] of legacyStatusMap) {
    db.prepare("UPDATE orders SET status = ? WHERE status = ?").run(nextStatus, legacyStatus);
  }
}

function migrateOrderPaymentMetadata(db: DatabaseSync) {
  db.prepare(
    `UPDATE orders
     SET payment_status = CASE
       WHEN status IN ('已付款', '排产中', '生产中', '后处理', '已发货', '已完成')
         OR payment_confirmed_at IS NOT NULL THEN 'paid'
       WHEN status = '已取消' THEN 'cancelled'
       ELSE COALESCE(NULLIF(payment_status, ''), 'unpaid')
     END
     WHERE payment_status IS NULL
        OR payment_status = ''
        OR status IN ('已付款', '排产中', '生产中', '后处理', '已发货', '已完成', '已取消')
        OR payment_confirmed_at IS NOT NULL`,
  ).run();

  db.prepare(
    `UPDATE orders
     SET paid_at = COALESCE(paid_at, payment_confirmed_at, CURRENT_TIMESTAMP)
     WHERE paid_at IS NULL
       AND (
         payment_status = 'paid'
         OR status IN ('已付款', '排产中', '生产中', '后处理', '已发货', '已完成')
         OR payment_confirmed_at IS NOT NULL
       )`,
  ).run();

  db.prepare(
    `UPDATE orders
     SET updated_at = COALESCE(updated_at, created_at, CURRENT_TIMESTAMP)
     WHERE updated_at IS NULL`,
  ).run();
}

function ensureColumns(
  db: DatabaseSync,
  tableName: string,
  requiredColumns: readonly (readonly [string, string])[],
) {
  const existingColumns = new Set(
    (db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>).map(
      (column) => column.name,
    ),
  );

  for (const [name, type] of requiredColumns) {
    if (!existingColumns.has(name)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${name} ${type}`);
    }
  }
}
