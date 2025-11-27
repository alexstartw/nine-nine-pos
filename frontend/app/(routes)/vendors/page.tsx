'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiClient, PaginatedResponse, VendorPayload } from '@/lib/api';
import { PaginationControls } from '@/components/PaginationControls';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

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

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export default function VendorsPage() {
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [form, setForm] = useState<VendorPayload>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingVendor, setEditingVendor] = useState<Vendor | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<'created' | 'name' | 'products'>('created');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [totalVendors, setTotalVendors] = useState(0);

  async function fetchVendors(overrides?: {
    search?: string;
    sort?: string;
    dir?: 'asc' | 'desc';
    page?: number;
  }) {
    const q = overrides?.search ?? searchTerm;
    const sort = overrides?.sort ?? sortField;
    const dir = overrides?.dir ?? sortDir;
    const nextPage = overrides?.page ?? page;
    try {
      const keyword = q.trim();
      const { data } = await apiClient.get<PaginatedResponse<Vendor>>('/api/vendors', {
        params: {
          page: nextPage,
          size: PAGE_SIZE,
          q: keyword || undefined,
          sort,
          sort_dir: dir
        }
      });
      const totalPages = Math.max(1, Math.ceil(Math.max(data.total, 0) / PAGE_SIZE));
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchVendors({ search: q, sort, dir, page: totalPages });
        return;
      }
      setVendors(data.data);
      setTotalVendors(data.total);
      setPage(Math.min(nextPage, totalPages));
    } catch (err) {
      setError('無法取得廠商資料，請稍後再試');
    }
  }

  function handleVendorPageChange(nextPage: number) {
    fetchVendors({ page: nextPage });
  }

  useEffect(() => {
    fetchVendors({ page: 1 });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    const isEditMode = modalMode === 'edit' && editingVendor;

    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isEditMode) {
        await apiClient.put(`/api/vendors/${editingVendor.id}`, form);
      } else {
        await apiClient.post('/api/vendors', form);
      }
      setForm(defaultForm);
      await fetchVendors();
      closeModal();
    } catch (err) {
      setError(isEditMode ? '更新廠商失敗，請稍後再試' : '建立廠商失敗，請檢查必填欄位');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除此廠商嗎？')) return;

    try {
      await apiClient.delete(`/api/vendors/${id}`);
      if (editingVendor?.id === id) {
        closeModal();
      }
      await fetchVendors();
    } catch (err) {
      setError('刪除失敗');
    }
  }

  function openCreateModal() {
    setModalMode('create');
    setEditingVendor(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(vendor: Vendor) {
    setModalMode('edit');
    setEditingVendor(vendor);
    setForm({
      name: vendor.name || '',
      contact: vendor.contact || '',
      phone: vendor.phone || '',
      email: vendor.email || '',
      address: vendor.address || ''
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setModalOpen(false);
    setModalMode('create');
    setEditingVendor(null);
    setForm(defaultForm);
    setError(null);
  }

  const isEditMode = modalMode === 'edit';

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Manufacturer list</p>
            <h3 className="text-2xl font-semibold">廠商清單</h3>
            <p className="text-sm text-dusk/70">檢視 about-nine² 供應夥伴，確保商品有穩定供貨來源。</p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
            onClick={openCreateModal}
          >
            + 新增廠商
          </button>
        </div>
        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            fetchVendors({ page: 1 });
          }}
        >
          <label className="text-sm">
            關鍵字
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              placeholder="搜尋名稱、聯絡人、電話或 Email"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="text-sm">
            排序欄位
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={sortField}
              onChange={(event) => {
                const next = event.target.value as 'created' | 'name' | 'products';
                setSortField(next);
                fetchVendors({ sort: next, page: 1 });
              }}
            >
              <option value="created">建立時間</option>
              <option value="name">名稱</option>
              <option value="products">商品數</option>
            </select>
          </label>
          <label className="text-sm">
            排序方向
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={sortDir}
              onChange={(event) => {
                const nextDir = event.target.value as 'asc' | 'desc';
                setSortDir(nextDir);
                fetchVendors({ dir: nextDir, page: 1 });
              }}
            >
              <option value="desc">由新到舊</option>
              <option value="asc">由舊到新</option>
            </select>
          </label>
          <div className="md:col-span-3 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
              onClick={() => {
                setSearchTerm('');
                setSortField('created');
                setSortDir('desc');
                fetchVendors({ search: '', sort: 'created', dir: 'desc', page: 1 });
              }}
            >
              清除條件
            </button>
            <button
              type="submit"
              className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90"
            >
              套用條件
            </button>
          </div>
        </form>
        <div className="mt-4 overflow-x-auto">
          {vendors.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand/60 bg-linen/60 p-6 text-center text-sm text-dusk/70">
              目前尚未建立廠商。點擊右上角「新增廠商」開始建立供應夥伴。
            </div>
          ) : (
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
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          className="rounded-full border border-dusk/30 px-3 py-1 text-xs font-semibold text-dusk hover:bg-dusk/10"
                          onClick={() => openEditModal(vendor)}
                        >
                          編輯
                        </button>
                        <button
                          className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                          onClick={() => handleDelete(vendor.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <PaginationControls
          page={page}
          size={PAGE_SIZE}
          total={totalVendors}
          onPageChange={handleVendorPageChange}
        />
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-dusk/60 backdrop-blur-sm"
            onClick={() => (!loading ? closeModal() : null)}
          />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-sand/40 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  {isEditMode ? '編輯廠商' : '新增廠商'}
                </p>
                <h4 className="text-xl font-semibold">
                  {isEditMode ? '更新供應夥伴基本資料' : '建立供應夥伴'}
                </h4>
              </div>
              <button
                className="text-sm text-dusk/70 hover:text-dusk"
                onClick={() => (!loading ? closeModal() : null)}
                aria-label="Close modal"
              >
                Close
              </button>
            </div>
            <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
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
              {error && (
                <p className="md:col-span-2 text-sm text-red-600">
                  {error}
                </p>
              )}
              <div className="md:col-span-2 flex justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
                  onClick={() => (!loading ? closeModal() : null)}
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white shadow hover:bg-clay/90"
                >
                  {loading ? (isEditMode ? '更新中...' : '建立中...') : isEditMode ? '更新廠商' : '建立廠商'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
