'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  ProductSalesRow,
  ProductSalesStatsResponse,
  SalesAnalyticsResponse,
  SalesBucket,
  SalesGroupBy
} from '@/lib/api';

type FetchState = {
  loading: boolean;
  error: string | null;
  data: SalesAnalyticsResponse | null;
};

type ProductStatsState = {
  loading: boolean;
  error: string | null;
  data: ProductSalesStatsResponse | null;
};

const currency = (value: number) => Math.round(value).toLocaleString('zh-TW');

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit' });

function getDefaultRange() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startObj = new Date(today);
  startObj.setDate(today.getDate() - 27);
  const start = startObj.toISOString().slice(0, 10);
  return { start, end };
}

export default function SalesAnalyticsPage() {
  const { start, end } = useMemo(getDefaultRange, []);
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [groupBy, setGroupBy] = useState<SalesGroupBy>('week');
  const [state, setState] = useState<FetchState>({ loading: true, error: null, data: null });

  // Product stats state
  const [productQ, setProductQ] = useState('');
  const [productPage, setProductPage] = useState(1);
  const PRODUCT_PAGE_SIZE = 20;
  const [productState, setProductState] = useState<ProductStatsState>({
    loading: false,
    error: null,
    data: null
  });

  async function loadAnalytics() {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await apiClient.get<SalesAnalyticsResponse>('/api/analytics/sales', {
        params: {
          start_date: startDate,
          end_date: endDate,
          group_by: groupBy,
          top_limit: 12
        }
      });
      setState({ loading: false, error: null, data });
    } catch {
      setState({ loading: false, error: '無法載入銷售分析，請稍後再試', data: null });
    }
  }

  const loadProductStats = useCallback(
    async (page: number, q: string) => {
      setProductState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const { data } = await apiClient.get<ProductSalesStatsResponse>('/api/analytics/products', {
          params: {
            start_date: startDate,
            end_date: endDate,
            q: q || undefined,
            page,
            size: PRODUCT_PAGE_SIZE
          }
        });
        setProductState({ loading: false, error: null, data });
      } catch {
        setProductState({ loading: false, error: '無法載入單品銷量', data: null });
      }
    },
    [startDate, endDate]
  );

  useEffect(() => {
    loadAnalytics();
    loadProductStats(1, '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avgOrderValue = useMemo(() => {
    if (!state.data?.summary.orders_count) return 0;
    return Math.round(state.data.summary.net_total / state.data.summary.orders_count);
  }, [state.data]);

  const productTotalPages = productState.data
    ? Math.max(1, Math.ceil(productState.data.total / PRODUCT_PAGE_SIZE))
    : 1;

  function handleProductSearch() {
    setProductPage(1);
    loadProductStats(1, productQ);
  }

  function handleProductPageChange(next: number) {
    setProductPage(next);
    loadProductStats(next, productQ);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">Sales Intelligence</p>
          <h1 className="text-3xl font-semibold text-dusk">銷售分析</h1>
          <p className="text-sm text-dusk/70">預設以週為單位、UTC+8，商品（SKU）為主要顆粒度。</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="flex flex-col text-sm text-dusk/70">
            起始
            <input
              type="date"
              className="input-date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-sm text-dusk/70">
            結束
            <input
              type="date"
              className="input-date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
          <label className="flex flex-col text-sm text-dusk/70">
            粒度
            <select
              className="input-date"
              value={groupBy}
              onChange={(e) => setGroupBy(e.target.value as SalesGroupBy)}
            >
              <option value="week">每週</option>
              <option value="day">每日</option>
            </select>
          </label>
          <button
            onClick={() => {
              loadAnalytics();
              setProductPage(1);
              loadProductStats(1, productQ);
            }}
            className="mt-1 rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition hover:translate-y-[-1px] hover:shadow"
            disabled={state.loading}
          >
            重新載入
          </button>
        </div>
      </header>

      {state.error && (
        <div className="rounded-xl bg-white/80 p-4 text-sm text-red-700 shadow">{state.error}</div>
      )}

      {state.loading && (
        <div className="rounded-xl bg-white/80 p-6 text-dusk/70 shadow">載入中...</div>
      )}

      {!state.loading && state.data && (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <StatCard label="營收 (net)" value={state.data.summary.net_total} />
            <StatCard label="毛利" value={state.data.summary.profit_total} />
            <StatCard label="平均客單" value={avgOrderValue} />
            <StatCard label="訂單數" value={state.data.summary.orders_count} />
          </section>

          <section className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-2xl bg-white/85 p-5 shadow lg:col-span-2">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dusk">
                  營收走勢（{groupBy === 'week' ? '週' : '日'}）
                </h2>
                <span className="text-xs text-dusk/60">
                  {formatDate(state.data.start_date)} - {formatDate(state.data.end_date)} ·{' '}
                  {state.data.timezone}
                </span>
              </div>
              <div className="grid gap-3">
                {state.data.timeseries.length === 0 ? (
                  <p className="text-sm text-dusk/60">區間內沒有訂單</p>
                ) : (
                  state.data.timeseries.map((bucket: SalesBucket) => (
                    <div
                      key={bucket.period_label}
                      className="rounded-xl border border-sand/60 bg-sand/40 p-3"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm font-semibold text-dusk">{bucket.period_label}</p>
                          <p className="text-xs text-dusk/60">
                            訂單 {bucket.orders_count} · 件數 {bucket.quantity}
                          </p>
                        </div>
                        <div className="text-right text-dusk">
                          <p className="text-xl font-semibold">＄{currency(bucket.net_total)}</p>
                          <p className="text-xs text-dusk/60">
                            毛利 {currency(bucket.profit_total)} · 折扣{' '}
                            {currency(bucket.discount_total)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-2 h-2 rounded-full bg-white/80">
                        <div
                          className="h-2 rounded-full bg-dusk transition-all"
                          style={{
                            width: `${Math.min(100, (bucket.net_total / Math.max(1, state.data!.summary.net_total)) * 100)}%`
                          }}
                        />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-2xl bg-white/85 p-5 shadow">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-dusk">付款方式</h2>
                <span className="text-xs text-dusk/60">按淨額</span>
              </div>
              <div className="space-y-3">
                {state.data.payment_breakdown.length === 0 && (
                  <p className="text-sm text-dusk/60">無資料</p>
                )}
                {state.data.payment_breakdown.map((item) => (
                  <div
                    key={item.method}
                    className="flex items-center justify-between rounded-xl bg-sand/50 p-3"
                  >
                    <div>
                      <p className="font-semibold text-dusk">{item.method}</p>
                      <p className="text-xs text-dusk/60">訂單 {item.orders_count}</p>
                    </div>
                    <p className="text-lg font-semibold text-dusk">＄{currency(item.net_total)}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section className="rounded-2xl bg-white/90 p-5 shadow">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-dusk">Top SKU</h2>
                <p className="text-xs text-dusk/60">按照淨額排行，依商品粒度</p>
              </div>
              <button
                className="rounded-full border border-dusk/30 px-3 py-1 text-xs text-dusk hover:border-dusk/60"
                onClick={loadAnalytics}
                disabled={state.loading}
              >
                更新排行
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="responsive-table w-full text-sm text-dusk">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-dusk/70">
                    <th className="py-2">SKU</th>
                    <th className="py-2">名稱</th>
                    <th className="py-2">數量</th>
                    <th className="py-2">營收</th>
                    <th className="py-2">折扣</th>
                    <th className="py-2">淨額</th>
                    <th className="py-2">毛利</th>
                  </tr>
                </thead>
                <tbody>
                  {state.data.top_products.map((item) => (
                    <tr key={item.product_id} className="border-t border-sand/50">
                      <td className="py-2 font-semibold">{item.sku}</td>
                      <td className="py-2">{item.name}</td>
                      <td className="py-2">{item.quantity}</td>
                      <td className="py-2">＄{currency(item.gross_total)}</td>
                      <td className="py-2 text-amber-700">-＄{currency(item.discount_total)}</td>
                      <td className="py-2 font-semibold text-dusk">＄{currency(item.net_total)}</td>
                      <td className="py-2 text-emerald-700">＄{currency(item.profit_total)}</td>
                    </tr>
                  ))}
                  {state.data.top_products.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-4 text-center text-dusk/60">
                        尚無商品銷售數據
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {/* 單品銷量統計 */}
      <section className="rounded-2xl bg-white/90 p-5 shadow">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-dusk">單品銷量統計</h2>
            <p className="text-xs text-dusk/60">依商品 × 顏色 × 尺寸拆分，查看各規格銷售表現</p>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="搜尋商品名稱 / SKU"
              value={productQ}
              onChange={(e) => setProductQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleProductSearch()}
              className="rounded-full border border-sand/60 bg-white/80 px-3 py-1.5 text-sm text-dusk placeholder-dusk/40 outline-none focus:border-dusk/50"
            />
            <button
              onClick={handleProductSearch}
              disabled={productState.loading}
              className="rounded-full bg-dusk px-4 py-1.5 text-sm font-semibold text-amber-50 shadow-sm transition hover:translate-y-[-1px] hover:shadow disabled:opacity-60"
            >
              搜尋
            </button>
          </div>
        </div>

        {productState.error && (
          <p className="mb-3 text-sm text-red-600">{productState.error}</p>
        )}

        {productState.loading && (
          <p className="py-4 text-center text-sm text-dusk/60">載入中...</p>
        )}

        {!productState.loading && (
          <div className="overflow-x-auto">
            <table className="responsive-table w-full text-sm text-dusk">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-dusk/70">
                  <th className="py-2">SKU</th>
                  <th className="py-2">名稱</th>
                  <th className="py-2">顏色</th>
                  <th className="py-2">尺寸</th>
                  <th className="py-2 text-right">數量</th>
                  <th className="py-2 text-right">營收</th>
                  <th className="py-2 text-right">折扣</th>
                  <th className="py-2 text-right">淨額</th>
                  <th className="py-2 text-right">毛利</th>
                </tr>
              </thead>
              <tbody>
                {productState.data?.data.map((item: ProductSalesRow, idx: number) => (
                  <tr
                    key={`${item.product_id}-${item.color ?? ''}-${item.size ?? ''}-${idx}`}
                    className="border-t border-sand/50"
                  >
                    <td className="py-2 font-semibold">{item.sku}</td>
                    <td className="py-2">{item.name}</td>
                    <td className="py-2 text-dusk/70">{item.color ?? '—'}</td>
                    <td className="py-2 text-dusk/70">{item.size ?? '—'}</td>
                    <td className="py-2 text-right">{item.quantity}</td>
                    <td className="py-2 text-right">＄{currency(item.gross_total)}</td>
                    <td className="py-2 text-right text-amber-700">
                      {item.discount_total > 0 ? `-＄${currency(item.discount_total)}` : '—'}
                    </td>
                    <td className="py-2 text-right font-semibold">＄{currency(item.net_total)}</td>
                    <td className="py-2 text-right text-emerald-700">
                      ＄{currency(item.profit_total)}
                    </td>
                  </tr>
                ))}
                {(!productState.data || productState.data.data.length === 0) && (
                  <tr>
                    <td colSpan={9} className="py-4 text-center text-dusk/60">
                      {productState.data ? '查無符合條件的商品' : '請輸入條件後搜尋'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {productState.data && productState.data.total > PRODUCT_PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-between text-sm text-dusk/70">
            <span>
              共 {productState.data.total} 筆，第 {productPage} / {productTotalPages} 頁
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => handleProductPageChange(productPage - 1)}
                disabled={productPage <= 1 || productState.loading}
                className="rounded-full border border-dusk/20 px-3 py-1 text-xs hover:border-dusk/50 disabled:opacity-40"
              >
                上一頁
              </button>
              <button
                onClick={() => handleProductPageChange(productPage + 1)}
                disabled={productPage >= productTotalPages || productState.loading}
                className="rounded-full border border-dusk/20 px-3 py-1 text-xs hover:border-dusk/50 disabled:opacity-40"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-dusk/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-dusk">＄{currency(value)}</p>
    </div>
  );
}
