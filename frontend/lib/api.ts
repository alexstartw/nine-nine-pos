import axios from "axios";

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === "production" ? "" : "http://localhost:8000";

const RAW_API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL
).trim();
const SANITIZED_API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, "");
const IS_ABSOLUTE_BASE = /^https?:\/\//i.test(SANITIZED_API_BASE_URL);

export const apiClient = axios.create({
  baseURL: IS_ABSOLUTE_BASE ? SANITIZED_API_BASE_URL : undefined,
  headers: {
    "Content-Type": "application/json",
  },
});

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  size: number;
}

export interface VendorPayload {
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
}

export interface ProductPayload {
  name: string;
  sku: string;
  vendor_id?: number;
  color?: string;
  size?: string;
  price: number;
  cost: number;
  stock: number;
  description?: string;
  image_url?: string;
}

export interface ProductImportSummary {
  created: number;
  restocked: number;
  errors: string[];
}

export type StockEntryMethod = "single" | "import";

export interface StockEntryRecord {
  id: number;
  product_id: number;
  product_name: string;
  sku: string;
  barcode: string;
  vendor_name?: string | null;
  quantity: number;
  method: StockEntryMethod;
  created_at: string;
  batch_id?: string | null;
}

export interface ProductSummary {
  total_stock: number;
  total_stock_value: number;
}

export interface MemberPayload {
  name: string;
  birthday?: string | null;
  joined_date?: string | null;
  phone?: string | null;
  note?: string | null;
}

export interface Member extends MemberPayload {
  member_code: string;
  birthday?: string | null;
  joined_date?: string | null;
  id: number;
  created_at: string;
  updated_at: string;
}

export type PaymentMethod = "cash" | "transfer" | "mobile";

export interface PosProduct {
  id: number;
  name: string;
  barcode: string;
  price: number;
  cost: number;
  stock: number;
}

export interface PosMemberInfo {
  id: number;
  member_code: string;
  name: string;
  phone?: string | null;
  birthday?: string | null;
  joined_date?: string | null;
  note?: string | null;
  is_birthday_month: boolean;
  birthday_discount_available: boolean;
}

export type PosMemberLookupResponse = PosMemberInfo;

export interface MemberSuggestion {
  id: number;
  member_code: string;
  name: string;
  phone?: string | null;
}

export interface PosCheckoutItemPayload {
  product_id: number;
  quantity: number;
  custom_price?: number;
  custom_reason?: string;
}

export interface PosCheckoutPayload {
  member_phone?: string;
  payment_method: PaymentMethod;
  items: PosCheckoutItemPayload[];
  manual_discount_rate?: number;
  round_down_to_ten?: boolean;
}

export interface PosCheckoutDiscounts {
  member_discount: number;
  birthday_discount: number;
  manual_discount: number;
  member_discount_applied: boolean;
  birthday_discount_applied: boolean;
}

export interface PosCheckoutResponse {
  order_id: number;
  gross_total: number;
  discount_total: number;
  total_price: number;
  cost_total: number;
  profit_total: number;
  payment_method: PaymentMethod;
  discounts: PosCheckoutDiscounts;
  member?: PosMemberInfo;
  created_at: string;
}

export interface PosDailySummary {
  date: string;
  orders_count: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
  payment_breakdown: Record<string, number>;
}

export interface OrderItem {
  id: number;
  product_id: number;
  product_name: string;
  barcode: string;
  color?: string | null;
  size?: string | null;
  quantity: number;
  unit_price: number;
  unit_cost: number;
  subtotal: number;
  cost_subtotal: number;
  custom_reason?: string | null;
  custom_price_used?: boolean;
}

export interface OrderMemberInfo {
  id?: number | null;
  member_code?: string | null;
  name?: string | null;
  phone?: string | null;
}

export interface OrderRecord {
  id: number;
  created_at: string;
  updated_at: string;
  payment_method: PaymentMethod;
  reservation_id?: number | null;
  is_cancelled: boolean;
  gross_total: number;
  discount_total: number;
  total_price: number;
  cost_total: number;
  profit_total: number;
  note?: string | null;
  member_discount_applied: boolean;
  birthday_discount_applied: boolean;
  member?: OrderMemberInfo | null;
  items: OrderItem[];
}

export interface OrderUpdatePayload {
  payment_method?: PaymentMethod;
  member_phone?: string | null;
  note?: string | null;
  items?: PosCheckoutItemPayload[];
}

export type ReservationType = "preorder" | "hold";
export type ReservationStatus = "pending" | "ready" | "completed" | "cancelled";
export type ReservationPaymentStatus = "unpaid" | "paid";

interface ReservationProductSummary {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  color?: string | null;
  size?: string | null;
  stock: number;
  price: number;
}

export interface ReservationItemSummary {
  id: number;
  product_id: number;
  quantity: number;
  product: ReservationProductSummary;
}

export interface ReservationRecord {
  id: number;
  type: ReservationType;
  status: ReservationStatus;
  payment_status: ReservationPaymentStatus;
  items: ReservationItemSummary[];
  quantity: number;
  member_id?: number | null;
  member?: OrderMemberInfo | null;
  order_id?: number | null;
  customer_name: string;
  customer_phone?: string | null;
  note?: string | null;
  expected_date?: string | null;
  hold_until?: string | null;
  paid_amount: number;
  created_at: string;
  updated_at: string;
}

export interface ReservationPayload {
  type: ReservationType;
  items: { product_id: number; quantity: number }[];
  customer_name: string;
  customer_phone?: string | null;
  note?: string | null;
  expected_date?: string | null;
  hold_until?: string | null;
  payment_status?: ReservationPaymentStatus;
  paid_amount?: number;
  member_id?: number | null;
}

export interface ReservationUpdatePayload {
  customer_name?: string;
  customer_phone?: string | null;
  items?: { product_id: number; quantity: number }[];
  note?: string | null;
  expected_date?: string | null;
  hold_until?: string | null;
  payment_status?: ReservationPaymentStatus;
  status?: ReservationStatus;
  paid_amount?: number;
  member_id?: number | null;
}

// Analytics
export type SalesGroupBy = "day" | "week";

export interface SalesPaymentBreakdownItem {
  method: string;
  orders_count: number;
  net_total: number;
}

export interface SalesBucket {
  period_start: string;
  period_label: string;
  orders_count: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
  quantity: number;
}

export interface SalesProductPerformance {
  product_id: number;
  sku: string;
  name: string;
  barcode: string;
  quantity: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
}

export interface SalesSummary {
  orders_count: number;
  gross_total: number;
  discount_total: number;
  net_total: number;
  cost_total: number;
  profit_total: number;
  quantity: number;
}

export interface SalesAnalyticsResponse {
  group_by: SalesGroupBy;
  timezone: string;
  start_date: string;
  end_date: string;
  summary: SalesSummary;
  payment_breakdown: SalesPaymentBreakdownItem[];
  timeseries: SalesBucket[];
  top_products: SalesProductPerformance[];
}
