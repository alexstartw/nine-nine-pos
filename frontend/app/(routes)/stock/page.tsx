'use client';

import { FormEvent, Fragment, useEffect, useState } from 'react';
import { apiClient, PaginatedResponse, StockEntryRecord } from '@/lib/api';
import { DatePickerField } from '@/components/DatePickerField';

const METHOD_LABELS: Record<string, string> = {
  single: '單筆輸入',
  import: '批次匯入'
};

export default function StockLedgerPage() {
  const [entries, setEntries] = useState<StockEntryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  function formatDate(value?: string | null) {
    if (!value) return '-';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '-';
    return date.toLocaleString(undefined, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  async function fetchEntries(overrides?: { search?: string; method?: string; from?: string; to?: string }) {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = { page: 1, size: 50 };
      const keyword = (overrides?.search ?? searchTerm).trim();
      if (keyword) {
        params.q = keyword;
      }
      const method = overrides?.method ?? methodFilter;
      if (method) {
        params.method = method;
      }
      const from = overrides?.from ?? dateFrom;
      if (from) {
        params.created_from = from;
      }
      const to = overrides?.to ?? dateTo;
      if (to) {
        params.created_to = to;
      }
      const { data } = await apiClient.get<PaginatedResponse<StockEntryRecord>>('/api/stock-entries', { params });
      setEntries(data.data);
    } catch (err) {
      setError('無法取得入庫紀錄，請稍後再試');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchEntries();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchEntries();
  }

  function handleResetFilters() {
    setSearchTerm('');
    setMethodFilter('');
    setDateFrom('');
    setDateTo('');
    setExpandedRows(new Set());
    fetchEntries({ search: '', method: '', from: '', to: '' });
  }

  function toggleRow(rowId: string) {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  }

  const groupedEntries = entries.reduce<
    Array<
      | { type: 'single'; entry: StockEntryRecord }
      | {
          type: 'batch';
          batchId: string;
          createdAt: string;
          totalQuantity: number;
          entries: StockEntryRecord[];
        }
    >
  >((acc, entry) => {
    if (entry.method === 'import' && entry.batch_id) {
      let batchGroup = acc.find(
        (
          item
        ): item is {
          type: 'batch';
          batchId: string;
          createdAt: string;
          totalQuantity: number;
          entries: StockEntryRecord[];
        } => item.type === 'batch' && item.batchId === entry.batch_id
      );
      if (!batchGroup) {
        batchGroup = {
          type: 'batch',
          batchId: entry.batch_id,
          createdAt: entry.created_at,
          totalQuantity: 0,
          entries: []
        };
        acc.push(batchGroup);
      }
      batchGroup.entries.push(entry);
      batchGroup.totalQuantity += entry.quantity;
    } else {
      acc.push({ type: 'single', entry });
    }
    return acc;
  }, []);

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Stock Ledger</p>
            <h2 className="text-2xl font-semibold">商品入庫紀錄</h2>
            <p className="text-sm text-dusk/70">追蹤每次入庫來源（單筆建立或批次匯入）與數量。</p>
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
            <DatePickerField className="mt-1 w-full" value={dateFrom} onChange={setDateFrom} />
          </label>
          <label className="text-sm">
            時間（迄）
            <DatePickerField className="mt-1 w-full" value={dateTo} onChange={setDateTo} />
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
              {loading ? '篩選中...' : '套用'}
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
              {groupedEntries.map((item) =>
                item.type === 'single' ? (
                  <Fragment key={`single-${item.entry.id}`}>
                    <tr className="border-b border-sand/30">
                      <td className="px-3 py-3 font-mono text-xs text-dusk/80 align-top">
                        {formatDate(item.entry.created_at)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="font-medium">
                              {METHOD_LABELS[item.entry.method] ?? item.entry.method}
                            </p>
                            <p className="text-xs text-dusk/60">#{item.entry.id}</p>
                          </div>
                          <button
                            type="button"
                            className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:border-dusk"
                            onClick={() => toggleRow(`single-${item.entry.id}`)}
                          >
                            {expandedRows.has(`single-${item.entry.id}`) ? '收合明細' : '展開明細'}
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
                              <p className="font-medium">{item.entry.product_name}</p>
                            </div>
                            <div>
                              <p className="text-xs text-dusk/60">廠商</p>
                              <p>{item.entry.vendor_name || '-'}</p>
                            </div>
                            <div>
                              <p className="text-xs text-dusk/60">條碼 / SKU</p>
                              <p className="font-mono text-xs">
                                {item.entry.barcode}
                                <br />
                                <span className="text-[11px] text-dusk/60">SKU: {item.entry.sku}</span>
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
                              共 {item.entries.length} 筆 / {item.totalQuantity} 件
                            </p>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-dusk/70">
                            <span>批次編號：{item.batchId}</span>
                            <button
                              type="button"
                              className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:border-dusk"
                              onClick={() => toggleRow(item.batchId)}
                            >
                              {expandedRows.has(item.batchId) ? '收合明細' : '展開明細'}
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
                                <tr key={entry.id} className="border-t border-sand/30">
                                  <td className="px-2 py-1">
                                    <p className="font-medium">{entry.product_name}</p>
                                  </td>
                                  <td className="px-2 py-1 text-dusk/70">{entry.vendor_name || '-'}</td>
                                  <td className="px-2 py-1 font-mono">
                                    <div>{entry.barcode}</div>
                                    <div className="text-[11px] text-dusk/60">SKU: {entry.sku}</div>
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
                )
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
      </section>
    </div>
  );
}
