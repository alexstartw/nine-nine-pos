"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import JsBarcode from "jsbarcode";
import { formatSku, formatMoney } from "@/lib/format";
import {
  apiClient,
  PaginatedResponse,
  ProductPayload,
  VendorPayload,
} from "@/lib/api";
import { DatePickerField } from "@/components/DatePickerField";
import { PaginationControls } from "@/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { SelectField } from "@/components/SelectField";

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
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <section>
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">
              Barcode Center
            </p>
            <h2 className="text-3xl font-semibold text-dusk">條碼列印模組</h2>
            <p className="text-sm text-dusk/70">
              勾選欲列印的商品，系統會依格式產出 PNG 圖檔（條碼、碼值、售價）。
            </p>
          </div>
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen/80"
            onClick={toggleSelectAll}
            disabled={loading || products.length === 0}
          >
            {allSelected ? "取消全選" : "全選本頁"}
          </button>
        </div>
        <form
          className="mt-6 flex flex-wrap items-end gap-3"
          onSubmit={handleFilterSubmit}
        >
          <label className="min-w-[220px] flex-[2] text-sm text-dusk/70">
            關鍵字
            <input
              className="mt-1 w-full min-h-[44px] rounded-xl border border-sand/60 bg-white px-3 py-2"
              placeholder="輸入品名、貨號或條碼"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <label className="min-w-[180px] max-w-[360px] flex-1 text-sm text-dusk/70">
            廠商
            <SelectField
              className="mt-1 w-full"
              value={filterVendorId}
              onChange={(e) => setFilterVendorId(e.target.value)}
            >
              <option value="">全部廠商</option>
              {vendors.map((vendor) => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name}
                </option>
              ))}
            </SelectField>
          </label>
          <label className="min-w-[180px] max-w-[360px] flex-1 text-sm text-dusk/70">
            第一次入庫（起）
            <DatePickerField
              className="mt-1 w-full"
              value={firstStockedFrom}
              onChange={setFirstStockedFrom}
            />
          </label>
          <label className="min-w-[180px] max-w-[360px] flex-1 text-sm text-dusk/70">
            第一次入庫（迄）
            <DatePickerField
              className="mt-1 w-full"
              value={firstStockedTo}
              onChange={setFirstStockedTo}
            />
          </label>
          <div className="ml-auto flex shrink-0 flex-wrap items-center justify-end gap-3">
            <button
              type="button"
              className="min-h-[44px] rounded-xl border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen/80"
              onClick={resetFilters}
              disabled={loading}
            >
              清除條件
            </button>
            <button
              type="submit"
              disabled={loading}
              className="min-h-[44px] rounded-xl bg-dusk px-5 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
            >
              {loading ? "篩選中..." : "套用篩選"}
            </button>
          </div>
        </form>
        {error && <p className="mt-3 text-sm text-clay">{error}</p>}
        <div className="mt-6 overflow-x-auto rounded-2xl bg-white/85 shadow">
          <table className="responsive-table min-w-full text-sm">
            <thead className="border-b border-sand/40 text-left text-xs text-dusk/70">
              <tr>
                <th className="w-14 px-3 py-2">選取</th>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">條碼</th>
                <th className="px-3 py-2 text-right">售價</th>
                <th className="px-3 py-2 text-right">庫存</th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-sand/30 transition hover:bg-linen/40">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 cursor-pointer accent-dusk"
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
                  <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                    {formatMoney(product.price || product.cost || 0)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{product.stock}</td>
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
        <div className="sticky bottom-4 z-10 mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-white/95 px-5 py-3 shadow-lg backdrop-blur">
          <p className="text-sm text-dusk/70">
            已選 {selectedProducts.length} / 共 {totalProducts} 筆
          </p>
          <button
            type="button"
            className="min-h-[44px] rounded-xl bg-dusk px-5 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
            onClick={downloadSelected}
            disabled={downloading || selectedProducts.length === 0}
          >
            {downloading ? "產生中..." : "下載選取條碼 (PNG)"}
          </button>
        </div>
      </section>

      <section className="rounded-2xl bg-white/85 p-5 shadow">
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
                    <p className="text-sm text-clay">無法預覽條碼</p>
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
