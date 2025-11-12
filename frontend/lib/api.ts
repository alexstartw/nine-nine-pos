import axios from 'axios';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8000';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
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
