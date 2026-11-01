"use client";

import { useCallback, useEffect, useState } from "react";
import { SkeletonStatCards, SkeletonTableRows } from "@/components/ui/Skeleton";
import { apiClient, downloadFile, InventoryReportResponse } from "@/lib/api";
import { formatDateLocal, formatMoney, formatSku } from "@/lib/format";
import { ExportButton, KpiCard, Segmented } from "./ReportControls";
import { toISODate } from "./dateRange";

const STALE_OPTIONS = [
  { value: 60, label: "60 天" },
  { value: 90, label: "90 天" },
  { value: 180, label: "180 天" },
];

const th = "px-3 py-3 font-medium";
const td = "px-3 py-2.5";

function variant(color?: string | null, size?: string | null) {
  return [color, size].filter(Boolean).join(" / ") || "-";
}

export function InventoryReport() {
  const [staleDays, setStaleDays] = useState(90);
  const [data, setData] = useState<InventoryReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (days: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<InventoryReportResponse>("/api/analytics/inventory", {
        params: { stale_days: days },
      });
      setData(res.data);
    } catch {
      setError("無法載入庫存報表，請稍後再試");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(staleDays);
  }, [load, staleDays]);

  const s = data?.summary;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-dusk/70">以目前庫存與成本計算，不受日期區間影響。</p>
        <ExportButton
          onExport={() =>
            downloadFile(
              "/api/analytics/export/inventory",
              { stale_days: staleDays },
              `庫存報表_${toISODate(new Date()).replaceAll("-", "")}.xlsx`,
            )
          }
        />
      </div>

      {error && <div className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">{error}</div>}

      {loading && !data ? (
        <section className="grid gap-4 md:grid-cols-4">
          <SkeletonStatCards count={4} />
        </section>
      ) : (
        s && (
          <section className="grid gap-4 md:grid-cols-4">
            <KpiCard label="有庫存品項" value={s.items_in_stock} format="number" hint={`共 ${s.units_in_stock.toLocaleString("zh-TW")} 件`} />
            <KpiCard label="庫存成本" value={s.cost_value} hint="依目前成本計算" />
            <KpiCard
              label={`滯銷品項（${data?.stale_days} 天未售）`}
              value={s.stale_items}
              format="number"
              hint={`庫存成本 ${formatMoney(s.stale_cost_value)}`}
            />
            <KpiCard
              label={`低庫存（≤ ${data?.low_stock_max} 件）`}
              value={s.low_stock_items}
              format="number"
              hint={`近 ${data?.recent_days} 天賣出 ≥ ${data?.min_sold_recent} 件`}
            />
          </section>
        )
      )}

      {/* 滯銷商品 */}
      <section className="rounded-2xl bg-white/85 p-5 shadow">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-dusk">滯銷商品</h2>
            <p className="text-xs text-dusk/60">
              有庫存、且超過 {staleDays} 天沒有賣出（從未賣出則從首次入庫起算），未動最久的排最前面。
            </p>
          </div>
          <Segmented label="滯銷天數" options={STALE_OPTIONS} value={staleDays} onChange={setStaleDays} />
        </div>
        <div className="max-h-[560px] overflow-auto">
          <table className="w-full min-w-[860px] whitespace-nowrap text-sm text-dusk">
            <thead className="sticky top-0 z-[1] border-b border-sand/40 bg-[#FDFCFB] text-left text-xs text-dusk/70">
              <tr>
                <th className={th}>商品</th>
                <th className={th}>顏色 / 尺寸</th>
                <th className={th}>廠商</th>
                <th className={`${th} text-right`}>庫存</th>
                <th className={`${th} text-right`}>庫存成本</th>
                <th className={th}>首次入庫</th>
                <th className={th}>最後售出</th>
                <th className={`${th} text-right`}>未動天數</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={6} cols={8} />
              ) : data && data.stale.length > 0 ? (
                data.stale.map((row) => (
                  <tr key={row.product_id} className="border-t border-sand/30 first:border-t-0 hover:bg-linen/40">
                    <td className={td}>
                      <p className="font-medium">{row.name}</p>
                      <p className="text-xs text-dusk/60">{formatSku(row.sku)}</p>
                    </td>
                    <td className={td}>{variant(row.color, row.size)}</td>
                    <td className={td}>{row.vendor_name}</td>
                    <td className={`${td} text-right tabular-nums`}>{row.stock}</td>
                    <td className={`${td} text-right tabular-nums`}>{formatMoney(row.cost_value)}</td>
                    <td className={`${td} tabular-nums`}>{formatDateLocal(row.first_stocked_at)}</td>
                    <td className={`${td} tabular-nums`}>
                      {row.last_sold_at ? formatDateLocal(row.last_sold_at) : <span className="text-clay">從未售出</span>}
                    </td>
                    <td className={`${td} text-right font-semibold tabular-nums`}>{row.idle_days} 天</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-dusk/60">目前沒有滯銷商品</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.summary.stale_items > data.stale.length && (
          <p className="mt-3 text-xs text-dusk/60">
            畫面顯示前 {data.stale.length} 筆，共 {data.summary.stale_items} 筆；完整清單請匯出 Excel。
          </p>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,3fr),minmax(0,2fr)]">
        {/* 低庫存 */}
        <section className="rounded-2xl bg-white/85 p-5 shadow">
          <h2 className="text-lg font-semibold text-dusk">低庫存</h2>
          <p className="mb-3 text-xs text-dusk/60">
            庫存 ≤ {data?.low_stock_max ?? 1} 件，且近 {data?.recent_days ?? 28} 天賣出 ≥ {data?.min_sold_recent ?? 2} 件，可考慮補貨。
          </p>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full min-w-[520px] whitespace-nowrap text-sm text-dusk">
              <thead className="sticky top-0 border-b border-sand/40 bg-[#FDFCFB] text-left text-xs text-dusk/70">
                <tr>
                  <th className={th}>商品</th>
                  <th className={th}>顏色 / 尺寸</th>
                  <th className={`${th} text-right`}>庫存</th>
                  <th className={`${th} text-right`}>近期售出</th>
                  <th className={th}>最後售出</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={5} cols={5} />
                ) : data && data.low_stock.length > 0 ? (
                  data.low_stock.map((row) => (
                    <tr key={row.product_id} className="border-t border-sand/30 first:border-t-0 hover:bg-linen/40">
                      <td className={td}>
                        <p className="font-medium">{row.name}</p>
                        <p className="text-xs text-dusk/60">{row.vendor_name}</p>
                      </td>
                      <td className={td}>{variant(row.color, row.size)}</td>
                      <td className={`${td} text-right tabular-nums ${row.stock === 0 ? "font-semibold text-clay" : ""}`}>
                        {row.stock}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{row.sold_recent}</td>
                      <td className={`${td} tabular-nums`}>{formatDateLocal(row.last_sold_at)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-3 py-10 text-center text-dusk/60">目前沒有低庫存商品</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* 依廠商 */}
        <section className="rounded-2xl bg-white/85 p-5 shadow">
          <h2 className="mb-3 text-lg font-semibold text-dusk">庫存成本（依廠商）</h2>
          <div className="max-h-[420px] overflow-auto">
            <table className="w-full whitespace-nowrap text-sm text-dusk">
              <thead className="sticky top-0 border-b border-sand/40 bg-[#FDFCFB] text-left text-xs text-dusk/70">
                <tr>
                  <th className={th}>廠商</th>
                  <th className={`${th} text-right`}>品項</th>
                  <th className={`${th} text-right`}>件數</th>
                  <th className={`${th} text-right`}>庫存成本</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <SkeletonTableRows rows={5} cols={4} />
                ) : (
                  data?.by_vendor.map((row) => (
                    <tr key={row.vendor_name} className="border-t border-sand/30 first:border-t-0">
                      <td className={td}>{row.vendor_name}</td>
                      <td className={`${td} text-right tabular-nums`}>{row.items}</td>
                      <td className={`${td} text-right tabular-nums`}>{row.units}</td>
                      <td className={`${td} text-right tabular-nums`}>{formatMoney(row.cost_value)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
