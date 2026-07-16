import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { INVOICE_PROFILE_LIMIT, type InvoiceType } from "../shared/invoice.ts";
import type { InvoiceProfileInput } from "../shared/invoiceProfileValidation.ts";
import {
  LEGAL_ACCEPTANCE_DOCUMENT_SLUGS,
  LEGAL_DOCUMENT_PAGES,
  LEGAL_EFFECTIVE_DATE,
  LEGAL_PUBLIC_VERSION,
  LEGAL_SOURCE_VERSION,
} from "../shared/legalPolicy.ts";
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
  invoiceJson?: string | null;
  cancellationPolicyJson?: string | null;
  fileRetentionJson?: string | null;
  companySnapshotJson?: string | null;
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

export type CustomerInvoiceProfileRecord = InvoiceProfileInput & {
  id: number;
  customerId: number;
  invoiceType: Extract<InvoiceType, "ordinary" | "special">;
  registeredAddress: string | null;
  registeredPhone: string | null;
  bankName: string | null;
  bankAccount: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type LegalDocumentRecord = {
  id: number;
  slug: string;
  title: string;
  sourceVersion: string | null;
  currentVersion: string;
  createdAt: string;
  updatedAt: string;
};

export type LegalDocumentVersionRecord = {
  id: number;
  documentId: number;
  slug: string;
  version: string;
  title: string;
  contentJson: string;
  contentSha256: string;
  effectiveDate: string;
  createdAt: string;
};

export type UserLegalAcceptanceInput = {
  documentSlug: string;
  version: string;
  contentSha256: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type UserLegalAcceptanceRecord = UserLegalAcceptanceInput & {
  id: number;
  customerId: number;
  acceptedAt: string;
  createdAt: string;
};

export type OrderRiskAcceptanceInput = {
  orderId: number;
  customerId: number | null;
  version: string;
  contentJson: string;
  contentSha256: string;
  ipAddress?: string | null;
  userAgent?: string | null;
};

export type OrderRiskAcceptanceRecord = OrderRiskAcceptanceInput & {
  id: number;
  acceptedAt: string;
  createdAt: string;
};

export type OrderEvidenceSnapshotInput = {
  orderId: number;
  customerId: number | null;
  snapshotJson: string;
  snapshotSha256: string;
  invoiceJson?: string | null;
  cancellationPolicyJson?: string | null;
  fileRetentionJson?: string | null;
  companySnapshotJson?: string | null;
};

export type OrderEvidenceSnapshotRecord = OrderEvidenceSnapshotInput & {
  id: number;
  createdAt: string;
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
  appId: string | null;
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

export const LOCAL_FILE_SYNC_STATUSES = [
  "pending",
  "locked",
  "downloaded",
  "verified",
  "local_synced",
  "failed",
] as const;

export type LocalFileSyncStatus = (typeof LOCAL_FILE_SYNC_STATUSES)[number];

export type LocalFileSyncJobRecord = {
  id: number;
  fileId: number;
  orderId: number;
  customerId: number | null;
  orderNo: string;
  sourceType: string;
  sourceVersion: string;
  originalFilename: string;
  storedFilename: string;
  relativePath: string;
  fileSizeBytes: number;
  sha256: string | null;
  syncStatus: LocalFileSyncStatus;
  attemptCount: number;
  workerId: string | null;
  lockedAt: string | null;
  localPath: string | null;
  localSha256: string | null;
  localSyncedAt: string | null;
  lastError: string | null;
  schemaVersion: number;
  workerVersion: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LocalFileSyncJobWithFileRecord = LocalFileSyncJobRecord & {
  sourceFilepath: string;
  sourceFilename: string;
  sourceFilesize: number;
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
  invoiceJson: string | null;
  cancellationPolicyJson: string | null;
  fileRetentionJson: string | null;
  companySnapshotJson: string | null;
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
  customerId: number | null;
  paymentNo: string | null;
  paymentMethod: string;
  provider: string | null;
  method: string | null;
  scenario: string | null;
  expectedAmountCents: number;
  paidAmountCents: number;
  paidAt: string;
  payerName: string | null;
  payerReference: string | null;
  platformTradeNo: string | null;
  paymentNote: string | null;
  paymentDifferenceReason: string | null;
  status: string | null;
  outTradeNo: string | null;
  providerTransactionId: string | null;
  providerTradeState: string | null;
  providerPayerBindingId: string | null;
  prepayId: string | null;
  codeUrl: string | null;
  codeUrlExpiresAt: string | null;
  requestId: string | null;
  idempotencyKey: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  expiresAt: string | null;
  closedAt: string | null;
  updatedAt: string | null;
  refundedAmountCents: number | null;
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

    CREATE TABLE IF NOT EXISTS customer_invoice_profiles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      invoice_type TEXT NOT NULL,
      title TEXT NOT NULL,
      taxpayer_id TEXT NOT NULL,
      registered_address TEXT,
      registered_phone TEXT,
      bank_name TEXT,
      bank_account TEXT,
      receiver_contact TEXT NOT NULL,
      is_default INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      CHECK (invoice_type IN ('ordinary', 'special'))
    );

    CREATE TABLE IF NOT EXISTS legal_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      source_version TEXT,
      current_version TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS legal_document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      slug TEXT NOT NULL,
      version TEXT NOT NULL,
      title TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      effective_date TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (document_id) REFERENCES legal_documents(id) ON DELETE CASCADE,
      UNIQUE(slug, version)
    );

    CREATE TABLE IF NOT EXISTS user_legal_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      document_slug TEXT NOT NULL,
      version TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      accepted_at DATETIME NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      UNIQUE(customer_id, document_slug, version)
    );

    CREATE TABLE IF NOT EXISTS order_risk_acceptances (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER,
      version TEXT NOT NULL,
      content_json TEXT NOT NULL,
      content_sha256 TEXT NOT NULL,
      accepted_at DATETIME NOT NULL,
      ip_address TEXT,
      user_agent TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS order_evidence_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL UNIQUE,
      customer_id INTEGER,
      snapshot_json TEXT NOT NULL,
      snapshot_sha256 TEXT NOT NULL,
      invoice_json TEXT,
      cancellation_policy_json TEXT,
      file_retention_json TEXT,
      company_snapshot_json TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL
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
      payment_no TEXT,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      payment_method TEXT NOT NULL,
      provider TEXT,
      method TEXT,
      scenario TEXT,
      expected_amount_cents INTEGER NOT NULL,
      paid_amount_cents INTEGER NOT NULL,
      paid_at DATETIME NOT NULL,
      payer_name TEXT,
      payer_reference TEXT,
      platform_trade_no TEXT,
      payment_note TEXT,
      payment_difference_reason TEXT,
      status TEXT,
      out_trade_no TEXT,
      provider_transaction_id TEXT,
      provider_trade_state TEXT,
      provider_payer_binding_id TEXT,
      prepay_id TEXT,
      code_url TEXT,
      code_url_expires_at DATETIME,
      request_id TEXT,
      idempotency_key TEXT,
      failure_code TEXT,
      failure_message TEXT,
      expires_at DATETIME,
      closed_at DATETIME,
      updated_at DATETIME,
      refunded_amount_cents INTEGER NOT NULL DEFAULT 0,
      refund_status TEXT NOT NULL DEFAULT 'none',
      refund_amount_cents INTEGER,
      refund_note TEXT,
      confirmed_by TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wechat_payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER,
      order_id INTEGER,
      event_type TEXT NOT NULL,
      request_id TEXT,
      wechatpay_serial TEXT,
      body_hash TEXT,
      processing_status TEXT NOT NULL,
      error_code TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES order_payments(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wechat_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_no TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      out_refund_no TEXT NOT NULL UNIQUE,
      provider_refund_id TEXT,
      request_id TEXT,
      failure_code TEXT,
      failure_message TEXT,
      created_by_admin_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      success_at DATETIME,
      updated_at DATETIME,
      FOREIGN KEY (payment_id) REFERENCES order_payments(id) ON DELETE CASCADE,
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
      app_id TEXT,
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

    CREATE TABLE IF NOT EXISTS local_file_sync_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL UNIQUE,
      order_id INTEGER NOT NULL,
      customer_id INTEGER,
      order_no TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'order_file',
      source_version TEXT NOT NULL DEFAULT 'upload_v1',
      original_filename TEXT NOT NULL,
      stored_filename TEXT NOT NULL,
      relative_path TEXT NOT NULL,
      file_size_bytes INTEGER NOT NULL,
      sha256 TEXT,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      worker_id TEXT,
      locked_at DATETIME,
      local_path TEXT,
      local_sha256 TEXT,
      local_synced_at DATETIME,
      last_error TEXT,
      schema_version INTEGER NOT NULL DEFAULT 1,
      worker_version TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL,
      CHECK (source_type IN ('order_file')),
      CHECK (sync_status IN ('pending', 'locked', 'downloaded', 'verified', 'local_synced', 'failed')),
      CHECK (attempt_count >= 0)
    );

    CREATE TABLE IF NOT EXISTS slicing_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_id INTEGER NOT NULL,
      file_sync_job_id INTEGER NOT NULL,
      source_slicing_job_id INTEGER,
      customer_id_snapshot INTEGER,
      order_id_snapshot INTEGER,
      order_no_snapshot TEXT,
      input_worker_id TEXT NOT NULL,
      artifact_worker_id TEXT,
      worker_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      attempt_count INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      lock_owner TEXT,
      locked_at_ms INTEGER,
      lock_expires_at_ms INTEGER,
      lease_expires_at_ms INTEGER,
      lease_renewed_at_ms INTEGER,
      started_at_ms INTEGER,
      finished_at_ms INTEGER,
      failed_at_ms INTEGER,
      slicer_name TEXT NOT NULL DEFAULT 'PrusaSlicer',
      required_slicer_package_version TEXT NOT NULL,
      actual_slicer_package_version TEXT,
      slicer_banner_version TEXT,
      binary_path TEXT,
      profile_key TEXT NOT NULL,
      profile_name TEXT,
      profile_version TEXT NOT NULL,
      profile_path TEXT,
      profile_sha256 TEXT NOT NULL,
      slice_params_json TEXT NOT NULL,
      slice_params_sha256 TEXT NOT NULL,
      slice_cache_key_version TEXT NOT NULL DEFAULT '1.0',
      slice_cache_key_sha256 TEXT NOT NULL,
      input_filename TEXT NOT NULL,
      input_relative_path TEXT NOT NULL,
      input_size_bytes INTEGER NOT NULL,
      input_sha256 TEXT NOT NULL,
      result_origin TEXT NOT NULL DEFAULT 'executed',
      cache_reused_at_ms INTEGER,
      slice_duration_ms INTEGER,
      exit_code INTEGER,
      stdout_relative_path TEXT,
      stderr_relative_path TEXT,
      gcode_relative_path TEXT,
      gcode_size_bytes INTEGER,
      gcode_sha256 TEXT,
      required_parser_version TEXT NOT NULL,
      actual_parser_version TEXT,
      parse_cache_key_version TEXT,
      parse_cache_key_sha256 TEXT,
      parse_status TEXT,
      metrics_status TEXT,
      parser_quote_ready INTEGER NOT NULL DEFAULT 0,
      print_time_seconds INTEGER,
      silent_print_time_seconds INTEGER,
      filament_length_microns INTEGER,
      filament_volume_mm3 INTEGER,
      filament_weight_mg INTEGER,
      layer_count INTEGER,
      max_layer_z_microns INTEGER,
      filament_type TEXT,
      printer_model TEXT,
      nozzle_diameter_microns INTEGER,
      layer_height_microns INTEGER,
      metric_sources_json TEXT,
      metric_validation_json TEXT,
      missing_fields_json TEXT,
      warnings_json TEXT,
      weight_source TEXT,
      weight_policy_version TEXT,
      derived_weight_mg INTEGER,
      retention_status TEXT NOT NULL DEFAULT 'active',
      retention_until DATETIME,
      deleted_at DATETIME,
      last_error_code TEXT,
      last_error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE RESTRICT,
      FOREIGN KEY (file_sync_job_id) REFERENCES local_file_sync_jobs(id) ON DELETE RESTRICT,
      FOREIGN KEY (source_slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,
      CHECK (status IN ('pending', 'locked', 'slicing', 'sliced', 'parsing', 'completed', 'partial', 'failed', 'cancelled')),
      CHECK (attempt_count >= 0),
      CHECK (max_attempts >= 1),
      CHECK (parser_quote_ready IN (0, 1)),
      CHECK (input_size_bytes > 0),
      CHECK (locked_at_ms IS NULL OR locked_at_ms >= 0),
      CHECK (lock_expires_at_ms IS NULL OR lock_expires_at_ms >= 0),
      CHECK (lease_expires_at_ms IS NULL OR lease_expires_at_ms >= 0),
      CHECK (lease_renewed_at_ms IS NULL OR lease_renewed_at_ms >= 0),
      CHECK (started_at_ms IS NULL OR started_at_ms >= 0),
      CHECK (finished_at_ms IS NULL OR finished_at_ms >= 0),
      CHECK (failed_at_ms IS NULL OR failed_at_ms >= 0),
      CHECK (cache_reused_at_ms IS NULL OR cache_reused_at_ms >= 0),
      CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
      CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0),
      CHECK (print_time_seconds IS NULL OR print_time_seconds >= 0),
      CHECK (silent_print_time_seconds IS NULL OR silent_print_time_seconds >= 0),
      CHECK (filament_length_microns IS NULL OR filament_length_microns >= 0),
      CHECK (filament_volume_mm3 IS NULL OR filament_volume_mm3 >= 0),
      CHECK (filament_weight_mg IS NULL OR filament_weight_mg >= 0),
      CHECK (derived_weight_mg IS NULL OR derived_weight_mg >= 0),
      CHECK (layer_count IS NULL OR layer_count >= 0),
      CHECK (max_layer_z_microns IS NULL OR max_layer_z_microns >= 0),
      CHECK (result_origin IN ('executed', 'metrics_cache')),
      CHECK (retention_status IN ('active', 'retain_until', 'legal_hold', 'deleted')),
      CHECK (metrics_status IS NULL OR metrics_status IN ('valid', 'warning', 'invalid')),
      CHECK (parse_status IS NULL OR parse_status IN ('parsed', 'partial', 'failed')),
      CHECK (result_origin != 'metrics_cache' OR cache_reused_at_ms IS NOT NULL),
      CHECK (result_origin != 'metrics_cache' OR status IN ('completed', 'partial')),
      CHECK (
        result_origin = 'executed'
        OR (
          result_origin = 'metrics_cache'
          AND source_slicing_job_id IS NOT NULL
          AND attempt_count = 0
          AND gcode_relative_path IS NULL
          AND stdout_relative_path IS NULL
          AND stderr_relative_path IS NULL
          AND slice_duration_ms IS NULL
        )
      )
    );

    CREATE TABLE IF NOT EXISTS slicing_job_attempts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slicing_job_id INTEGER NOT NULL,
      attempt_no INTEGER NOT NULL,
      worker_id TEXT NOT NULL,
      lock_owner TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at_ms INTEGER,
      finished_at_ms INTEGER,
      lease_expires_at_ms INTEGER,
      lease_renewed_at_ms INTEGER,
      slice_duration_ms INTEGER,
      exit_code INTEGER,
      stdout_relative_path TEXT,
      stderr_relative_path TEXT,
      gcode_relative_path TEXT,
      gcode_size_bytes INTEGER,
      gcode_sha256 TEXT,
      error_code TEXT,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (slicing_job_id) REFERENCES slicing_jobs(id) ON DELETE RESTRICT,
      UNIQUE (slicing_job_id, attempt_no),
      UNIQUE (lock_owner),
      CHECK (attempt_no >= 1),
      CHECK (status IN ('locked', 'slicing', 'sliced', 'parsing', 'completed', 'partial', 'failed', 'expired')),
      CHECK (started_at_ms IS NULL OR started_at_ms >= 0),
      CHECK (finished_at_ms IS NULL OR finished_at_ms >= 0),
      CHECK (lease_expires_at_ms IS NULL OR lease_expires_at_ms >= 0),
      CHECK (lease_renewed_at_ms IS NULL OR lease_renewed_at_ms >= 0),
      CHECK (slice_duration_ms IS NULL OR slice_duration_ms >= 0),
      CHECK (gcode_size_bytes IS NULL OR gcode_size_bytes > 0)
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
    ["invoice_json", "TEXT"],
    ["cancellation_policy_json", "TEXT"],
    ["file_retention_json", "TEXT"],
    ["company_snapshot_json", "TEXT"],
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
  ensureColumns(db, "customer_invoice_profiles", [
    ["customer_id", "INTEGER"],
    ["invoice_type", "TEXT"],
    ["title", "TEXT"],
    ["taxpayer_id", "TEXT"],
    ["registered_address", "TEXT"],
    ["registered_phone", "TEXT"],
    ["bank_name", "TEXT"],
    ["bank_account", "TEXT"],
    ["receiver_contact", "TEXT"],
    ["is_default", "INTEGER NOT NULL DEFAULT 0"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_customer_invoice_profiles_customer ON customer_invoice_profiles(customer_id, updated_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_customer_invoice_profiles_default ON customer_invoice_profiles(customer_id) WHERE is_default = 1;
  `);
  ensureColumns(db, "legal_documents", [
    ["slug", "TEXT"],
    ["title", "TEXT"],
    ["source_version", "TEXT"],
    ["current_version", "TEXT"],
    ["created_at", "DATETIME"],
    ["updated_at", "DATETIME"],
  ]);
  ensureColumns(db, "legal_document_versions", [
    ["document_id", "INTEGER"],
    ["slug", "TEXT"],
    ["version", "TEXT"],
    ["title", "TEXT"],
    ["content_json", "TEXT"],
    ["content_sha256", "TEXT"],
    ["effective_date", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  ensureColumns(db, "user_legal_acceptances", [
    ["customer_id", "INTEGER"],
    ["document_slug", "TEXT"],
    ["version", "TEXT"],
    ["content_sha256", "TEXT"],
    ["accepted_at", "DATETIME"],
    ["ip_address", "TEXT"],
    ["user_agent", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  ensureColumns(db, "order_risk_acceptances", [
    ["order_id", "INTEGER"],
    ["customer_id", "INTEGER"],
    ["version", "TEXT"],
    ["content_json", "TEXT"],
    ["content_sha256", "TEXT"],
    ["accepted_at", "DATETIME"],
    ["ip_address", "TEXT"],
    ["user_agent", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  ensureColumns(db, "order_evidence_snapshots", [
    ["order_id", "INTEGER"],
    ["customer_id", "INTEGER"],
    ["snapshot_json", "TEXT"],
    ["snapshot_sha256", "TEXT"],
    ["invoice_json", "TEXT"],
    ["cancellation_policy_json", "TEXT"],
    ["file_retention_json", "TEXT"],
    ["company_snapshot_json", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_documents_slug ON legal_documents(slug);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_document_versions_slug_version ON legal_document_versions(slug, version);
    CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_customer ON user_legal_acceptances(customer_id, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_user_legal_acceptances_unique ON user_legal_acceptances(customer_id, document_slug, version);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_risk_acceptances_order ON order_risk_acceptances(order_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_evidence_snapshots_order ON order_evidence_snapshots(order_id);
  `);
  seedLegalDocuments(db);
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
    ["payment_no", "TEXT"],
    ["order_id", "INTEGER"],
    ["customer_id", "INTEGER"],
    ["payment_method", "TEXT"],
    ["provider", "TEXT"],
    ["method", "TEXT"],
    ["scenario", "TEXT"],
    ["expected_amount_cents", "INTEGER"],
    ["paid_amount_cents", "INTEGER"],
    ["paid_at", "DATETIME"],
    ["payer_name", "TEXT"],
    ["payer_reference", "TEXT"],
    ["platform_trade_no", "TEXT"],
    ["payment_note", "TEXT"],
    ["payment_difference_reason", "TEXT"],
    ["status", "TEXT"],
    ["out_trade_no", "TEXT"],
    ["provider_transaction_id", "TEXT"],
    ["provider_trade_state", "TEXT"],
    ["provider_payer_binding_id", "TEXT"],
    ["prepay_id", "TEXT"],
    ["code_url", "TEXT"],
    ["code_url_expires_at", "DATETIME"],
    ["request_id", "TEXT"],
    ["idempotency_key", "TEXT"],
    ["failure_code", "TEXT"],
    ["failure_message", "TEXT"],
    ["expires_at", "DATETIME"],
    ["closed_at", "DATETIME"],
    ["updated_at", "DATETIME"],
    ["refunded_amount_cents", "INTEGER NOT NULL DEFAULT 0"],
    ["refund_status", "TEXT NOT NULL DEFAULT 'none'"],
    ["refund_amount_cents", "INTEGER"],
    ["refund_note", "TEXT"],
    ["confirmed_by", "TEXT"],
    ["created_at", "DATETIME"],
  ]);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_order_payments_order ON order_payments(order_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_order_payments_status ON order_payments(provider, status, expires_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_payment_no_unique ON order_payments(payment_no) WHERE payment_no IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_out_trade_no_unique ON order_payments(out_trade_no) WHERE out_trade_no IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_transaction_unique ON order_payments(provider_transaction_id) WHERE provider_transaction_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_order_payments_idempotency_unique ON order_payments(idempotency_key) WHERE idempotency_key IS NOT NULL;
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS wechat_payment_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id INTEGER,
      order_id INTEGER,
      event_type TEXT NOT NULL,
      request_id TEXT,
      wechatpay_serial TEXT,
      body_hash TEXT,
      processing_status TEXT NOT NULL,
      error_code TEXT,
      retry_count INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (payment_id) REFERENCES order_payments(id) ON DELETE SET NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS wechat_refunds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      refund_no TEXT NOT NULL UNIQUE,
      payment_id INTEGER NOT NULL,
      order_id INTEGER NOT NULL,
      amount_cents INTEGER NOT NULL,
      reason TEXT NOT NULL,
      status TEXT NOT NULL,
      out_refund_no TEXT NOT NULL UNIQUE,
      provider_refund_id TEXT,
      request_id TEXT,
      failure_code TEXT,
      failure_message TEXT,
      created_by_admin_id TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      success_at DATETIME,
      updated_at DATETIME,
      FOREIGN KEY (payment_id) REFERENCES order_payments(id) ON DELETE CASCADE,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wechat_payment_events_payment ON wechat_payment_events(payment_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_wechat_refunds_payment ON wechat_refunds(payment_id, created_at DESC);
  `);
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
    ["app_id", "TEXT"],
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
  ensureColumns(db, "local_file_sync_jobs", [
    ["source_version", "TEXT NOT NULL DEFAULT 'upload_v1'"],
    ["schema_version", "INTEGER NOT NULL DEFAULT 1"],
    ["worker_version", "TEXT"],
  ]);
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_local_file_sync_jobs_file
      ON local_file_sync_jobs(file_id);
    CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_pickup
      ON local_file_sync_jobs(sync_status, locked_at, attempt_count, created_at);
    CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_order
      ON local_file_sync_jobs(order_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_worker
      ON local_file_sync_jobs(worker_id, locked_at);
    CREATE INDEX IF NOT EXISTS idx_local_file_sync_jobs_synced
      ON local_file_sync_jobs(local_synced_at);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_pickup
      ON slicing_jobs(status, input_worker_id, lease_expires_at_ms, lock_expires_at_ms, attempt_count, created_at);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file
      ON slicing_jobs(file_id, created_at);
    DROP INDEX IF EXISTS idx_slicing_jobs_file_sync_unique;
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_file_sync
      ON slicing_jobs(file_sync_job_id, created_at);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_active_identity_unique
      ON slicing_jobs(file_sync_job_id, slice_cache_key_sha256, required_parser_version)
      WHERE status IN ('pending', 'locked', 'slicing', 'sliced', 'parsing');
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_order_snapshot
      ON slicing_jobs(order_id_snapshot, created_at);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_worker
      ON slicing_jobs(worker_id, status, locked_at_ms);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_slice_cache
      ON slicing_jobs(slice_cache_key_sha256, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_parse_cache
      ON slicing_jobs(parse_cache_key_sha256, required_parser_version, status, created_at);
    CREATE INDEX IF NOT EXISTS idx_slicing_jobs_reusable_metrics
      ON slicing_jobs(slice_cache_key_sha256, status, parser_quote_ready, created_at)
      WHERE status IN ('completed', 'partial');
    CREATE UNIQUE INDEX IF NOT EXISTS idx_slicing_jobs_active_lock_owner
      ON slicing_jobs(lock_owner)
      WHERE lock_owner IS NOT NULL
        AND status IN ('locked', 'slicing', 'sliced', 'parsing');
    CREATE INDEX IF NOT EXISTS idx_slicing_job_attempts_job
      ON slicing_job_attempts(slicing_job_id, attempt_no);
    CREATE INDEX IF NOT EXISTS idx_slicing_job_attempts_worker
      ON slicing_job_attempts(worker_id, status, created_at);
  `);
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

export function listCustomerInvoiceProfiles(
  db: DatabaseSync,
  customerId: number,
): CustomerInvoiceProfileRecord[] {
  return db
    .prepare(
      customerInvoiceProfileSelectSql(
        "WHERE customer_id = ? ORDER BY is_default DESC, updated_at DESC, id DESC",
      ),
    )
    .all(customerId)
    .map(normalizeCustomerInvoiceProfileRecord) as CustomerInvoiceProfileRecord[];
}

export function getCustomerInvoiceProfileByIdForCustomer(
  db: DatabaseSync,
  customerId: number,
  profileId: number,
): CustomerInvoiceProfileRecord {
  const profile = db
    .prepare(customerInvoiceProfileSelectSql("WHERE id = ? AND customer_id = ?"))
    .get(profileId, customerId);

  if (!profile) {
    throw new Error("发票资料不存在");
  }

  return normalizeCustomerInvoiceProfileRecord(profile) as CustomerInvoiceProfileRecord;
}

export function createCustomerInvoiceProfile(
  db: DatabaseSync,
  customerId: number,
  input: InvoiceProfileInput & { isDefault?: boolean },
): CustomerInvoiceProfileRecord {
  const count = getCustomerInvoiceProfileCount(db, customerId);

  if (count >= INVOICE_PROFILE_LIMIT) {
    throw new Error(`每个客户最多保存 ${INVOICE_PROFILE_LIMIT} 条发票资料`);
  }

  const normalized = normalizeCustomerInvoiceProfileInput(input);
  const shouldDefault = count === 0 || Boolean(input.isDefault);
  const now = getBeijingTimestamp();

  try {
    db.exec("BEGIN");
    if (shouldDefault) {
      clearCustomerDefaultInvoiceProfile(db, customerId);
    }

    const result = db
      .prepare(
        `INSERT INTO customer_invoice_profiles (
          customer_id,
          invoice_type,
          title,
          taxpayer_id,
          registered_address,
          registered_phone,
          bank_name,
          bank_account,
          receiver_contact,
          is_default,
          created_at,
          updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        customerId,
        normalized.invoiceType,
        normalized.title,
        normalized.taxpayerId,
        normalized.registeredAddress ?? null,
        normalized.registeredPhone ?? null,
        normalized.bankName ?? null,
        normalized.bankAccount ?? null,
        normalized.receiverContact,
        shouldDefault ? 1 : 0,
        now,
        now,
      );

    db.exec("COMMIT");
    return getCustomerInvoiceProfileByIdForCustomer(db, customerId, Number(result.lastInsertRowid));
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function updateCustomerInvoiceProfile(
  db: DatabaseSync,
  customerId: number,
  profileId: number,
  input: InvoiceProfileInput & { isDefault?: boolean },
): CustomerInvoiceProfileRecord {
  getCustomerInvoiceProfileByIdForCustomer(db, customerId, profileId);
  const normalized = normalizeCustomerInvoiceProfileInput(input);
  const now = getBeijingTimestamp();

  try {
    db.exec("BEGIN");
    if (input.isDefault) {
      clearCustomerDefaultInvoiceProfile(db, customerId);
    }

    db
      .prepare(
        `UPDATE customer_invoice_profiles
         SET invoice_type = ?,
             title = ?,
             taxpayer_id = ?,
             registered_address = ?,
             registered_phone = ?,
             bank_name = ?,
             bank_account = ?,
             receiver_contact = ?,
             is_default = CASE WHEN ? THEN 1 ELSE is_default END,
             updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
      .run(
        normalized.invoiceType,
        normalized.title,
        normalized.taxpayerId,
        normalized.registeredAddress ?? null,
        normalized.registeredPhone ?? null,
        normalized.bankName ?? null,
        normalized.bankAccount ?? null,
        normalized.receiverContact,
        input.isDefault ? 1 : 0,
        now,
        profileId,
        customerId,
      );

    ensureCustomerHasDefaultInvoiceProfile(db, customerId);
    db.exec("COMMIT");
    return getCustomerInvoiceProfileByIdForCustomer(db, customerId, profileId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function deleteCustomerInvoiceProfile(db: DatabaseSync, customerId: number, profileId: number) {
  const profile = getCustomerInvoiceProfileByIdForCustomer(db, customerId, profileId);

  try {
    db.exec("BEGIN");
    db.prepare("DELETE FROM customer_invoice_profiles WHERE id = ? AND customer_id = ?").run(profileId, customerId);

    if (profile.isDefault) {
      ensureCustomerHasDefaultInvoiceProfile(db, customerId);
    }

    db.exec("COMMIT");
    return true;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function setCustomerDefaultInvoiceProfile(
  db: DatabaseSync,
  customerId: number,
  profileId: number,
): CustomerInvoiceProfileRecord {
  getCustomerInvoiceProfileByIdForCustomer(db, customerId, profileId);

  try {
    db.exec("BEGIN");
    clearCustomerDefaultInvoiceProfile(db, customerId);
    db
      .prepare(
        `UPDATE customer_invoice_profiles
         SET is_default = 1,
             updated_at = ?
         WHERE id = ? AND customer_id = ?`,
      )
      .run(getBeijingTimestamp(), profileId, customerId);
    db.exec("COMMIT");
    return getCustomerInvoiceProfileByIdForCustomer(db, customerId, profileId);
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

function getCustomerInvoiceProfileCount(db: DatabaseSync, customerId: number) {
  const row = db
    .prepare("SELECT COUNT(*) AS count FROM customer_invoice_profiles WHERE customer_id = ?")
    .get(customerId) as { count?: number } | undefined;

  return row?.count || 0;
}

function clearCustomerDefaultInvoiceProfile(db: DatabaseSync, customerId: number) {
  db.prepare("UPDATE customer_invoice_profiles SET is_default = 0 WHERE customer_id = ?").run(customerId);
}

function ensureCustomerHasDefaultInvoiceProfile(db: DatabaseSync, customerId: number) {
  const defaultProfile = db
    .prepare("SELECT id FROM customer_invoice_profiles WHERE customer_id = ? AND is_default = 1 LIMIT 1")
    .get(customerId);

  if (defaultProfile) {
    return;
  }

  const latest = db
    .prepare(
      `SELECT id
       FROM customer_invoice_profiles
       WHERE customer_id = ?
       ORDER BY updated_at DESC, id DESC
       LIMIT 1`,
    )
    .get(customerId) as { id?: number } | undefined;

  if (latest?.id) {
    db.prepare("UPDATE customer_invoice_profiles SET is_default = 1 WHERE id = ?").run(latest.id);
  }
}

function normalizeCustomerInvoiceProfileInput(
  input: InvoiceProfileInput & { isDefault?: boolean },
): InvoiceProfileInput & { isDefault?: boolean } {
  return {
    invoiceType: input.invoiceType,
    title: input.title.trim(),
    taxpayerId: input.taxpayerId.trim(),
    registeredAddress: input.invoiceType === "special" ? input.registeredAddress?.trim() || null : null,
    registeredPhone: input.invoiceType === "special" ? input.registeredPhone?.trim() || null : null,
    bankName: input.invoiceType === "special" ? input.bankName?.trim() || null : null,
    bankAccount: input.invoiceType === "special" ? input.bankAccount?.trim() || null : null,
    receiverContact: input.receiverContact.trim(),
    isDefault: Boolean(input.isDefault),
  };
}

export function getLegalDocumentVersion(
  db: DatabaseSync,
  slug: string,
  version = LEGAL_PUBLIC_VERSION,
): LegalDocumentVersionRecord {
  const record = db
    .prepare(legalDocumentVersionSelectSql("WHERE slug = ? AND version = ?"))
    .get(slug, version) as LegalDocumentVersionRecord | undefined;

  if (!record) {
    throw new Error(`Legal document version not found: ${slug}@${version}`);
  }

  return record;
}

export function recordRequiredUserLegalAcceptances(
  db: DatabaseSync,
  customerId: number,
  input: { ipAddress?: string | null; userAgent?: string | null } = {},
) {
  return LEGAL_ACCEPTANCE_DOCUMENT_SLUGS.map((slug) => {
    const version = getLegalDocumentVersion(db, slug);
    return recordUserLegalAcceptance(db, customerId, {
      documentSlug: slug,
      version: version.version,
      contentSha256: version.contentSha256,
      ipAddress: input.ipAddress,
      userAgent: input.userAgent,
    });
  });
}

export function recordUserLegalAcceptance(
  db: DatabaseSync,
  customerId: number,
  input: UserLegalAcceptanceInput,
): UserLegalAcceptanceRecord {
  const acceptedAt = getBeijingTimestamp();
  db.prepare(
    `INSERT OR IGNORE INTO user_legal_acceptances (
      customer_id,
      document_slug,
      version,
      content_sha256,
      accepted_at,
      ip_address,
      user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    customerId,
    input.documentSlug,
    input.version,
    input.contentSha256,
    acceptedAt,
    input.ipAddress || null,
    input.userAgent || null,
  );

  return db
    .prepare(userLegalAcceptanceSelectSql("WHERE customer_id = ? AND document_slug = ? AND version = ?"))
    .get(customerId, input.documentSlug, input.version) as UserLegalAcceptanceRecord;
}

export function createOrderRiskAcceptance(
  db: DatabaseSync,
  input: OrderRiskAcceptanceInput,
): OrderRiskAcceptanceRecord {
  const acceptedAt = getBeijingTimestamp();
  db.prepare(
    `INSERT OR IGNORE INTO order_risk_acceptances (
      order_id,
      customer_id,
      version,
      content_json,
      content_sha256,
      accepted_at,
      ip_address,
      user_agent
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.orderId,
    input.customerId,
    input.version,
    input.contentJson,
    input.contentSha256,
    acceptedAt,
    input.ipAddress || null,
    input.userAgent || null,
  );

  const acceptance = getOrderRiskAcceptanceByOrderId(db, input.orderId);
  if (!acceptance) {
    throw new Error("Order risk acceptance was not created");
  }
  return acceptance;
}

export function getOrderRiskAcceptanceByOrderId(
  db: DatabaseSync,
  orderId: number,
): OrderRiskAcceptanceRecord | null {
  return (
    (db
      .prepare(orderRiskAcceptanceSelectSql("WHERE order_id = ?"))
      .get(orderId) as OrderRiskAcceptanceRecord | undefined) || null
  );
}

export function createOrderEvidenceSnapshot(
  db: DatabaseSync,
  input: OrderEvidenceSnapshotInput,
): OrderEvidenceSnapshotRecord {
  db.prepare(
    `INSERT OR IGNORE INTO order_evidence_snapshots (
      order_id,
      customer_id,
      snapshot_json,
      snapshot_sha256,
      invoice_json,
      cancellation_policy_json,
      file_retention_json,
      company_snapshot_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    input.orderId,
    input.customerId,
    input.snapshotJson,
    input.snapshotSha256,
    input.invoiceJson || null,
    input.cancellationPolicyJson || null,
    input.fileRetentionJson || null,
    input.companySnapshotJson || null,
  );

  const snapshot = getOrderEvidenceSnapshotByOrderId(db, input.orderId);
  if (!snapshot) {
    throw new Error("Order evidence snapshot was not created");
  }
  return snapshot;
}

export function getOrderEvidenceSnapshotByOrderId(
  db: DatabaseSync,
  orderId: number,
): OrderEvidenceSnapshotRecord | null {
  return (
    (db
      .prepare(orderEvidenceSnapshotSelectSql("WHERE order_id = ?"))
      .get(orderId) as OrderEvidenceSnapshotRecord | undefined) || null
  );
}

export function createContentSha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
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
          invoice_json,
          cancellation_policy_json,
          file_retention_json,
          company_snapshot_json,
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
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        input.invoiceJson || null,
        input.cancellationPolicyJson || null,
        input.fileRetentionJson || null,
        input.companySnapshotJson || null,
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
      const insertedFile = insertFile.run(
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
      createLocalFileSyncJobForOrderFile(db, {
        fileId: Number(insertedFile.lastInsertRowid),
        orderId,
        customerId: input.customerId ?? null,
        orderNo,
        originalFilename: file.filename,
        storedFilename: file.filename,
        relativePath: file.filename,
        fileSizeBytes: file.filesize,
        sourceVersion: "upload_v1",
      });
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

export function listPendingLocalFileSyncJobs(
  db: DatabaseSync,
  options: {
    limit?: number;
    maxAttempts?: number;
    lockTimeoutMinutes?: number;
  } = {},
): LocalFileSyncJobRecord[] {
  const limit = Math.max(1, Math.min(options.limit ?? 20, 100));
  const maxAttempts = Math.max(1, options.maxAttempts ?? 5);
  const lockTimeoutMinutes = Math.max(1, options.lockTimeoutMinutes ?? 15);

  return db
    .prepare(
      localFileSyncJobSelectSql(
        `WHERE sync_status = 'pending'
            OR (
              sync_status = 'locked'
              AND locked_at < datetime('now', ?)
            )
            OR (
              sync_status = 'failed'
              AND attempt_count < ?
            )
         ORDER BY created_at ASC, id ASC
         LIMIT ?`,
      ),
    )
    .all(`-${lockTimeoutMinutes} minutes`, maxAttempts, limit)
    .map(normalizeLocalFileSyncJobRecord) as LocalFileSyncJobRecord[];
}

export function getLocalFileSyncJobById(
  db: DatabaseSync,
  id: number,
): LocalFileSyncJobRecord {
  const job = db
    .prepare(localFileSyncJobSelectSql("WHERE id = ?"))
    .get(id);

  if (!job) {
    throw new Error("同步任务不存在");
  }

  return normalizeLocalFileSyncJobRecord(job);
}

export function getLocalFileSyncJobWithFileById(
  db: DatabaseSync,
  id: number,
): LocalFileSyncJobWithFileRecord {
  const job = db
    .prepare(
      `SELECT
        local_file_sync_jobs.id,
        local_file_sync_jobs.file_id AS fileId,
        local_file_sync_jobs.order_id AS orderId,
        local_file_sync_jobs.customer_id AS customerId,
        local_file_sync_jobs.order_no AS orderNo,
        local_file_sync_jobs.source_type AS sourceType,
        local_file_sync_jobs.source_version AS sourceVersion,
        local_file_sync_jobs.original_filename AS originalFilename,
        local_file_sync_jobs.stored_filename AS storedFilename,
        local_file_sync_jobs.relative_path AS relativePath,
        local_file_sync_jobs.file_size_bytes AS fileSizeBytes,
        local_file_sync_jobs.sha256,
        local_file_sync_jobs.sync_status AS syncStatus,
        local_file_sync_jobs.attempt_count AS attemptCount,
        local_file_sync_jobs.worker_id AS workerId,
        local_file_sync_jobs.locked_at AS lockedAt,
        local_file_sync_jobs.local_path AS localPath,
        local_file_sync_jobs.local_sha256 AS localSha256,
        local_file_sync_jobs.local_synced_at AS localSyncedAt,
        local_file_sync_jobs.last_error AS lastError,
        local_file_sync_jobs.schema_version AS schemaVersion,
        local_file_sync_jobs.worker_version AS workerVersion,
        local_file_sync_jobs.created_at AS createdAt,
        local_file_sync_jobs.updated_at AS updatedAt,
        files.filepath AS sourceFilepath,
        files.filename AS sourceFilename,
        files.filesize AS sourceFilesize
      FROM local_file_sync_jobs
      JOIN files ON files.id = local_file_sync_jobs.file_id
      WHERE local_file_sync_jobs.id = ?`,
    )
    .get(id);

  if (!job) {
    throw new Error("同步任务不存在");
  }

  return normalizeLocalFileSyncJobRecord(job) as LocalFileSyncJobWithFileRecord;
}

export function updateLocalFileSyncJobSha256(
  db: DatabaseSync,
  id: number,
  sha256: string,
) {
  db.prepare(
    `UPDATE local_file_sync_jobs
     SET sha256 = ?,
         updated_at = ?
     WHERE id = ?`,
  ).run(sha256, getBeijingTimestamp(), id);
}

export function lockLocalFileSyncJob(
  db: DatabaseSync,
  input: {
    id: number;
    workerId: string;
    workerVersion?: string | null;
    maxAttempts?: number;
    lockTimeoutMinutes?: number;
  },
): LocalFileSyncJobRecord | null {
  const maxAttempts = Math.max(1, input.maxAttempts ?? 5);
  const lockTimeoutMinutes = Math.max(1, input.lockTimeoutMinutes ?? 15);
  const timestamp = getBeijingTimestamp();
  const result = db
    .prepare(
      `UPDATE local_file_sync_jobs
       SET sync_status = 'locked',
           worker_id = ?,
           worker_version = ?,
           locked_at = ?,
           attempt_count = attempt_count + 1,
           last_error = NULL,
           updated_at = ?
       WHERE id = ?
         AND (
           sync_status = 'pending'
           OR (
             sync_status = 'locked'
             AND locked_at < datetime('now', ?)
           )
           OR (
             sync_status = 'failed'
             AND attempt_count < ?
           )
         )`,
    )
    .run(
      input.workerId,
      normalizeOptionalText(input.workerVersion),
      timestamp,
      timestamp,
      input.id,
      `-${lockTimeoutMinutes} minutes`,
      maxAttempts,
    );

  if (result.changes !== 1) {
    return null;
  }

  return getLocalFileSyncJobById(db, input.id);
}

export function markLocalFileSyncJobDownloaded(
  db: DatabaseSync,
  id: number,
  workerId: string,
) {
  const result = db.prepare(
    `UPDATE local_file_sync_jobs
     SET sync_status = 'downloaded',
         updated_at = ?
     WHERE id = ?
       AND worker_id = ?
       AND sync_status = 'locked'`,
  ).run(getBeijingTimestamp(), id, workerId);

  return result.changes === 1;
}

export function markLocalFileSyncJobVerified(
  db: DatabaseSync,
  input: {
    id: number;
    workerId: string;
    localPath: string;
    localSha256: string;
  },
) {
  const timestamp = getBeijingTimestamp();
  const result = db.prepare(
    `UPDATE local_file_sync_jobs
     SET sync_status = 'verified',
         local_path = ?,
         local_sha256 = ?,
         updated_at = ?
     WHERE id = ?
       AND worker_id = ?
       AND sync_status IN ('locked', 'downloaded')`,
  ).run(input.localPath, input.localSha256, timestamp, input.id, input.workerId);

  return result.changes === 1;
}

export function markLocalFileSyncJobFailed(
  db: DatabaseSync,
  input: {
    id: number;
    workerId?: string | null;
    error: string;
  },
) {
  const timestamp = getBeijingTimestamp();
  const result = input.workerId
    ? db.prepare(
        `UPDATE local_file_sync_jobs
         SET sync_status = 'failed',
             last_error = ?,
             updated_at = ?
         WHERE id = ?
           AND (worker_id = ? OR worker_id IS NULL)`,
      ).run(input.error, timestamp, input.id, input.workerId)
    : db.prepare(
        `UPDATE local_file_sync_jobs
         SET sync_status = 'failed',
             last_error = ?,
             updated_at = ?
         WHERE id = ?`,
      ).run(input.error, timestamp, input.id);

  return result.changes === 1;
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
      app_id,
      bind_code,
      bind_code_expires_at,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(customer_id) DO UPDATE SET
      app_id = excluded.app_id,
      bind_code = excluded.bind_code,
      bind_code_expires_at = excluded.bind_code_expires_at,
      updated_at = CURRENT_TIMESTAMP`,
  ).run(customerId, getCurrentWechatAppId(), bindCode, expiresAt);

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
           app_id = COALESCE(app_id, ?),
           unionid = COALESCE(?, unionid),
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE openid = ?`,
    ).run(input.subscribed ? 1 : 0, getCurrentWechatAppId(), normalizeOptionalText(input.unionid), input.openid);
    return getWechatAccountByOpenid(db, input.openid);
  }

  db.prepare(
    `INSERT INTO wechat_accounts (
      app_id,
      openid,
      unionid,
      subscribed,
      last_message_at,
      updated_at
    ) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
  ).run(getCurrentWechatAppId(), input.openid, normalizeOptionalText(input.unionid), input.subscribed ? 1 : 0);

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
           app_id = ?,
           unionid = COALESCE(?, unionid),
           subscribed = 1,
           bind_code = NULL,
           bind_code_expires_at = NULL,
           last_message_at = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
    ).run(input.openid, getCurrentWechatAppId(), normalizeOptionalText(input.unionid), bindAccount.id);
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
    invoice_json AS invoiceJson,
    cancellation_policy_json AS cancellationPolicyJson,
    file_retention_json AS fileRetentionJson,
    company_snapshot_json AS companySnapshotJson,
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

function customerInvoiceProfileSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    invoice_type AS invoiceType,
    title,
    taxpayer_id AS taxpayerId,
    registered_address AS registeredAddress,
    registered_phone AS registeredPhone,
    bank_name AS bankName,
    bank_account AS bankAccount,
    receiver_contact AS receiverContact,
    is_default AS isDefault,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM customer_invoice_profiles
  ${suffix}`;
}

function legalDocumentVersionSelectSql(suffix: string) {
  return `SELECT
    id,
    document_id AS documentId,
    slug,
    version,
    title,
    content_json AS contentJson,
    content_sha256 AS contentSha256,
    effective_date AS effectiveDate,
    created_at AS createdAt
  FROM legal_document_versions
  ${suffix}`;
}

function userLegalAcceptanceSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    document_slug AS documentSlug,
    version,
    content_sha256 AS contentSha256,
    accepted_at AS acceptedAt,
    ip_address AS ipAddress,
    user_agent AS userAgent,
    created_at AS createdAt
  FROM user_legal_acceptances
  ${suffix}`;
}

function orderRiskAcceptanceSelectSql(suffix: string) {
  return `SELECT
    id,
    order_id AS orderId,
    customer_id AS customerId,
    version,
    content_json AS contentJson,
    content_sha256 AS contentSha256,
    accepted_at AS acceptedAt,
    ip_address AS ipAddress,
    user_agent AS userAgent,
    created_at AS createdAt
  FROM order_risk_acceptances
  ${suffix}`;
}

function orderEvidenceSnapshotSelectSql(suffix: string) {
  return `SELECT
    id,
    order_id AS orderId,
    customer_id AS customerId,
    snapshot_json AS snapshotJson,
    snapshot_sha256 AS snapshotSha256,
    invoice_json AS invoiceJson,
    cancellation_policy_json AS cancellationPolicyJson,
    file_retention_json AS fileRetentionJson,
    company_snapshot_json AS companySnapshotJson,
    created_at AS createdAt
  FROM order_evidence_snapshots
  ${suffix}`;
}

function wechatAccountSelectSql(suffix: string) {
  return `SELECT
    id,
    customer_id AS customerId,
    app_id AS appId,
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
    payment_no AS paymentNo,
    order_id AS orderId,
    customer_id AS customerId,
    payment_method AS paymentMethod,
    provider,
    method,
    scenario,
    expected_amount_cents AS expectedAmountCents,
    paid_amount_cents AS paidAmountCents,
    paid_at AS paidAt,
    payer_name AS payerName,
    payer_reference AS payerReference,
    platform_trade_no AS platformTradeNo,
    payment_note AS paymentNote,
    payment_difference_reason AS paymentDifferenceReason,
    status,
    out_trade_no AS outTradeNo,
    provider_transaction_id AS providerTransactionId,
    provider_trade_state AS providerTradeState,
    provider_payer_binding_id AS providerPayerBindingId,
    prepay_id AS prepayId,
    code_url AS codeUrl,
    code_url_expires_at AS codeUrlExpiresAt,
    request_id AS requestId,
    idempotency_key AS idempotencyKey,
    failure_code AS failureCode,
    failure_message AS failureMessage,
    expires_at AS expiresAt,
    closed_at AS closedAt,
    updated_at AS updatedAt,
    refunded_amount_cents AS refundedAmountCents,
    refund_status AS refundStatus,
    refund_amount_cents AS refundAmountCents,
    refund_note AS refundNote,
    confirmed_by AS confirmedBy,
    created_at AS createdAt
  FROM order_payments
  ${suffix}`;
}

function localFileSyncJobSelectSql(suffix: string) {
  return `SELECT
    id,
    file_id AS fileId,
    order_id AS orderId,
    customer_id AS customerId,
    order_no AS orderNo,
    source_type AS sourceType,
    source_version AS sourceVersion,
    original_filename AS originalFilename,
    stored_filename AS storedFilename,
    relative_path AS relativePath,
    file_size_bytes AS fileSizeBytes,
    sha256,
    sync_status AS syncStatus,
    attempt_count AS attemptCount,
    worker_id AS workerId,
    locked_at AS lockedAt,
    local_path AS localPath,
    local_sha256 AS localSha256,
    local_synced_at AS localSyncedAt,
    last_error AS lastError,
    schema_version AS schemaVersion,
    worker_version AS workerVersion,
    created_at AS createdAt,
    updated_at AS updatedAt
  FROM local_file_sync_jobs
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

function normalizeLocalFileSyncJobRecord(job: unknown) {
  return job as LocalFileSyncJobRecord;
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

function normalizeCustomerInvoiceProfileRecord(profile: unknown) {
  const record = profile as Record<string, unknown> & { isDefault: 0 | 1 | boolean };
  return {
    ...record,
    registeredAddress: (record.registeredAddress as string | null) || null,
    registeredPhone: (record.registeredPhone as string | null) || null,
    bankName: (record.bankName as string | null) || null,
    bankAccount: (record.bankAccount as string | null) || null,
    isDefault: Boolean(record.isDefault),
  } as CustomerInvoiceProfileRecord;
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

function getCurrentWechatAppId() {
  return normalizeOptionalText(process.env.WECHAT_MP_APP_ID || process.env.WECHAT_PAY_APP_ID);
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

function createLocalFileSyncJobForOrderFile(
  db: DatabaseSync,
  input: {
    fileId: number;
    orderId: number;
    customerId: number | null;
    orderNo: string;
    originalFilename: string;
    storedFilename: string;
    relativePath: string;
    fileSizeBytes: number;
    sourceVersion: string;
  },
) {
  db.prepare(
    `INSERT OR IGNORE INTO local_file_sync_jobs (
      file_id,
      order_id,
      customer_id,
      order_no,
      source_type,
      source_version,
      original_filename,
      stored_filename,
      relative_path,
      file_size_bytes,
      sync_status,
      schema_version
    ) VALUES (?, ?, ?, ?, 'order_file', ?, ?, ?, ?, ?, 'pending', 1)`,
  ).run(
    input.fileId,
    input.orderId,
    input.customerId,
    input.orderNo,
    input.sourceVersion,
    input.originalFilename,
    input.storedFilename,
    input.relativePath,
    input.fileSizeBytes,
  );
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

function seedLegalDocuments(db: DatabaseSync) {
  const now = getBeijingTimestamp();

  for (const page of LEGAL_DOCUMENT_PAGES) {
    const contentJson = JSON.stringify({
      slug: page.slug,
      title: page.title,
      version: LEGAL_PUBLIC_VERSION,
      effectiveDate: LEGAL_EFFECTIVE_DATE,
      body: page.body,
    });
    const contentSha256 = createContentSha256(contentJson);

    db.prepare(
      `INSERT INTO legal_documents (
        slug,
        title,
        source_version,
        current_version,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        source_version = excluded.source_version,
        current_version = excluded.current_version,
        updated_at = excluded.updated_at`,
    ).run(page.slug, page.title, LEGAL_SOURCE_VERSION, LEGAL_PUBLIC_VERSION, now, now);

    const document = db
      .prepare("SELECT id FROM legal_documents WHERE slug = ?")
      .get(page.slug) as { id: number } | undefined;

    if (!document) {
      throw new Error(`Legal document seed failed: ${page.slug}`);
    }

    db.prepare(
      `INSERT OR IGNORE INTO legal_document_versions (
        document_id,
        slug,
        version,
        title,
        content_json,
        content_sha256,
        effective_date,
        created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      document.id,
      page.slug,
      LEGAL_PUBLIC_VERSION,
      page.title,
      contentJson,
      contentSha256,
      LEGAL_EFFECTIVE_DATE,
      now,
    );
  }
}
