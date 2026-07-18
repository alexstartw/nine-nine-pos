"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { formatSku } from "@/lib/format";
import {
  apiClient,
  PaginatedResponse,
  ProductPayload,
  VendorPayload,
} from "@/lib/api";
import { DatePickerField } from "@/components/DatePickerField";
import { PaginationControls } from "@/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

interface ProductWithBarcode extends ProductPayload {
  id: number;
  barcode: string;
  vendor?: VendorPayload & { id: number };
}

interface VendorOption {
  id: number;
  name: string;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function buildBarcodeImage(product: ProductWithBarcode): string {
  if (typeof window === "undefined") {
    return "";
  }

  const rawCanvas = document.createElement("canvas");
  JsBarcode(rawCanvas, product.barcode, {
    format: "CODE128",
    width: 2,
    height: 70,
    displayValue: false,
    margin: 10,
    font: "18px Inter",
  });

  const width = Math.max(rawCanvas.width, 260);
  const finalHeight = rawCanvas.height + 60;
  const finalCanvas = document.createElement("canvas");
  finalCanvas.width = width;
  finalCanvas.height = finalHeight;
  const ctx = finalCanvas.getContext("2d");
  if (!ctx) {
    throw new Error("無法建立條碼畫布");
  }

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, finalHeight);
  ctx.drawImage(rawCanvas, (width - rawCanvas.width) / 2, 0);

  ctx.fillStyle = "#111827";
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.font = 'bold 19px "Inter", sans-serif';
  ctx.fillText(product.barcode, width / 2, rawCanvas.height + 12);

  ctx.font = 'bold 22px "Inter", sans-serif';
  const price = Math.round(product.price || product.cost || 0);
  ctx.fillText(`NT$ ${price}`, width / 2, rawCanvas.height + 32);

  return finalCanvas.toDataURL("image/png");
}

export default function BarcodeCenterPage() {
  const [products, setProducts] = useState<ProductWithBarcode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [downloading, setDownloading] = useState(false);
  const [search, setSearch] = useState("");
  const [vendors, setVendors] = useState<VendorOption[]>([]);
  const [filterVendorId, setFilterVendorId] = useState("");
  const [firstStockedFrom, setFirstStockedFrom] = useState("");
  const [firstStockedTo, setFirstStockedTo] = useState("");
  const [page, setPage] = useState(1);
  const [totalProducts, setTotalProducts] = useState(0);

  async function fetchProducts(overrides?: {
    search?: string;
    vendorId?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    setLoading(true);
    setError(null);
    try {
      const searchValue = overrides?.search ?? search;
      const vendorId = overrides?.vendorId ?? filterVendorId;
      const from = overrides?.from ?? firstStockedFrom;
      const to = overrides?.to ?? firstStockedTo;
      const nextPage = overrides?.page ?? page;
      const params: Record<string, string | number> = {
        page: nextPage,
        size: PAGE_SIZE,
      };
      const term = searchValue.trim();
      if (term) {
        params.q = term;
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
      const { data } = await apiClient.get<
        PaginatedResponse<ProductWithBarcode>
      >("/api/products", { params });
      const totalPages = Math.max(
        1,
        Math.ceil(Math.max(data.total, 0) / PAGE_SIZE),
      );
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchProducts({
          search: searchValue,
          vendorId,
          from,
          to,
          page: totalPages,
        });
        return;
      }
      setProducts(data.data);
      setTotalProducts(data.total);
      setPage(Math.min(nextPage, totalPages));
      setSelectedIds((prev) => {
        const next = new Set<number>();
        data.data.forEach((product) => {
          if (prev.has(product.id)) {
            next.add(product.id);
          }
        });
        return next;
      });
    } catch (err) {
      setError("無法取得商品資料，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  async function fetchVendors() {
    try {
      const { data } = await apiClient.get<PaginatedResponse<VendorOption>>(
        "/api/vendors",
        {
          params: { page: 1, size: 100 },
        },
      );
      setVendors(data.data);
    } catch {
      // ignore vendor fetch error for now
    }
  }

  useEffect(() => {
    fetchProducts({ page: 1 });
    fetchVendors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedProducts = useMemo(
    () => products.filter((product) => selectedIds.has(product.id)),
    [products, selectedIds],
  );

  const allSelected =
    products.length > 0 && selectedProducts.length === products.length;

  function toggleSelection(productId: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(products.map((product) => product.id)));
    }
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchProducts({ page: 1 });
  }

  function resetFilters() {
    setSearch("");
    setFilterVendorId("");
    setFirstStockedFrom("");
    setFirstStockedTo("");
    fetchProducts({ search: "", vendorId: "", from: "", to: "", page: 1 });
  }

  function handleBarcodePageChange(nextPage: number) {
    fetchProducts({ page: nextPage });
  }

  const previews = useMemo(() => {
    const map = new Map<number, string>();
    selectedProducts.slice(0, 12).forEach((product) => {
      try {
        map.set(product.id, buildBarcodeImage(product));
      } catch {
        // ignore preview error
      }
    });
    return map;
  }, [selectedProducts]);

  async function downloadSelected() {
    if (selectedProducts.length === 0) {
      setError("請先選擇要列印的商品");
      return;
    }
    setError(null);
    setDownloading(true);
    try {
      for (const product of selectedProducts) {
        const dataUrl = buildBarcodeImage(product);
        const anchor = document.createElement("a");
        anchor.href = dataUrl;
        anchor.download = `${formatSku(product.sku) || product.name}-${product.id}.png`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        await new Promise((resolve) => setTimeout(resolve, 120));
      }
    } catch (err) {
      setError("下載條碼失敗，請再試一次");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">
              Barcode Center
            </p>
            <h2 className="text-2xl font-semibold">條碼列印模組</h2>
            <p className="text-sm text-dusk/70">
              勾選欲列印的商品，系統會依格式產出 PNG 圖檔（條碼、碼值、售價）。
            </p>
          </div>
          <button
            type="button"
            className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-sand/40"
            onClick={toggleSelectAll}
            disabled={loading || products.length === 0}
          >
            {allSelected ? "取消全選" : "全選本頁"}
          </button>
        </div>
        <form
          className="mt-4 grid gap-4 md:grid-cols-4"
          onSubmit={handleFilterSubmit}
        >
          <label className="text-sm">
            關鍵字
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              placeholder="輸入品名、貨號或條碼"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
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
              onClick={resetFilters}
              disabled={loading}
            >
              清除條件
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90 disabled:opacity-60"
            >
              {loading ? "篩選中..." : "套用篩選"}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
        <div className="mt-4 overflow-x-auto">
          <table className="responsive-table min-w-full text-sm">
            <thead className="bg-linen text-left">
              <tr>
                <th className="px-3 py-2">選取</th>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">條碼</th>
                <th className="px-3 py-2">售價</th>
                <th className="px-3 py-2">庫存</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-sand/30">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-4 w-4 rounded border-sand/70 text-clay focus:ring-clay"
                      checked={selectedIds.has(product.id)}
                      onChange={() => toggleSelection(product.id)}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{product.name}</p>
                    <p className="text-xs text-dusk/60">
                      {product.vendor?.name || "未指定廠商"}
                    </p>
                    <p className="text-xs text-dusk/60">
                      SKU：{formatSku(product.sku)}
                    </p>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {product.barcode}
                  </td>
                  <td className="px-3 py-2">
                    NT$ {Math.round(product.price || product.cost || 0)}
                  </td>
                  <td className="px-3 py-2">{product.stock}</td>
                </tr>
              ))}
              {products.length === 0 && !loading && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-6 text-center text-dusk/60"
                  >
                    尚未有商品資料，或請調整搜尋條件。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={page}
          size={PAGE_SIZE}
          total={totalProducts}
          onPageChange={handleBarcodePageChange}
        />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-dusk/70">
            已選 {selectedProducts.length} / 共 {totalProducts} 筆
          </p>
          <button
            type="button"
            className="rounded-full bg-clay px-6 py-2 text-sm font-semibold text-white shadow hover:bg-clay/90 disabled:opacity-60"
            onClick={downloadSelected}
            disabled={downloading || selectedProducts.length === 0}
          >
            {downloading ? "產生中..." : "下載選取條碼 (PNG)"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-sand/60 bg-linen/60 p-6 shadow-inner">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">列印預覽</h3>
            <p className="text-sm text-dusk/70">
              展示前 12 筆選取商品。實際下載會包含所有勾選的條碼。
            </p>
          </div>
        </div>
        {selectedProducts.length === 0 ? (
          <p className="mt-4 text-sm text-dusk/60">
            選取商品後即可預覽列印圖。
          </p>
        ) : (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            {selectedProducts.slice(0, 12).map((product) => {
              const preview = previews.get(product.id);
              return (
                <div
                  key={product.id}
                  className="rounded-xl border border-sand/40 bg-white p-4 text-center shadow-sm"
                >
                  {preview ? (
                    <img
                      src={preview}
                      alt="Barcode preview"
                      className="mx-auto h-auto max-w-full"
                    />
                  ) : (
                    <p className="text-sm text-red-600">無法預覽條碼</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
