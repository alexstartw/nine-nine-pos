"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { formatSku, formatMoney, formatPaymentMethod } from "@/lib/format";
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
  downloadFile,
  ProductSalesRow,
  ProductSalesStatsResponse,
  SalesAnalyticsResponse,
  SalesBucket,
  SalesGroupBy,
} from "@/lib/api";
import { SelectField } from "@/components/SelectField";
import { InventoryReport } from "@/components/reports/InventoryReport";
import { MemberReport } from "@/components/reports/MemberReport";
import { ExportButton, KpiCard, RangeBar } from "@/components/reports/ReportControls";
import {
  DateRange,
  presetRange,
  previousRange,
  rangeLabel,
  rangeSlug,
  toISODate,
} from "@/components/reports/dateRange";

type Tab = "overview" | "products" | "inventory" | "members";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "銷售總覽" },
  { key: "products", label: "單品銷量" },
  { key: "inventory", label: "庫存" },
  { key: "members", label: "會員" },
];

const GROUP_LABELS: Record<SalesGroupBy, string> = { day: "日", week: "週", month: "月" };

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

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("zh-TW", {
    month: "2-digit",
    day: "2-digit",
  });

export default function SalesAnalyticsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("overview");

  // ── 銷售總覽 state ──────────────────────────────────────
  const [range, setRange] = useState<DateRange>(() => presetRange("last28"));
  const [groupBy, setGroupBy] = useState<SalesGroupBy>("week");
  const [compare, setCompare] = useState(true);
  const [previousSummary, setPreviousSummary] = useState<
    SalesAnalyticsResponse["summary"] | null
  >(null);
  // Top SKU 顯示模式：false=變體粒度（標出顏色/尺寸），true=同款合併
  const [topSkuMerge, setTopSkuMerge] = useState(false);
  const [overviewState, setOverviewState] = useState<FetchState>({
    loading: true,
    error: null,
    data: null,
  });

  // ── 單品銷量 state ──────────────────────────────────────
  const [productQ, setProductQ] = useState("");
  // null = 全部期間
  const [productRange, setProductRange] = useState<DateRange | null>(null);
  const [productPage, setProductPage] = useState(1);
  const PRODUCT_PAGE_SIZE = 20;
  const [productState, setProductState] = useState<ProductStatsState>({
    loading: true,
    error: null,
    data: null,
  });

  // ── 銷售總覽 load ───────────────────────────────────────
  async function loadAnalytics(
    merge = topSkuMerge,
    r: DateRange = range,
    g: SalesGroupBy = groupBy,
    withCompare: boolean = compare,
  ) {
    setOverviewState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const prev = previousRange(r);
      const [{ data }, previousData] = await Promise.all([
        apiClient.get<SalesAnalyticsResponse>("/api/analytics/sales", {
          params: {
            start_date: r.start,
            end_date: r.end,
            group_by: g,
            top_limit: 12,
            merge_variants: merge,
          },
        }),
        withCompare
          ? apiClient.get<SalesAnalyticsResponse>("/api/analytics/sales", {
              params: { start_date: prev.start, end_date: prev.end, group_by: g, top_limit: 1 },
            })
          : Promise.resolve(null),
      ]);
      setPreviousSummary(previousData ? previousData.data.summary : null);
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
    async (page: number, q: string, r: DateRange | null) => {
      setProductState((prev) => ({ ...prev, loading: true, error: null }));
      try {
        const params: Record<string, string | number> = {
          page,
          size: PRODUCT_PAGE_SIZE,
        };
        if (q) params.q = q;
        if (r) {
          params.start_date = r.start;
          params.end_date = r.end;
        }
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
    loadProductStats(1, "", null);
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

  const previousAvgOrderValue = useMemo(() => {
    if (!previousSummary?.orders_count) return previousSummary ? 0 : null;
    return Math.round(previousSummary.net_total / previousSummary.orders_count);
  }, [previousSummary]);

  function handleProductSearch() {
    setProductPage(1);
    loadProductStats(1, productQ, productRange);
  }

  function handleProductPageChange(next: number) {
    setProductPage(next);
    loadProductStats(next, productQ, productRange);
  }

  function changeRange(next: DateRange) {
    setRange(next);
    loadAnalytics(topSkuMerge, next);
  }

  function changeGroupBy(next: SalesGroupBy) {
    setGroupBy(next);
    loadAnalytics(topSkuMerge, range, next);
  }

  function changeCompare(next: boolean) {
    setCompare(next);
    loadAnalytics(topSkuMerge, range, groupBy, next);
  }

  function changeProductRange(next: DateRange | null) {
    setProductRange(next);
    setProductPage(1);
    loadProductStats(1, productQ, next);
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
      <div className="flex w-fit gap-1 rounded-xl bg-white/60 p-1 shadow-sm" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              activeTab === tab.key
                ? "bg-dusk text-amber-50 shadow"
                : "text-dusk/60 hover:text-dusk"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ═══════════════ 銷售總覽 ═══════════════ */}
      {activeTab === "overview" && (
        <>
          {/* Controls */}
          <div>
            <RangeBar value={range} onChange={(r) => r && changeRange(r)}>
              <SelectField
                className="w-28"
                aria-label="粒度"
                value={groupBy}
                onChange={(e) => changeGroupBy(e.target.value as SalesGroupBy)}
              >
                <option value="day">每日</option>
                <option value="week">每週</option>
                <option value="month">每月</option>
              </SelectField>
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-sm text-dusk/70">
                <input
                  type="checkbox"
                  className="h-[18px] w-[18px] cursor-pointer accent-dusk"
                  checked={compare}
                  onChange={(e) => changeCompare(e.target.checked)}
                />
                與上一期比較
              </label>
            </RangeBar>
          </div>
          <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-dusk/60">
              {rangeLabel(range)}
              {compare && `，與上一期 ${rangeLabel(previousRange(range))} 比較`}
            </p>
            <div className="flex flex-wrap gap-2">
              <ExportButton
                label="匯出報表"
                onExport={() =>
                  downloadFile(
                    "/api/analytics/export/sales",
                    {
                      start_date: range.start,
                      end_date: range.end,
                      group_by: groupBy,
                      merge_variants: topSkuMerge,
                    },
                    `銷售總覽_${rangeSlug(range)}.xlsx`,
                  )
                }
              />
              <ExportButton
                label="匯出訂單明細"
                onExport={() =>
                  downloadFile(
                    "/api/analytics/export/orders",
                    { start_date: range.start, end_date: range.end },
                    `訂單明細_${rangeSlug(range)}.xlsx`,
                  )
                }
              />
            </div>
          </div>

          {overviewState.error && (
            <div className="rounded-xl bg-white/80 p-4 text-sm text-clay shadow">
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
                <KpiCard
                  label="營收 (NET)"
                  value={overviewState.data.summary.net_total}
                  previous={compare ? previousSummary?.net_total ?? null : undefined}
                />
                <KpiCard
                  label="毛利"
                  value={overviewState.data.summary.profit_total}
                  previous={compare ? previousSummary?.profit_total ?? null : undefined}
                />
                <KpiCard
                  label="平均客單"
                  value={avgOrderValue}
                  previous={compare ? previousAvgOrderValue : undefined}
                />
                <KpiCard
                  label="訂單數"
                  value={overviewState.data.summary.orders_count}
                  format="number"
                  previous={compare ? previousSummary?.orders_count ?? null : undefined}
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
                                  實收：
                                  {formatMoney(d.net_total)}
                                </p>
                                <p className="text-dusk/70">
                                  毛額：
                                  {formatMoney(d.gross_total)}
                                </p>
                                <p className="text-moss">
                                  毛利：
                                  {formatMoney(d.profit_total)}
                                </p>
                                <p className="text-clay">
                                  折扣：
                                  {formatMoney(d.discount_total)}
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
                      營收走勢（{GROUP_LABELS[groupBy]}）
                    </h2>
                    <span className="text-xs text-dusk/60">
                      {formatDate(overviewState.data.start_date)} -{" "}
                      {formatDate(overviewState.data.end_date)} ·{" "}
                      {overviewState.data.timezone}
                    </span>
                  </div>
                  <div className="divide-y divide-sand/40">
                    {overviewState.data.timeseries.length === 0 ? (
                      <p className="text-sm text-dusk/60">區間內沒有訂單</p>
                    ) : (
                      overviewState.data.timeseries.map(
                        (bucket: SalesBucket) => (
                          <div
                            key={bucket.period_label}
                            className="py-3 first:pt-0 last:pb-0"
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
                                  {formatMoney(bucket.net_total)}
                                </p>
                                <p className="text-xs text-dusk/60">
                                  毛利 {formatMoney(bucket.profit_total)} · 折扣{" "}
                                  {formatMoney(bucket.discount_total)}
                                </p>
                              </div>
                            </div>
                            <div className="mt-2 h-1.5 rounded-full bg-sand/30">
                              <div
                                className="h-1.5 rounded-full bg-dusk transition-all"
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
                  <div className="divide-y divide-sand/40">
                    {overviewState.data.payment_breakdown.length === 0 && (
                      <p className="text-sm text-dusk/60">無資料</p>
                    )}
                    {overviewState.data.payment_breakdown.map((item) => (
                      <div
                        key={item.method}
                        className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                      >
                        <div>
                          <p className="font-semibold text-dusk">
                            {formatPaymentMethod(item.method)}
                          </p>
                          <p className="text-xs text-dusk/60">
                            訂單 {item.orders_count}
                          </p>
                        </div>
                        <p className="text-lg font-semibold text-dusk">
                          {formatMoney(item.net_total)}
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
                            {formatMoney(item.gross_total)}
                          </td>
                          <td className="py-2 text-clay">
                            -{formatMoney(item.discount_total)}
                          </td>
                          <td className="py-2 font-semibold text-dusk">
                            {formatMoney(item.net_total)}
                          </td>
                          <td className="py-2 text-moss">
                            {formatMoney(item.profit_total)}
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
            <RangeBar value={productRange} onChange={changeProductRange} allowAll />
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                aria-label="搜尋名稱 / SKU"
                placeholder="搜尋名稱 / SKU"
                value={productQ}
                onChange={(e) => setProductQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleProductSearch()}
                className="min-h-[44px] w-full max-w-xs rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk"
              />
              <button
                onClick={handleProductSearch}
                disabled={productState.loading}
                className="min-h-[44px] rounded-xl bg-dusk px-5 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
              >
                搜尋
              </button>
              {(productQ || productRange) && (
                <button
                  onClick={() => {
                    setProductQ("");
                    setProductRange(null);
                    setProductPage(1);
                    loadProductStats(1, "", null);
                  }}
                  className="min-h-[44px] rounded-xl border border-sand/60 px-4 text-sm text-dusk hover:bg-linen/80"
                >
                  清除篩選
                </button>
              )}
              <div className="ml-auto">
                <ExportButton
                  onExport={() =>
                    downloadFile(
                      "/api/analytics/export/products",
                      {
                        start_date: productRange?.start,
                        end_date: productRange?.end,
                        q: productQ.trim() || undefined,
                      },
                      `單品銷量_${productRange ? rangeSlug(productRange) : `全部_${toISODate(new Date()).replaceAll("-", "")}`}.xlsx`,
                    )
                  }
                />
              </div>
            </div>

            {productState.data && (
              <p className="text-xs text-dusk/50">
                共 {productState.data.total} 筆規格資料
                {productRange ? `（${rangeLabel(productRange)}）` : "（全部歷史）"}
              </p>
            )}
          </div>

          {productState.error && (
            <p className="mb-3 text-sm text-clay">{productState.error}</p>
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
                          {formatMoney(item.gross_total)}
                        </td>
                        <td className="py-2 text-right text-clay">
                          {item.discount_total > 0
                            ? `-${formatMoney(item.discount_total)}`
                            : "—"}
                        </td>
                        <td className="py-2 text-right font-semibold">
                          {formatMoney(item.net_total)}
                        </td>
                        <td className="py-2 text-right text-moss">
                          {formatMoney(item.profit_total)}
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

      {/* ═══════════════ 庫存 ═══════════════ */}
      {activeTab === "inventory" && <InventoryReport />}

      {/* ═══════════════ 會員 ═══════════════ */}
      {activeTab === "members" && <MemberReport />}
    </div>
  );
}
