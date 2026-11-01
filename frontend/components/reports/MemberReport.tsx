"use client";

import { useCallback, useEffect, useState } from "react";
import { SkeletonStatCards, SkeletonTableRows } from "@/components/ui/Skeleton";
import { apiClient, downloadFile, MemberReportResponse } from "@/lib/api";
import { formatDateTime, formatMoney, formatPhone } from "@/lib/format";
import { ExportButton, KpiCard, RangeBar } from "./ReportControls";
import { DateRange, presetRange, previousRange, rangeLabel, rangeSlug } from "./dateRange";

const th = "px-3 py-3 font-medium";
const td = "px-3 py-2.5";

export function MemberReport() {
  const [range, setRange] = useState<DateRange>(() => presetRange("last28"));
  const [data, setData] = useState<MemberReportResponse | null>(null);
  const [previous, setPrevious] = useState<MemberReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (r: DateRange) => {
    setLoading(true);
    setError(null);
    try {
      const prev = previousRange(r);
      const [current, before] = await Promise.all([
        apiClient.get<MemberReportResponse>("/api/analytics/members", {
          params: { start_date: r.start, end_date: r.end, limit: 20 },
        }),
        apiClient.get<MemberReportResponse>("/api/analytics/members", {
          params: { start_date: prev.start, end_date: prev.end, limit: 1 },
        }),
      ]);
      setData(current.data);
      setPrevious(before.data);
    } catch {
      setError("無法載入會員報表，請稍後再試");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  const s = data?.summary;
  const p = previous?.summary;

  return (
    <div className="flex flex-col gap-6">
      <RangeBar value={range} onChange={(r) => r && setRange(r)} />
      <div className="-mt-2 flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-dusk/60">
          {rangeLabel(range)}，與上一期 {rangeLabel(previousRange(range))} 比較
        </p>
        <ExportButton
          onExport={() =>
            downloadFile(
              "/api/analytics/export/members",
              { start_date: range.start, end_date: range.end },
              `會員報表_${rangeSlug(range)}.xlsx`,
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
            <KpiCard label="會員營收占比" value={s.member_share} format="percent" previous={p?.member_share} />
            <KpiCard label="會員營收" value={s.member_net} previous={p?.member_net} />
            <KpiCard label="消費會員數" value={s.active_members} format="number" previous={p?.active_members} />
            <KpiCard label="新會員" value={s.new_members} format="number" previous={p?.new_members} />
          </section>
        )
      )}

      <section className="rounded-2xl bg-white/85 p-5 shadow">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-semibold text-dusk">會員消費排行</h2>
          <span className="text-xs text-dusk/60">
            {rangeLabel(range)}
            {s && ` · 會員訂單 ${s.member_orders} / 全部 ${s.total_orders} 筆`}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] whitespace-nowrap text-sm text-dusk">
            <thead className="border-b border-sand/40 text-left text-xs text-dusk/70">
              <tr>
                <th className={`${th} w-12 text-right`}>#</th>
                <th className={th}>會員</th>
                <th className={th}>電話</th>
                <th className={`${th} text-right`}>訂單數</th>
                <th className={`${th} text-right`}>消費淨額</th>
                <th className={th}>最近消費</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <SkeletonTableRows rows={6} cols={6} />
              ) : data && data.top_members.length > 0 ? (
                data.top_members.map((m, idx) => (
                  <tr key={m.member_id} className="border-t border-sand/30 first:border-t-0 hover:bg-linen/40">
                    <td className={`${td} text-right tabular-nums text-dusk/60`}>{idx + 1}</td>
                    <td className={td}>
                      <p className="font-medium">{m.name}</p>
                      {m.member_code && <p className="font-mono text-xs text-dusk/60">{m.member_code}</p>}
                    </td>
                    <td className={`${td} tabular-nums`}>{formatPhone(m.phone)}</td>
                    <td className={`${td} text-right tabular-nums`}>{m.orders_count}</td>
                    <td className={`${td} text-right font-semibold tabular-nums`}>{formatMoney(m.net_total)}</td>
                    <td className={`${td} tabular-nums`}>{formatDateTime(m.last_order_at)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-3 py-10 text-center text-dusk/60">這段期間沒有會員消費</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {data && data.top_members.length > 0 && (
          <p className="mt-3 text-xs text-dusk/60">顯示前 {data.top_members.length} 名；完整名單請匯出 Excel。</p>
        )}
      </section>
    </div>
  );
}
