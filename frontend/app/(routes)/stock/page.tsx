"use client";

import { FormEvent, Fragment, useEffect, useRef, useState } from "react";
import {
  apiClient,
  extractApiError,
  ImportBatch,
  ImportBatchDetail,
  ImportBatchItem,
  PaginatedResponse,
  StockEntryRecord,
} from "@/lib/api";
import { SkeletonTableRows } from "@/components/ui/Skeleton";
import { DatePickerField } from "@/components/DatePickerField";
import { PaginationControls } from "@/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

const METHOD_LABELS: Record<string, string> = {
  single: "單筆輸入",
  import: "批次匯入",
};

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

type Tab = "ledger" | "batches";

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ── Batch Tab ──────────────────────────────────────────────────────────────────

function BatchesTab() {
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [batchDetail, setBatchDetail] = useState<
    Record<string, ImportBatchDetail>
  >({});
  const [detailLoading, setDetailLoading] = useState<string | null>(null);

  const [editingQty, setEditingQty] = useState<Record<number, number>>({});
  const [savingItem, setSavingItem] = useState<number | null>(null);
  const [deletingBatch, setDeletingBatch] = useState<string | null>(null);

  async function fetchBatches(nextPage = page) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PaginatedResponse<ImportBatch>>(
        "/api/stock-entries/batches",
        { params: { page: nextPage, size: PAGE_SIZE } },
      );
      setBatches(data.data);
      setTotal(data.total);
      setPage(nextPage);
    } catch (err) {
      setError(extractApiError(err, "無法取得批次紀錄，請稍後再試"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchBatches(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleExpand(batchId: string) {
    if (expandedBatch === batchId) {
      setExpandedBatch(null);
      return;
    }
    setExpandedBatch(batchId);
    if (batchDetail[batchId]) return;
    setDetailLoading(batchId);
    try {
      const { data } = await apiClient.get<ImportBatchDetail>(
        `/api/stock-entries/batches/${batchId}`,
      );
      setBatchDetail((prev) => ({ ...prev, [batchId]: data }));
      const initQty: Record<number, number> = {};
      data.items.forEach((item) => {
        initQty[item.id] = item.quantity;
      });
      setEditingQty((prev) => ({ ...prev, ...initQty }));
    } catch (err) {
      setError(extractApiError(err, "無法取得批次明細"));
    } finally {
      setDetailLoading(null);
    }
  }

  async function handleSaveItem(batchId: string, item: ImportBatchItem) {
    const newQty = editingQty[item.id];
    if (newQty === item.quantity || newQty < 1) return;
    setSavingItem(item.id);
    try {
      const { data } = await apiClient.patch<ImportBatchItem>(
        `/api/stock-entries/batches/${batchId}/items/${item.id}`,
        { quantity: newQty },
      );
      setBatchDetail((prev) => {
        const detail = prev[batchId];
        if (!detail) return prev;
        return {
          ...prev,
          [batchId]: {
            ...detail,
            items: detail.items.map((i) =>
              i.id === item.id ? { ...i, quantity: data.quantity } : i,
            ),
          },
        };
      });
      setBatches((prev) =>
        prev.map((b) => {
          if (b.batch_id !== batchId) return b;
          const delta = newQty - item.quantity;
          return { ...b, total_quantity: b.total_quantity + delta };
        }),
      );
    } catch (err) {
      setError(extractApiError(err, "更新數量失敗"));
    } finally {
      setSavingItem(null);
    }
  }

  async function handleDeleteBatch(batchId: string) {
    if (!confirm("確定要刪除此批次入庫？相關庫存將會扣除，此操作無法復原。"))
      return;
    setDeletingBatch(batchId);
    try {
      await apiClient.delete(`/api/stock-entries/batches/${batchId}`);
      setBatches((prev) => prev.filter((b) => b.batch_id !== batchId));
      setTotal((prev) => prev - 1);
      if (expandedBatch === batchId) setExpandedBatch(null);
    } catch (err) {
      setError(extractApiError(err, "刪除批次失敗"));
    } finally {
      setDeletingBatch(null);
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {loading && batches.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse rounded-xl bg-linen" />
          ))}
        </div>
      ) : batches.length === 0 ? (
        <p className="py-8 text-center text-dusk/60">尚無批次入庫紀錄。</p>
      ) : (
        batches.map((batch) => {
          const isExpanded = expandedBatch === batch.batch_id;
          const detail = batchDetail[batch.batch_id];
          const isLoadingDetail = detailLoading === batch.batch_id;
          const isDeleting = deletingBatch === batch.batch_id;

          return (
            <div
              key={batch.batch_id}
              className="rounded-xl border border-sand/60 bg-white/80 shadow-sm overflow-hidden"
            >
              {/* batch header row */}
              <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">
                    批次匯入 —{" "}
                    <span className="font-mono text-xs text-dusk/60">
                      {batch.batch_id}
                    </span>
                  </p>
                  <p className="text-xs text-dusk/60">
                    {formatDate(batch.created_at)} ／ {batch.item_count} 種商品
                    ／ {batch.total_quantity} 件
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:border-dusk"
                    onClick={() => handleExpand(batch.batch_id)}
                  >
                    {isExpanded ? "收合" : "展開明細"}
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-red-200 px-3 py-1 text-xs text-red-500 hover:bg-red-50 disabled:opacity-50"
                    disabled={isDeleting}
                    onClick={() => handleDeleteBatch(batch.batch_id)}
                  >
                    {isDeleting ? "刪除中…" : "刪除批次"}
                  </button>
                </div>
              </div>

              {/* detail panel */}
              {isExpanded && (
                <div className="border-t border-sand/40 bg-linen/30 px-4 py-3">
                  {isLoadingDetail ? (
                    <p className="py-4 text-center text-xs text-dusk/60">
                      載入中…
                    </p>
                  ) : detail ? (
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-left text-dusk/60">
                          <th className="pb-2 pr-3">商品</th>
                          <th className="pb-2 pr-3">廠商</th>
                          <th className="pb-2 pr-3">條碼 / SKU</th>
                          <th className="pb-2 pr-3 text-right">數量</th>
                          <th className="pb-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {detail.items.map((item) => {
                          const currentQty =
                            editingQty[item.id] ?? item.quantity;
                          const isDirty = currentQty !== item.quantity;
                          const isSaving = savingItem === item.id;

                          return (
                            <tr
                              key={item.id}
                              className="border-t border-sand/30"
                            >
                              <td className="py-2 pr-3">
                                <p className="font-medium">
                                  {item.product_name}
                                </p>
                              </td>
                              <td className="py-2 pr-3 text-dusk/70">
                                {item.vendor_name || "-"}
                              </td>
                              <td className="py-2 pr-3 font-mono">
                                <div>{item.barcode}</div>
                                <div className="text-[11px] text-dusk/60">
                                  SKU: {item.sku}
                                </div>
                              </td>
                              <td className="py-2 pr-3 text-right">
                                <input
                                  type="number"
                                  min={1}
                                  className="w-16 rounded border border-sand/60 bg-white px-2 py-1 text-right text-xs focus:outline-none focus:ring-1 focus:ring-moss"
                                  value={currentQty}
                                  onChange={(e) => {
                                    const v = parseInt(e.target.value, 10);
                                    if (!Number.isNaN(v)) {
                                      setEditingQty((prev) => ({
                                        ...prev,
                                        [item.id]: v,
                                      }));
                                    }
                                  }}
                                />
                              </td>
                              <td className="py-2">
                                {isDirty && (
                                  <button
                                    type="button"
                                    className="rounded-full bg-moss px-3 py-1 text-xs text-white disabled:opacity-50"
                                    disabled={isSaving || currentQty < 1}
                                    onClick={() =>
                                      handleSaveItem(batch.batch_id, item)
                                    }
                                  >
                                    {isSaving ? "儲存…" : "儲存"}
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  ) : null}
                </div>
              )}
            </div>
          );
        })
      )}

      <PaginationControls
        page={page}
        size={PAGE_SIZE}
        total={total}
        onPageChange={(p) => fetchBatches(p)}
      />
    </div>
  );
}

// ── Ledger Tab ─────────────────────────────────────────────────────────────────

function LedgerTab() {
  const [entries, setEntries] = useState<StockEntryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [methodFilter, setMethodFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalEntries, setTotalEntries] = useState(0);

  async function fetchEntries(overrides?: {
    search?: string;
    method?: string;
    from?: string;
    to?: string;
    page?: number;
  }) {
    setLoading(true);
    setError(null);
    try {
      const nextPage = overrides?.page ?? page;
      const keyword = (overrides?.search ?? searchTerm).trim();
      const method = overrides?.method ?? methodFilter;
      const from = overrides?.from ?? dateFrom;
      const to = overrides?.to ?? dateTo;
      const params: Record<string, string | number> = {
        page: nextPage,
        size: PAGE_SIZE,
      };
      if (keyword) params.q = keyword;
      if (method) params.method = method;
      if (from) params.created_from = from;
      if (to) params.created_to = to;

      const { data } = await apiClient.get<PaginatedResponse<StockEntryRecord>>(
        "/api/stock-entries",
        { params },
      );
      const totalPages = Math.max(
        1,
        Math.ceil(Math.max(data.total, 0) / PAGE_SIZE),
      );
      if (data.total > 0 && nextPage > totalPages) {
        await fetchEntries({
          search: keyword,
          method,
          from,
          to,
          page: totalPages,
        });
        return;
      }
      setEntries(data.data);
      setTotalEntries(data.total);
      setPage(Math.min(nextPage, totalPages));
    } catch (err) {
      setError(extractApiError(err, "無法取得入庫紀錄，請稍後再試"));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries({ page: 1 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchEntries({ page: 1 });
  }

  function handleResetFilters() {
    setSearchTerm("");
    setMethodFilter("");
    setDateFrom("");
    setDateTo("");
    setExpandedRows(new Set());
    fetchEntries({ search: "", method: "", from: "", to: "", page: 1 });
  }

  function toggleRow(rowId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) next.delete(rowId);
      else next.add(rowId);
      return next;
    });
  }

  const groupedEntries = entries.reduce<
    Array<
      | { type: "single"; entry: StockEntryRecord }
      | {
          type: "batch";
          batchId: string;
          createdAt: string;
          totalQuantity: number;
          entries: StockEntryRecord[];
        }
    >
  >((acc, entry) => {
    if (entry.method === "import" && entry.batch_id) {
      let batchGroup = acc.find(
        (
          item,
        ): item is {
          type: "batch";
          batchId: string;
          createdAt: string;
          totalQuantity: number;
          entries: StockEntryRecord[];
        } => item.type === "batch" && item.batchId === entry.batch_id,
      );
      if (!batchGroup) {
        batchGroup = {
          type: "batch",
          batchId: entry.batch_id,
          createdAt: entry.created_at,
          totalQuantity: 0,
          entries: [],
        };
        acc.push(batchGroup);
      }
      batchGroup.entries.push(entry);
      batchGroup.totalQuantity += entry.quantity;
    } else {
      acc.push({ type: "single", entry });
    }
    return acc;
  }, []);

  return (
    <>
      <form
        className="mt-4 grid gap-4 md:grid-cols-4"
        onSubmit={handleFilterSubmit}
      >
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
          來源
          <select
            className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
          >
            <option value="">全部來源</option>
            <option value="single">單筆輸入</option>
            <option value="import">批次匯入</option>
          </select>
        </label>
        <label className="text-sm">
          時間（起）
          <DatePickerField
            className="mt-1 w-full"
            value={dateFrom}
            onChange={setDateFrom}
          />
        </label>
        <label className="text-sm">
          時間（迄）
          <DatePickerField
            className="mt-1 w-full"
            value={dateTo}
            onChange={setDateTo}
          />
        </label>
        <div className="md:col-span-4 flex items-end gap-3 justify-end">
          <button
            type="button"
            className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk"
            onClick={handleResetFilters}
            disabled={loading}
          >
            清除條件
          </button>
          <button
            type="submit"
            className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? "篩選中..." : "套用"}
          </button>
        </div>
      </form>

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="responsive-table min-w-full text-sm">
          <thead className="bg-linen text-left">
            <tr>
              <th className="px-3 py-2 w-48">入庫時間</th>
              <th className="px-3 py-2">來源</th>
            </tr>
          </thead>
          <tbody>
            {loading && groupedEntries.length === 0 && (
              <SkeletonTableRows rows={8} cols={2} />
            )}
            {groupedEntries.map((item) =>
              item.type === "single" ? (
                <Fragment key={`single-${item.entry.id}`}>
                  <tr className="border-b border-sand/30">
                    <td className="px-3 py-3 font-mono text-xs text-dusk/80 align-top">
                      {formatDate(item.entry.created_at)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">
                            {METHOD_LABELS[item.entry.method] ??
                              item.entry.method}
                          </p>
                          <p className="text-xs text-dusk/60">
                            #{item.entry.id}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:border-dusk"
                          onClick={() => toggleRow(`single-${item.entry.id}`)}
                        >
                          {expandedRows.has(`single-${item.entry.id}`)
                            ? "收合明細"
                            : "展開明細"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(`single-${item.entry.id}`) && (
                    <tr className="border-b border-sand/30 bg-white/80">
                      <td colSpan={2} className="px-4 py-3">
                        <div className="grid gap-3 text-sm md:grid-cols-4">
                          <div>
                            <p className="text-xs text-dusk/60">商品</p>
                            <p className="font-medium">
                              {item.entry.product_name}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-dusk/60">廠商</p>
                            <p>{item.entry.vendor_name || "-"}</p>
                          </div>
                          <div>
                            <p className="text-xs text-dusk/60">條碼 / SKU</p>
                            <p className="font-mono text-xs">
                              {item.entry.barcode}
                              <br />
                              <span className="text-[11px] text-dusk/60">
                                SKU: {item.entry.sku}
                              </span>
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-dusk/60">數量</p>
                            <p>{item.entry.quantity}</p>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ) : (
                <Fragment key={`batch-${item.batchId}`}>
                  <tr className="border-b border-sand/30 bg-linen/40">
                    <td className="px-3 py-3 font-mono text-xs text-dusk/80 align-top">
                      {formatDate(item.createdAt)}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="font-medium">批次匯入</p>
                          <p className="text-xs text-dusk/60">
                            共 {item.entries.length} 筆 / {item.totalQuantity}{" "}
                            件
                          </p>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-dusk/70">
                          <span>批次編號：{item.batchId}</span>
                          <button
                            type="button"
                            className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:border-dusk"
                            onClick={() => toggleRow(item.batchId)}
                          >
                            {expandedRows.has(item.batchId)
                              ? "收合明細"
                              : "展開明細"}
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                  {expandedRows.has(item.batchId) && (
                    <tr className="border-b border-sand/30">
                      <td colSpan={2} className="bg-white/80 p-3">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="text-left text-dusk/60">
                              <th className="px-2 py-1">商品</th>
                              <th className="px-2 py-1">廠商</th>
                              <th className="px-2 py-1">條碼 / SKU</th>
                              <th className="px-2 py-1">數量</th>
                            </tr>
                          </thead>
                          <tbody>
                            {item.entries.map((entry) => (
                              <tr
                                key={entry.id}
                                className="border-t border-sand/30"
                              >
                                <td className="px-2 py-1">
                                  <p className="font-medium">
                                    {entry.product_name}
                                  </p>
                                </td>
                                <td className="px-2 py-1 text-dusk/70">
                                  {entry.vendor_name || "-"}
                                </td>
                                <td className="px-2 py-1 font-mono">
                                  <div>{entry.barcode}</div>
                                  <div className="text-[11px] text-dusk/60">
                                    SKU: {entry.sku}
                                  </div>
                                </td>
                                <td className="px-2 py-1">{entry.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ),
            )}
            {groupedEntries.length === 0 && !loading && (
              <tr>
                <td colSpan={2} className="px-3 py-6 text-center text-dusk/60">
                  尚無入庫紀錄，或請調整搜尋條件。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <PaginationControls
        page={page}
        size={PAGE_SIZE}
        total={totalEntries}
        onPageChange={(p) => fetchEntries({ page: p })}
      />
    </>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function StockLedgerPage() {
  const [tab, setTab] = useState<Tab>("batches");

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="mb-4">
          <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">
            Stock Ledger
          </p>
          <h2 className="text-2xl font-semibold">商品入庫紀錄</h2>
          <p className="text-sm text-dusk/70">
            追蹤每次入庫來源（單筆建立或批次匯入）與數量。
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-sand/40">
          {(
            [
              { key: "batches", label: "批次入庫紀錄" },
              { key: "ledger", label: "入庫明細" },
            ] as { key: Tab; label: string }[]
          ).map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                tab === key
                  ? "border-b-2 border-moss text-moss"
                  : "text-dusk/60 hover:text-dusk"
              }`}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "batches" ? <BatchesTab /> : <LedgerTab />}
      </section>
    </div>
  );
}
