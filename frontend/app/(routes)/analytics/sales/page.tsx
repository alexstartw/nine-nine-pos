"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { formatSku } from "@/lib/format";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { SkeletonStatCards, SkeletonTableRows } from "@/components/ui/Skeleton";
import {
  apiClient,
  ProductSalesRow,
  ProductSalesStatsResponse,
  SalesAnalyticsResponse,
  SalesBucket,
  SalesGroupBy,
} from "@/lib/api";

type Tab = "overview" | "products";

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

const currency = (value: number) => Math.round(value).toLocaleString("zh-TW");

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });

function getDefaultRange() {
  const today = new Date();
  const end = today.toISOString().slice(0, 10);
  const startObj = new Date(today);
  startObj.setDate(today.getDate() - 27);
  const start = startObj.toISOString().slice(0, 10);
  return { start, end };
}

export default function SalesAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // ── 銷售總覽 state ──────────────────────────────────────
  const { start, end } = useMemo(getDefaultRange, []);
  const [startDate, setStartDate] = useState(start);
  const [endDate, setEndDate] = useState(end);
  const [groupBy, setGroupBy] = useState<SalesGroupBy>("week");
  // Top SKU 顯示模式：false=變體粒度（標出顏色/尺寸），true=同款合併
  const [topSkuMerge, setTopSkuMerge] = useState(false);
  const [overviewState, setOverviewState] = useState<FetchState>({
    loading: true,
    error: null,
    data: null,
  });

  // ── 單品銷量 state ──────────────────────────────────────
  const [productQ, setProductQ] = useState("");
  const [productStartDate, setProductStartDate] = useState("");
  const [productEndDate, setProductEndDate] = useState("");
  const [productPage, setProductPage] = useState(1);
  const PRODUCT_PAGE_SIZE = 20;
  const [productState, setProductState] = useState<ProductStatsState>({
    loading: true,
    error: null,
    data: null,
  });

  // ── 銷售總覽 load ───────────────────────────────────────
  async function loadAnalytics(merge = topSkuMerge) {
    setOverviewState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const { data } = await apiClient.get<SalesAnalyticsResponse>(
        "/api/analytics/sales",
        {
          params: {
            start_date: startDate,
            end_date: endDate,
            group_by: groupBy,
            top_limit: 12,
            merge_variants: merge,
          },
        },
      );
      setOverviewState({ loading: false, error: null, data });
    } catch {
      setOverviewState({
        loading: false,
        error: "無法載入銷售分析，請稍後再試",
        data: null,
      });
    }
  }

  // ── 單品銷量 load ───────────────────────────────────────
  const loadProductStats = useCallback(
    async (page: number, q: string, pStart: string, pEnd: string) => {
      setProductState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const params: Record<string, string | number> = {
          page,
          size: PRODUCT_PAGE_SIZE,
        };
        if (q) params.q = q;
        if (pStart) params.start_date = pStart;
        if (pEnd) params.end_date = pEnd;
        const { data } = await apiClient.get<ProductSalesStatsResponse>(
          "/api/analytics/products",
          {
            params,
          },
        );
        setProductState({ loading: false, error: null, data });
      } catch {
        setProductState({
          loading: false,
          error: "無法載入單品銷量",
          data: null,
        });
      }
    },
    [],
  );

  useEffect(() => {
    loadAnalytics();
    loadProductStats(1, "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const avgOrderValue = useMemo(() => {
    if (!overviewState.data?.summary.orders_count) return 0;
    return Math.round(
      overviewState.data.summary.net_total /
        overviewState.data.summary.orders_count,
    );
  }, [overviewState.data]);

  const productTotalPages = productState.data
    ? Math.max(1, Math.ceil(productState.data.total / PRODUCT_PAGE_SIZE))
    : 1;

  function handleProductSearch() {
    setProductPage(1);
    loadProductStats(1, productQ, productStartDate, productEndDate);
  }

  function handleProductPageChange(next: number) {
    setProductPage(next);
    loadProductStats(next, productQ, productStartDate, productEndDate);
  }

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      {/* Page header */}
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">
          Sales Intelligence
        </p>
        <h1 className="text-3xl font-semibold text-dusk">銷售分析</h1>
      </header>

      {/* Sub-tabs */}
      <div className="flex gap-1 rounded-xl bg-white/60 p-1 shadow-sm w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === "overview"
              ? "bg-dusk text-amber-50 shadow"
              : "text-dusk/60 hover:text-dusk"
          }`}
        >
          銷售總覽
        </button>
        <button
          onClick={() => setActiveTab("products")}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
            activeTab === "products"
              ? "bg-dusk text-amber-50 shadow"
              : "text-dusk/60 hover:text-dusk"
          }`}
        >
          單品銷量
        </button>
      </div>

      {/* ═══════════════ 銷售總覽 ═══════════════ */}
      {activeTab === "overview" && (
        <>
          {/* Controls */}
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
              onClick={() => loadAnalytics()}
              className="mt-auto rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-amber-50 shadow-sm transition hover:translate-y-[-1px] hover:shadow"
              disabled={overviewState.loading}
            >
              重新載入
            </button>
          </div>

          {overviewState.error && (
            <div className="rounded-xl bg-white/80 p-4 text-sm text-red-700 shadow">
              {overviewState.error}
            </div>
          )}

          {overviewState.loading && (
            <section className="grid gap-4 md:grid-cols-4">
              <SkeletonStatCards count={4} />
            </section>
          )}

          {!overviewState.loading && overviewState.data && (
            <>
              <section className="grid gap-4 md:grid-cols-4">
                <StatCard
                  label="營收 (net)"
                  value={overviewState.data.summary.net_total}
                />
                <StatCard
                  label="毛利"
                  value={overviewState.data.summary.profit_total}
                />
                <StatCard label="平均客單" value={avgOrderValue} />
                <StatCard
                  label="訂單數"
                  value={overviewState.data.summary.orders_count}
                  prefix=""
                />
              </section>

              {overviewState.data.timeseries.length > 0 && (
                <section className="grid gap-4 lg:grid-cols-2">
                  {/* 折線圖：營收走勢 */}
                  <div className="rounded-2xl bg-white/85 p-5 shadow">
                    <h2 className="mb-4 text-base font-semibold text-dusk">
                      營收走勢（折線）
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <LineChart
                        data={overviewState.data.timeseries}
                        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#e8e0d4" />
                        <XAxis
                          dataKey="period_label"
                          tick={{ fontSize: 11, fill: "#7a6f65" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tickFormatter={(v: number) =>
                            v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`
                          }
                          tick={{ fontSize: 11, fill: "#7a6f65" }}
                          tickLine={false}
                          axisLine={false}
                          width={40}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "1px solid #e8e0d4",
                            fontSize: 12,
                          }}
                          content={({ active, payload, label }) => {
                            if (!active || !payload?.length) return null;
                            const d = payload[0]?.payload as SalesBucket;
                            return (
                              <div className="rounded-xl border border-sand/60 bg-white p-3 text-xs shadow-lg">
                                <p className="mb-1 font-semibold text-dusk">
                                  {label}
                                </p>
                                <p className="text-dusk">
                                  實收：＄
                                  {Math.round(d.net_total).toLocaleString(
                                    "zh-TW",
                                  )}
                                </p>
                                <p className="text-dusk/70">
                                  毛額：＄
                                  {Math.round(d.gross_total).toLocaleString(
                                    "zh-TW",
                                  )}
                                </p>
                                <p className="text-emerald-600">
                                  毛利：＄
                                  {Math.round(d.profit_total).toLocaleString(
                                    "zh-TW",
                                  )}
                                </p>
                                <p className="text-amber-600">
                                  折扣：＄
                                  {Math.round(d.discount_total).toLocaleString(
                                    "zh-TW",
                                  )}
                                </p>
                              </div>
                            );
                          }}
                        />
                        <Legend
                          iconType="circle"
                          iconSize={8}
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="net_total"
                          name="實收"
                          stroke="#4a3f35"
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          activeDot={{ r: 5 }}
                        />
                        <Line
                          type="monotone"
                          dataKey="gross_total"
                          name="毛額"
                          stroke="#b5a898"
                          strokeWidth={1.5}
                          strokeDasharray="4 2"
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>

                  {/* 長條圖：訂單數 & 件數 */}
                  <div className="rounded-2xl bg-white/85 p-5 shadow">
                    <h2 className="mb-4 text-base font-semibold text-dusk">
                      訂單數 & 件數（長條）
                    </h2>
                    <ResponsiveContainer width="100%" height={220}>
                      <BarChart
                        data={overviewState.data.timeseries}
                        margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
                        barCategoryGap="30%"
                        barGap={4}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="#e8e0d4"
                          vertical={false}
                        />
                        <XAxis
                          dataKey="period_label"
                          tick={{ fontSize: 11, fill: "#7a6f65" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 11, fill: "#7a6f65" }}
                          tickLine={false}
                          axisLine={false}
                          width={32}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{
                            borderRadius: "12px",
                            border: "1px solid #e8e0d4",
                            fontSize: 12,
                          }}
                          cursor={{ fill: "#f5f0eb", radius: 4 }}
                        />
                        <Legend
                          iconType="square"
                          iconSize={8}
                          wrapperStyle={{ fontSize: 12 }}
                        />
                        <Bar
                          dataKey="orders_count"
                          name="訂單數"
                          fill="#4a3f35"
                          radius={[4, 4, 0, 0]}
                        />
                        <Bar
                          dataKey="quantity"
                          name="件數"
                          fill="#b5a898"
                          radius={[4, 4, 0, 0]}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>
              )}

              <section className="grid gap-4 lg:grid-cols-3">
                <div className="rounded-2xl bg-white/85 p-5 shadow lg:col-span-2">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dusk">
                      營收走勢（{groupBy === "week" ? "週" : "日"}）
                    </h2>
                    <span className="text-xs text-dusk/60">
                      {formatDate(overviewState.data.start_date)} -{" "}
                      {formatDate(overviewState.data.end_date)} ·{" "}
                      {overviewState.data.timezone}
                    </span>
                  </div>
                  <div className="grid gap-3">
                    {overviewState.data.timeseries.length === 0 ? (
                      <p className="text-sm text-dusk/60">區間內沒有訂單</p>
                    ) : (
                      overviewState.data.timeseries.map(
                        (bucket: SalesBucket) => (
                          <div
                            key={bucket.period_label}
                            className="rounded-xl border border-sand/60 bg-sand/40 p-3"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-dusk">
                                  {bucket.period_label}
                                </p>
                                <p className="text-xs text-dusk/60">
                                  訂單 {bucket.orders_count} · 件數{" "}
                                  {bucket.quantity}
                                </p>
                              </div>
                              <div className="text-right text-dusk">
                                <p className="text-xl font-semibold">
                                  ＄{currency(bucket.net_total)}
                                </p>
                                <p className="text-xs text-dusk/60">
                                  毛利 {currency(bucket.profit_total)} · 折扣{" "}
                                  {currency(bucket.discount_total)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 h-2 rounded-full bg-white/80">
                              <div
                                className="h-2 rounded-full bg-dusk transition-all"
                                style={{
                                  width: `${Math.min(100, (bucket.net_total / Math.max(1, overviewState.data!.summary.net_total)) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        ),
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-2xl bg-white/85 p-5 shadow">
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-dusk">
                      付款方式
                    </h2>
                    <span className="text-xs text-dusk/60">按淨額</span>
                  </div>
                  <div className="space-y-3">
                    {overviewState.data.payment_breakdown.length === 0 && (
                      <p className="text-sm text-dusk/60">無資料</p>
                    )}
                    {overviewState.data.payment_breakdown.map((item) => (
                      <div
                        key={item.method}
                        className="flex items-center justify-between rounded-xl bg-sand/50 p-3"
                      >
                        <div>
                          <p className="font-semibold text-dusk">
                            {item.method}
                          </p>
                          <p className="text-xs text-dusk/60">
                            訂單 {item.orders_count}
                          </p>
                        </div>
                        <p className="text-lg font-semibold text-dusk">
                          ＄{currency(item.net_total)}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl bg-white/90 p-5 shadow">
                <div className="mb-4 flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-lg font-semibold text-dusk">Top SKU</h2>
                    <p className="text-xs text-dusk/60">
                      按照銷售數量排行 ·{" "}
                      {topSkuMerge ? "同款合併" : "依變體（顏色/尺寸）"}
                    </p>
                  </div>
                  <div className="flex shrink-0 rounded-xl border border-sand/60 p-0.5 text-xs">
                    <button
                      type="button"
                      className={clsx(
                        "rounded-lg px-3 py-1.5 transition-colors",
                        !topSkuMerge
                          ? "bg-dusk text-white"
                          : "text-dusk/60 hover:text-dusk",
                      )}
                      onClick={() => {
                        setTopSkuMerge(false);
                        loadAnalytics(false);
                      }}
                      disabled={overviewState.loading}
                    >
                      變體
                    </button>
                    <button
                      type="button"
                      className={clsx(
                        "rounded-lg px-3 py-1.5 transition-colors",
                        topSkuMerge
                          ? "bg-dusk text-white"
                          : "text-dusk/60 hover:text-dusk",
                      )}
                      onClick={() => {
                        setTopSkuMerge(true);
                        loadAnalytics(true);
                      }}
                      disabled={overviewState.loading}
                    >
                      合併
                    </button>
                  </div>
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
                      {overviewState.data.top_products.map((item) => (
                        <tr
                          key={item.product_id}
                          className="border-t border-sand/50"
                        >
                          <td className="py-2 font-semibold">
                            {formatSku(item.sku)}
                          </td>
                          <td className="py-2">
                            {item.name}
                            {(item.color || item.size) && (
                              <span className="ml-1 text-xs text-dusk/50">
                                （
                                {[item.color, item.size]
                                  .filter(Boolean)
                                  .join(" / ")}
                                ）
                              </span>
                            )}
                          </td>
                          <td className="py-2">{item.quantity}</td>
                          <td className="py-2">
                            ＄{currency(item.gross_total)}
                          </td>
                          <td className="py-2 text-amber-700">
                            -＄{currency(item.discount_total)}
                          </td>
                          <td className="py-2 font-semibold text-dusk">
                            ＄{currency(item.net_total)}
                          </td>
                          <td className="py-2 text-emerald-700">
                            ＄{currency(item.profit_total)}
                          </td>
                        </tr>
                      ))}
                      {overviewState.data.top_products.length === 0 && (
                        <tr>
                          <td
                            colSpan={7}
                            className="py-4 text-center text-dusk/60"
                          >
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
        </>
      )}

      {/* ═══════════════ 單品銷量 ═══════════════ */}
      {activeTab === "products" && (
        <section className="rounded-2xl bg-white/90 p-5 shadow">
          <div className="mb-4 flex flex-col gap-3">
            <div>
              <h2 className="text-lg font-semibold text-dusk">單品銷量統計</h2>
              <p className="text-xs text-dusk/60">
                依商品 × 顏色 ×
                尺寸拆分，預設顯示全部歷史資料。可篩選日期區間或搜尋特定商品。
              </p>
            </div>
            {/* Filters */}
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-sm text-dusk/70">
                起始（選填）
                <input
                  type="date"
                  className="input-date"
                  value={productStartDate}
                  onChange={(e) => setProductStartDate(e.target.value)}
                />
              </label>
              <label className="flex flex-col text-sm text-dusk/70">
                結束（選填）
                <input
                  type="date"
                  className="input-date"
                  value={productEndDate}
                  onChange={(e) => setProductEndDate(e.target.value)}
                />
              </label>
              <input
                type="text"
                placeholder="搜尋名稱 / SKU"
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProductSearch()}
                className="rounded-full border border-sand/60 bg-white/80 px-3 py-1.5 text-sm text-dusk placeholder-dusk/40 outline-none focus:border-dusk/50"
              />
              <button
                onClick={handleProductSearch}
                disabled={productState.loading}
                className="rounded-full bg-dusk px-4 py-1.5 text-sm font-semibold text-amber-50 shadow-sm transition hover:translate-y-[-1px] hover:shadow disabled:opacity-60"
              >
                搜尋
              </button>
              {(productQ || productStartDate || productEndDate) && (
                <button
                  onClick={() => {
                    setProductQ("");
                    setProductStartDate("");
                    setProductEndDate("");
                    setProductPage(1);
                    loadProductStats(1, "", "", "");
                  }}
                  className="rounded-full border border-dusk/20 px-3 py-1.5 text-sm text-dusk/60 hover:text-dusk"
                >
                  清除篩選
                </button>
              )}
            </div>

            {productState.data && (
              <p className="text-xs text-dusk/50">
                共 {productState.data.total} 筆規格資料
                {!productStartDate && !productEndDate ? "（全部歷史）" : ""}
              </p>
            )}
          </div>

          {productState.error && (
            <p className="mb-3 text-sm text-red-600">{productState.error}</p>
          )}

          {productState.loading && (
            <table className="min-w-full text-sm">
              <tbody>
                <SkeletonTableRows rows={5} cols={4} />
              </tbody>
            </table>
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
                  {productState.data?.data.map(
                    (item: ProductSalesRow, idx: number) => (
                      <tr
                        key={`${item.product_id}-${item.color ?? ""}-${item.size ?? ""}-${idx}`}
                        className="border-t border-sand/50"
                      >
                        <td className="py-2 font-semibold">
                          {formatSku(item.sku)}
                        </td>
                        <td className="py-2">{item.name}</td>
                        <td className="py-2 text-dusk/70">
                          {item.color ?? "—"}
                        </td>
                        <td className="py-2 text-dusk/70">
                          {item.size ?? "—"}
                        </td>
                        <td className="py-2 text-right">{item.quantity}</td>
                        <td className="py-2 text-right">
                          ＄{currency(item.gross_total)}
                        </td>
                        <td className="py-2 text-right text-amber-700">
                          {item.discount_total > 0
                            ? `-＄${currency(item.discount_total)}`
                            : "—"}
                        </td>
                        <td className="py-2 text-right font-semibold">
                          ＄{currency(item.net_total)}
                        </td>
                        <td className="py-2 text-right text-emerald-700">
                          ＄{currency(item.profit_total)}
                        </td>
                      </tr>
                    ),
                  )}
                  {(!productState.data ||
                    productState.data.data.length === 0) && (
                    <tr>
                      <td colSpan={9} className="py-4 text-center text-dusk/60">
                        查無符合條件的商品
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
                第 {productPage} / {productTotalPages} 頁
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
                  disabled={
                    productPage >= productTotalPages || productState.loading
                  }
                  className="rounded-full border border-dusk/20 px-3 py-1 text-xs hover:border-dusk/50 disabled:opacity-40"
                >
                  下一頁
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  prefix = "＄",
}: {
  label: string;
  value: number;
  prefix?: string;
}) {
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
      <p className="text-xs uppercase tracking-wide text-dusk/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-dusk">
        {prefix}
        {currency(value)}
      </p>
    </div>
  );
}
