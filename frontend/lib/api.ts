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
