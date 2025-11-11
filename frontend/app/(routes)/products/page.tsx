'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiClient, PaginatedResponse, ProductPayload, VendorPayload } from '@/lib/api';

interface Product extends ProductPayload {
  id: number;
  vendor?: VendorPayload & { id: number };
  barcode: string;
  gross_margin: number;
  gross_margin_percentage: number;
}

interface VendorOption {
  id: number;
  name: string;
}

const defaultProduct: ProductPayload = {
  name: '',
  sku: '',
  vendor_id: undefined,
  price: 0,
  cost: 0,
  stock: 0,
  description: '',
  image_url: ''
};

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [form, setForm] = useState<ProductPayload>(defaultProduct);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchProducts() {
    try {
      const { data } = await apiClient.get<PaginatedResponse<Product>>('/api/products', {
        params: { page: 1, size: 20 }
      });
      setProducts(data.data);
    } catch (err) {
      setError('無法取得商品資料');
    }
  }

  async function fetchVendors() {
    try {
      const { data } = await apiClient.get<PaginatedResponse<VendorOption>>('/api/vendors', {
        params: { page: 1, size: 100 }
      });
      setVendors(data.data);
    } catch (err) {
      // ignore for now
    }
  }

  useEffect(() => {
    fetchProducts();
    fetchVendors();
  }, []);

  function handleNumberChange(key: keyof ProductPayload, value: string) {
    const parsed = parseFloat(value);
    setForm({ ...form, [key]: Number.isNaN(parsed) ? 0 : parsed });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient.post('/api/products', form);
      setForm(defaultProduct);
      await fetchProducts();
    } catch (err) {
      setError('建立商品失敗');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-sand/60 bg-white/70 p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Phase 2 Preview</p>
          <h2 className="text-2xl font-semibold">商品資訊與庫存管理</h2>
          <p className="text-sm text-dusk/70">快速建立商品、綁定廠商並追蹤庫存與毛利。</p>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-sm">
            商品名稱*
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            廠商 SKU*
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.sku}
              onChange={(e) => setForm({ ...form, sku: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            廠商
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.vendor_id ?? ''}
              onChange={(e) =>
                setForm({ ...form, vendor_id: e.target.value ? Number(e.target.value) : undefined })
              }
            >
              <option value="">選擇廠商</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            庫存
            <input
              type="number"
              min="0"
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.stock}
              onChange={(e) => handleNumberChange('stock', e.target.value)}
            />
          </label>
          <label className="text-sm">
            成本
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.cost}
              onChange={(e) => handleNumberChange('cost', e.target.value)}
            />
          </label>
          <label className="text-sm">
            售價
            <input
              type="number"
              min="0"
              step="0.01"
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.price}
              onChange={(e) => handleNumberChange('price', e.target.value)}
            />
          </label>
          <label className="text-sm md:col-span-2">
            描述
            <textarea
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-clay px-4 py-2 text-white shadow hover:bg-clay/90"
            >
              {loading ? '建立中...' : '新增商品'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">商品列表</h3>
          <span className="text-sm text-dusk/60">即時庫存</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-linen text-left">
              <tr>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">條碼</th>
                <th className="px-3 py-2">庫存</th>
                <th className="px-3 py-2">成本</th>
                <th className="px-3 py-2">售價</th>
                <th className="px-3 py-2">毛利%</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-sand/30">
                  <td className="px-3 py-2">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-dusk/60">{product.vendor?.name || '未指定'}</p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{product.barcode}</td>
                  <td className="px-3 py-2">{product.stock}</td>
                  <td className="px-3 py-2">${product.cost.toFixed(2)}</td>
                  <td className="px-3 py-2">${product.price.toFixed(2)}</td>
                  <td className="px-3 py-2">{product.gross_margin_percentage.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
