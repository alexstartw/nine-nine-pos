'use client';

import { FormEvent, useEffect, useState } from 'react';
import {
  apiClient,
  PaginatedResponse,
  ProductImportSummary,
  ProductPayload,
  ProductSummary,
  VendorPayload
} from '@/lib/api';
import { DatePickerField } from '@/components/DatePickerField';
import { PaginationControls } from '@/components/PaginationControls';
import { DEFAULT_PAGE_SIZE } from '@/lib/constants';

interface Product extends ProductPayload {
  id: number;
  vendor?: VendorPayload & { id: number };
  barcode: string;
  gross_margin: number;
  gross_margin_percentage: number;
  first_stocked_at?: string | null;
  data_updated_at?: string | null;
  last_stocked_at?: string | null;
}

interface VendorOption {
  id: number;
  name: string;
}

const defaultProduct: ProductPayload = {
  name: '',
  sku: '',
  vendor_id: undefined,
  color: '',
  size: '',
  price: 0,
  cost: 0,
  stock: 0,
  description: '',
  image_url: ''
};

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [form, setForm] = useState<ProductPayload>(defaultProduct);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'bulk' | 'single'>('bulk');
  const [bulkImportMode, setBulkImportMode] = useState<'new' | 'legacy'>('new');
  const [newImportFile, setNewImportFile] = useState<File | null>(null);
  const [legacyImportFile, setLegacyImportFile] = useState<File | null>(null);
  const [newImportSummary, setNewImportSummary] = useState<ProductImportSummary | null>(null);
  const [legacyImportSummary, setLegacyImportSummary] = useState<ProductImportSummary | null>(null);
  const [newImportError, setNewImportError] = useState<string | null>(null);
  const [legacyImportError, setLegacyImportError] = useState<string | null>(null);
  const [newImportLoading, setNewImportLoading] = useState(false);
  const [legacyImportLoading, setLegacyImportLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterVendorId, setFilterVendorId] = useState('');
  const [firstStockedFrom, setFirstStockedFrom] = useState('');
  const [firstStockedTo, setFirstStockedTo] = useState('');
  const [showFinancials, setShowFinancials] = useState(false);
  const [showStockDates, setShowStockDates] = useState(true);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);
  const [summary, setSummary] = useState<ProductSummary | null>(null);

  function formatDate(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return '-';
    }
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function fetchProducts(overrides?: {
    search?: string;
    vendorId?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    const search = overrides?.search ?? searchTerm;
    const vendorId = overrides?.vendorId ?? filterVendorId;
    const from = overrides?.from ?? firstStockedFrom;
    const to = overrides?.to ?? firstStockedTo;
    const nextPage = overrides?.page ?? page;

    try {
      setListLoading(true);
      const searchValue = search ? search.trim() : '';
      const params: Record<string, string | number> = { page: nextPage, size: PAGE_SIZE };
      if (searchValue) {
        params.q = searchValue;
      }
      if (vendorId) {
        params.vendor_id = Number(vendorId);
      }
      if (from) {
        params.first_stocked_from = from;
      }
      if (to) {
        params.first_stocked_to = to;
      }
      const { data } = await apiClient.get<PaginatedResponse<Product>>('/api/products', { params });
      const totalPages = Math.max(1, Math.ceil(Math.max(data.total, 0) / PAGE_SIZE));
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchProducts({ search, vendorId, from, to, page: totalPages });
        return;
      }
      setProducts(data.data);
      setTotalProducts(data.total);
      setPage(Math.min(nextPage, totalPages));
      setListError(null);
    } catch (err) {
      setListError('無法取得商品資料');
    } finally {
      setListLoading(false);
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

  async function fetchSummary() {
    try {
      const { data } = await apiClient.get<ProductSummary>('/api/products/summary');
      setSummary(data);
    } catch (err) {
      // ignore summary fetch errors to avoid阻斷頁面
    }
  }

  useEffect(() => {
    fetchProducts({ page: 1 });
    fetchVendors();
    fetchSummary();
  }, []);

  function handleNumberChange(key: 'price' | 'cost' | 'stock', value: string) {
    const parsed = parseFloat(value);
    setForm({ ...form, [key]: Number.isNaN(parsed) ? 0 : parsed });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (editingProduct) {
        await apiClient.put(`/api/products/${editingProduct.id}`, form);
      } else {
        await apiClient.post('/api/products', form);
      }
      setForm(defaultProduct);
      setEditingProduct(null);
      await fetchProducts();
      setModalOpen(false);
    } catch (err) {
      setError(editingProduct ? '更新商品失敗' : '建立商品失敗');
    } finally {
      setLoading(false);
    }
  }

  async function handleNewImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newImportFile) {
      setNewImportError('請選擇檔案');
      return;
    }
    setNewImportLoading(true);
    setNewImportError(null);
    setNewImportSummary(null);

    try {
      const data = new FormData();
      data.append('file', newImportFile);
      const response = await apiClient.post<ProductImportSummary>('/api/products/import', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setNewImportSummary(response.data);
      setNewImportFile(null);
      await fetchProducts();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail?.errors) {
        setNewImportSummary(detail as ProductImportSummary);
      } else if (typeof detail === 'string') {
        setNewImportError(detail);
      } else {
        setNewImportError('匯入失敗，請確認欄位格式');
      }
    } finally {
      setNewImportLoading(false);
    }
  }

  async function handleLegacyImport(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!legacyImportFile) {
      setLegacyImportError('請選擇檔案');
      return;
    }
    setLegacyImportLoading(true);
    setLegacyImportError(null);
    setLegacyImportSummary(null);

    try {
      const data = new FormData();
      data.append('file', legacyImportFile);
      const response = await apiClient.post<ProductImportSummary>('/api/products/import-legacy', data, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setLegacyImportSummary(response.data);
      setLegacyImportFile(null);
      await fetchProducts();
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      if (detail?.errors) {
        setLegacyImportSummary(detail as ProductImportSummary);
      } else if (typeof detail === 'string') {
        setLegacyImportError(detail);
      } else {
        setLegacyImportError('匯入失敗，請確認欄位格式');
      }
    } finally {
      setLegacyImportLoading(false);
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchProducts({ page: 1 });
  }

  function handleResetFilters() {
    setSearchTerm('');
    setFilterVendorId('');
    setFirstStockedFrom('');
    setFirstStockedTo('');
    fetchProducts({ search: '', vendorId: '', from: '', to: '', page: 1 });
  }

  function handleProductPageChange(nextPage: number) {
    fetchProducts({ page: nextPage });
  }

  function closeModal() {
    if (loading || newImportLoading || legacyImportLoading) return;
    setModalOpen(false);
    setModalMode('bulk');
    setBulkImportMode('new');
    setForm(defaultProduct);
    setNewImportFile(null);
    setLegacyImportFile(null);
    setNewImportSummary(null);
    setLegacyImportSummary(null);
    setError(null);
    setNewImportError(null);
    setLegacyImportError(null);
    setEditingProduct(null);
  }

  function openCreateModal() {
    setEditingProduct(null);
    setForm(defaultProduct);
    setModalMode('bulk');
    setModalOpen(true);
  }

  function openEditModal(product: Product) {
    setEditingProduct(product);
    setModalMode('single');
    setForm({
      name: product.name,
      sku: product.sku,
      vendor_id: product.vendor_id ?? product.vendor?.id ?? undefined,
      color: product.color ?? '',
      size: product.size ?? '',
      price: product.price,
      cost: product.cost,
      stock: product.stock,
      description: product.description ?? '',
      image_url: product.image_url ?? ''
    });
    setModalOpen(true);
  }

  async function handleDeleteProduct(product: Product) {
    const confirmed = window.confirm(`確定要刪除「${product.name}」嗎？此動作無法復原。`);
    if (!confirmed) return;
    try {
      await apiClient.delete(`/api/products/${product.id}`);
      await fetchProducts();
    } catch (err) {
      setListError('刪除商品失敗，請稍後再試');
    }
  }

  const isEditingProduct = Boolean(editingProduct);

  return (
    <div className="space-y-10">
      <section className="rounded-2xl border border-sand/60 bg-white/70 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Product Management</p>
            <h2 className="text-2xl font-semibold">商品資訊與庫存管理</h2>
            <p className="text-sm text-dusk/70">透過單筆或 Excel 匯入快速建立 about-nine² 商品。</p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white shadow hover:bg-clay/90"
            onClick={openCreateModal}
          >
            + 新增商品
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold">商品列表</h3>
          <div className="flex items-center gap-2">
            <span className="text-sm text-dusk/60">即時庫存</span>
            <button
                type="button"
                className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:bg-sand/40"
                onClick={() => setShowFinancials((prev) => !prev)}
              >
                {showFinancials ? '隱藏成本/毛利' : '顯示成本/毛利'}
              </button>
              <button
                type="button"
                className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:bg-sand/40"
                onClick={() => setShowStockDates((prev) => !prev)}
              >
                {showStockDates ? '隱藏首次/最近入庫' : '顯示首次/最近入庫'}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm md:w-auto md:min-w-[320px]">
            <div className="rounded-xl bg-linen/60 px-3 py-2">
              <p className="text-xs text-dusk/60">總庫存數量</p>
              <p className="text-lg font-semibold text-dusk">
                {summary ? summary.total_stock.toLocaleString() : '—'}
              </p>
            </div>
            <div className="rounded-xl bg-linen/60 px-3 py-2">
              <p className="text-xs text-dusk/60">總庫存金額 (成本)</p>
              <p className="text-lg font-semibold text-dusk">
                {summary ? `NT$ ${summary.total_stock_value.toLocaleString()}` : '—'}
              </p>
            </div>
          </div>
        </div>
        <form className="mt-4 grid gap-4 md:grid-cols-4" onSubmit={handleFilterSubmit}>
          <label className="text-sm">
            關鍵字
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              placeholder="輸入品名、貨號或條碼"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </label>
          <label className="text-sm">
            廠商
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={filterVendorId}
              onChange={(e) => setFilterVendorId(e.target.value)}
            >
              <option value="">全部廠商</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            第一次入庫（起）
            <DatePickerField
              className="mt-1 w-full"
              value={firstStockedFrom}
              onChange={setFirstStockedFrom}
            />
          </label>
          <label className="text-sm">
            第一次入庫（迄）
            <DatePickerField
              className="mt-1 w-full"
              value={firstStockedTo}
              onChange={setFirstStockedTo}
            />
          </label>
          <div className="md:col-span-4 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
              onClick={handleResetFilters}
              disabled={listLoading}
            >
              清除條件
            </button>
            <button
              type="submit"
              disabled={listLoading}
              className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90 disabled:opacity-60"
            >
              {listLoading ? '篩選中...' : '套用篩選'}
            </button>
          </div>
        </form>
        {listError && <p className="mt-3 text-sm text-red-600">{listError}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="responsive-table min-w-full text-xs md:text-sm">
            <thead className="bg-linen text-left">
              <tr>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">條碼</th>
                <th className="px-3 py-2">顏色</th>
                <th className="px-3 py-2">尺寸</th>
                <th className="px-3 py-2">售價</th>
                <th className="px-3 py-2">庫存</th>
                <th className="px-3 py-2">庫存金額</th>
                {showFinancials && (
                  <>
                    <th className="px-3 py-2">成本</th>
                    <th className="px-3 py-2">毛利</th>
                    <th className="px-3 py-2">毛利%</th>
                  </>
                )}
                {showStockDates && (
                  <>
                    <th className="px-3 py-2">首次入庫</th>
                    <th className="px-3 py-2">最近入庫</th>
                  </>
                )}
                <th className="px-3 py-2 text-right">操作</th>
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
                  <td className="px-3 py-2">{product.color || '-'}</td>
                  <td className="px-3 py-2">{product.size || '-'}</td>
                  <td className="px-3 py-2">${Math.round(product.price)}</td>
                  <td className="px-3 py-2">{product.stock}</td>
                  <td className="px-3 py-2">
                    ${Math.round((product.cost || 0) * (product.stock || 0))}
                  </td>
                  {showFinancials && (
                    <>
                      <td className="px-3 py-2">${Math.round(product.cost)}</td>
                      <td className="px-3 py-2">${Math.round(product.gross_margin)}</td>
                      <td className="px-3 py-2">{Math.round(product.gross_margin_percentage)}%</td>
                    </>
                  )}
                  {showStockDates && (
                    <>
                      <td className="px-3 py-2">{formatDate(product.first_stocked_at)}</td>
                      <td className="px-3 py-2">
                        {formatDate(product.last_stocked_at ?? product.data_updated_at)}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        className="rounded-full border border-dusk/30 px-3 py-1 text-xs font-semibold text-dusk hover:bg-dusk/10"
                        onClick={() => openEditModal(product)}
                      >
                        編輯
                      </button>
                      <button
                        type="button"
                        className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50"
                        onClick={() => handleDeleteProduct(product)}
                      >
                        刪除
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={page}
          size={PAGE_SIZE}
          total={totalProducts}
          onPageChange={handleProductPageChange}
        />
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-dusk/50 backdrop-blur-sm" onClick={closeModal} />
          <div className="relative z-10 w-full max-w-4xl rounded-2xl border border-sand/40 bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  {isEditingProduct ? '商品維護' : '商品建立'}
                </p>
                <h4 className="text-xl font-semibold">
                  {isEditingProduct ? `編輯 ${editingProduct?.name}` : '選擇建立方式'}
                </h4>
              </div>
              <button className="text-sm text-dusk/70 hover:text-dusk" onClick={closeModal} aria-label="Close">
                Close
              </button>
            </div>

            {!isEditingProduct && (
              <div className="mt-6 flex gap-3">
                {[
                  { value: 'bulk', label: 'Excel 匯入' },
                  { value: 'single', label: '單筆建立' }
                ].map((option) => (
                  <button
                    key={option.value}
                    className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                      modalMode === option.value
                        ? 'bg-clay text-white shadow'
                        : 'bg-linen text-dusk hover:bg-sand/60'
                    }`}
                    onClick={() => setModalMode(option.value as 'bulk' | 'single')}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}

            {modalMode === 'bulk' && !isEditingProduct ? (
              <div className="mt-6 space-y-6">
                <div className="inline-flex rounded-full border border-sand/60 bg-linen p-1 text-sm font-semibold">
                  {[
                    { value: 'new', label: '新增新品' },
                    { value: 'legacy', label: '舊系統資料轉入' }
                  ].map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      className={`rounded-full px-4 py-1.5 transition ${
                        bulkImportMode === option.value ? 'bg-white text-dusk shadow' : 'text-dusk/70'
                      }`}
                      onClick={() => setBulkImportMode(option.value as 'new' | 'legacy')}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>

                {bulkImportMode === 'new' ? (
                  <form className="space-y-4" onSubmit={handleNewImport}>
                    <p className="text-sm text-dusk/70">
                      上傳 Excel（.xlsx）檔案，欄位需包含：廠商、廠商貨號、品名、顏色、尺寸、進貨數量、成本、售價。
                      系統會根據欄位自動產生條碼。
                    </p>
                    <label className="file-upload" htmlFor="product-import-new">
                      <div>
                        <p className="text-sm font-semibold text-dusk">點擊或拖曳檔案上傳</p>
                        <p className="file-upload__name">
                          {newImportFile ? newImportFile.name : '尚未選擇檔案'}
                        </p>
                      </div>
                      <span className="rounded-full bg-dusk px-4 py-2 text-xs font-semibold text-white">
                        選擇檔案
                      </span>
                      <input
                        id="product-import-new"
                        type="file"
                        accept=".xlsx,.xlsm"
                        onChange={(e) => setNewImportFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {newImportError && <p className="text-sm text-red-600">{newImportError}</p>}
                    {newImportSummary && (
                      <div className="rounded-xl border border-sand/40 bg-linen/60 p-4 text-sm">
                        <p>新品：{newImportSummary.created} 筆 / 入庫：{newImportSummary.restocked} 筆</p>
                        {newImportSummary.errors.length > 0 && (
                          <ul className="mt-2 list-disc pl-5 text-red-600">
                            {newImportSummary.errors.map((errMsg, idx) => (
                              <li key={`${errMsg}-${idx}`}>{errMsg}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
                        onClick={closeModal}
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={newImportLoading}
                        className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
                      >
                        {newImportLoading ? '匯入中...' : '上傳匯入'}
                      </button>
                    </div>
                  </form>
                ) : (
                  <form className="space-y-4" onSubmit={handleLegacyImport}>
                    <p className="text-sm text-dusk/70">
                      上傳舊系統資料 Excel（.xlsx），欄位需包含：廠商、廠商貨號、品名、顏色、尺寸、進貨數量、成本、售價、條碼。
                      會沿用檔案中的條碼，不會重新產生。
                    </p>
                    <label className="file-upload" htmlFor="product-import-legacy">
                      <div>
                        <p className="text-sm font-semibold text-dusk">點擊或拖曳檔案上傳</p>
                        <p className="file-upload__name">
                          {legacyImportFile ? legacyImportFile.name : '尚未選擇檔案'}
                        </p>
                      </div>
                      <span className="rounded-full bg-dusk px-4 py-2 text-xs font-semibold text-white">
                        選擇檔案
                      </span>
                      <input
                        id="product-import-legacy"
                        type="file"
                        accept=".xlsx,.xlsm"
                        onChange={(e) => setLegacyImportFile(e.target.files?.[0] ?? null)}
                      />
                    </label>
                    {legacyImportError && <p className="text-sm text-red-600">{legacyImportError}</p>}
                    {legacyImportSummary && (
                      <div className="rounded-xl border border-sand/40 bg-linen/60 p-4 text-sm">
                        <p>新品：{legacyImportSummary.created} 筆 / 入庫：{legacyImportSummary.restocked} 筆</p>
                        {legacyImportSummary.errors.length > 0 && (
                          <ul className="mt-2 list-disc pl-5 text-red-600">
                            {legacyImportSummary.errors.map((errMsg, idx) => (
                              <li key={`${errMsg}-${idx}`}>{errMsg}</li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    <div className="flex justify-end gap-3">
                      <button
                        type="button"
                        className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
                        onClick={closeModal}
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={legacyImportLoading}
                        className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
                      >
                        {legacyImportLoading ? '匯入中...' : '上傳匯入'}
                      </button>
                    </div>
                  </form>
                )}
              </div>
            ) : (
              <form className="mt-6 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
                <label className="text-sm">
                  廠商*
                  <select
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.vendor_id ?? ''}
                    onChange={(e) =>
                      setForm({ ...form, vendor_id: e.target.value ? Number(e.target.value) : undefined })
                    }
                    required
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
                  廠商貨號*
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.sku}
                    onChange={(e) => setForm({ ...form, sku: e.target.value })}
                    required
                  />
                </label>
                <label className="text-sm">
                  品名*
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    required
                  />
                </label>
                <label className="text-sm">
                  進貨數量*
                  <input
                    type="number"
                    min="0"
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.stock}
                    onChange={(e) => handleNumberChange('stock', e.target.value)}
                    required
                  />
                </label>
                <label className="text-sm">
                  顏色*
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.color ?? ''}
                    onChange={(e) => setForm({ ...form, color: e.target.value })}
                    required
                  />
                </label>
                <label className="text-sm">
                  尺寸*
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.size ?? ''}
                    onChange={(e) => setForm({ ...form, size: e.target.value })}
                    required
                  />
                </label>
                <label className="text-sm">
                  成本*
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={form.cost}
                    onChange={(e) => handleNumberChange('cost', e.target.value)}
                    required
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
                {error && <p className="text-sm text-red-600 md:col-span-2">{error}</p>}
                <div className="md:col-span-2 flex justify-end gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
                    onClick={closeModal}
                  >
                    取消
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white shadow hover:bg-clay/90"
                  >
                    {loading ? '處理中...' : isEditingProduct ? '儲存變更' : '儲存'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
