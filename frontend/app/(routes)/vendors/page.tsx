'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiClient, PaginatedResponse, VendorPayload } from '@/lib/api';

interface Vendor extends VendorPayload {
  id: number;
  product_count: number;
}

const defaultForm: VendorPayload = {
  name: '',
  contact: '',
  phone: '',
  email: '',
  address: ''
};

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState<VendorPayload>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function fetchVendors() {
    try {
      const { data } = await apiClient.get<PaginatedResponse<Vendor>>('/api/vendors', {
        params: { page: 1, size: 20 }
      });
      setVendors(data.data);
    } catch (err) {
      setError('無法取得廠商資料，請稍後再試');
    }
  }

  useEffect(() => {
    fetchVendors();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient.post('/api/vendors', form);
      setForm(defaultForm);
      await fetchVendors();
    } catch (err) {
      setError('建立廠商失敗，請檢查必填欄位');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除此廠商嗎？')) return;

    try {
      await apiClient.delete(`/api/vendors/${id}`);
      await fetchVendors();
    } catch (err) {
      setError('刪除失敗');
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/70 p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Phase 1</p>
          <h2 className="text-2xl font-semibold">廠商管理</h2>
          <p className="text-sm text-dusk/70">建立 about-nine^2 的供應夥伴資料，後續即可綁定商品。</p>
        </div>

        <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          <label className="text-sm">
            名稱*
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />
          </label>
          <label className="text-sm">
            聯絡人
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.contact}
              onChange={(e) => setForm({ ...form, contact: e.target.value })}
            />
          </label>
          <label className="text-sm">
            電話
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </label>
          <label className="text-sm">
            Email
            <input
              type="email"
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </label>
          <label className="text-sm md:col-span-2">
            地址
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-moss px-4 py-2 text-white shadow hover:bg-moss/90"
            >
              {loading ? '建立中...' : '新增廠商'}
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">廠商清單</h3>
          <span className="text-sm text-dusk/60">共 {vendors.length} 位夥伴</span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-linen text-left">
              <tr>
                <th className="px-3 py-2">名稱</th>
                <th className="px-3 py-2">聯絡人</th>
                <th className="px-3 py-2">電話</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2">商品數</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {vendors.map((vendor) => (
                <tr key={vendor.id} className="border-b border-sand/30">
                  <td className="px-3 py-2 font-medium">{vendor.name}</td>
                  <td className="px-3 py-2">{vendor.contact || '-'}</td>
                  <td className="px-3 py-2">{vendor.phone || '-'}</td>
                  <td className="px-3 py-2">{vendor.email || '-'}</td>
                  <td className="px-3 py-2">{vendor.product_count}</td>
                  <td className="px-3 py-2">
                    <button
                      className="text-sm text-clay hover:underline"
                      onClick={() => handleDelete(vendor.id)}
                    >
                      刪除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
