import axios from 'axios';

const DEFAULT_API_BASE_URL =
  process.env.NODE_ENV === 'production' ? '' : 'http://localhost:8000';

const RAW_API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL ?? DEFAULT_API_BASE_URL).trim();
const SANITIZED_API_BASE_URL = RAW_API_BASE_URL.replace(/\/$/, '');
const IS_ABSOLUTE_BASE = /^https?:\/\//i.test(SANITIZED_API_BASE_URL);

export const apiClient = axios.create({
  baseURL: IS_ABSOLUTE_BASE ? SANITIZED_API_BASE_URL : undefined,
  headers: {
    'Content-Type': 'application/json'
  }
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

export type StockEntryMethod = 'single' | 'import';

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
