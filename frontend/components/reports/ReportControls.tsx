"use client";

import clsx from "clsx";
import { ReactNode, useState } from "react";
import { DatePickerField } from "@/components/DatePickerField";
import { formatMoney } from "@/lib/format";
import { DateRange, PRESETS, PresetKey, matchPreset, percentChange, presetRange } from "./dateRange";

// ── Range bar: preset chips + custom start / end ───────────────────────────

interface RangeBarProps {
  value: DateRange | null;
  onChange: (range: DateRange | null) => void;
  /** Adds a "全部期間" chip that clears the range (value = null). */
  allowAll?: boolean;
  children?: ReactNode;
}

const chipBase =
  "min-h-[36px] rounded-full border px-3.5 text-[13px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clay/40";

export function RangeBar({ value, onChange, allowAll, children }: RangeBarProps) {
  const active: PresetKey | "all" | null = value ? matchPreset(value) : allowAll ? "all" : null;

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {allowAll && (
          <button
            type="button"
            className={clsx(
              chipBase,
              active === "all"
                ? "border-dusk bg-dusk text-white"
                : "border-sand/60 bg-white text-dusk hover:bg-linen",
            )}
            onClick={() => onChange(null)}
            aria-pressed={active === "all"}
          >
            全部期間
          </button>
        )}
        {PRESETS.map((preset) => (
          <button
            key={preset.key}
            type="button"
            className={clsx(
              chipBase,
              active === preset.key
                ? "border-dusk bg-dusk text-white"
                : "border-sand/60 bg-white text-dusk hover:bg-linen",
            )}
            onClick={() => onChange(presetRange(preset.key))}
            aria-pressed={active === preset.key}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <DatePickerField
          className="w-40"
          value={value?.start ?? ""}
          placeholder="起始日期"
          onChange={(start) => {
            if (!start) return;
            onChange({ start, end: value?.end && value.end >= start ? value.end : start });
          }}
        />
        <span className="text-dusk/50">–</span>
        <DatePickerField
          className="w-40"
          value={value?.end ?? ""}
          placeholder="結束日期"
          onChange={(end) => {
            if (!end) return;
            onChange({ start: value?.start && value.start <= end ? value.start : end, end });
          }}
        />
      </div>
      {children}
    </div>
  );
}

// ── Export button ──────────────────────────────────────────────────────────

function DownloadIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 4v11M7 10l5 5 5-5M5 20h14" />
    </svg>
  );
}

export function ExportButton({
  label = "匯出 Excel",
  onExport,
}: {
  label?: string;
  onExport: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function handleClick() {
    setBusy(true);
    setFailed(false);
    try {
      await onExport();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={clsx(
        "inline-flex min-h-[44px] items-center gap-2 rounded-xl border bg-white px-4 text-sm transition-colors hover:bg-linen/80 disabled:opacity-60",
        failed ? "border-clay/60 text-clay" : "border-sand/60 text-dusk",
      )}
      title={failed ? "匯出失敗，請再試一次" : undefined}
    >
      <DownloadIcon />
      {busy ? "產生中…" : failed ? "匯出失敗，重試" : label}
    </button>
  );
}

// ── KPI card with optional comparison ──────────────────────────────────────

type KpiFormat = "money" | "number" | "percent";

function formatValue(value: number, format: KpiFormat): string {
  if (format === "money") return formatMoney(value);
  if (format === "percent") return `${(value * 100).toFixed(1)}%`;
  return Math.round(value).toLocaleString("zh-TW");
}

export function KpiCard({
  label,
  value,
  format = "money",
  previous,
  hint,
}: {
  label: string;
  value: number;
  format?: KpiFormat;
  /** Value of the previous period; shows a ▲ / ▼ change line when given. */
  previous?: number | null;
  hint?: string;
}) {
  const hasPrevious = previous !== undefined && previous !== null;
  // Shares are compared in percentage points; everything else as a relative change.
  const change = !hasPrevious
    ? previous === null
      ? null
      : undefined
    : format === "percent"
      ? value - (previous as number)
      : percentChange(value, previous as number);
  return (
    <div className="rounded-2xl bg-white/80 p-4 shadow-sm">
      <p className="text-xs text-dusk/60">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-dusk">{formatValue(value, format)}</p>
      {change !== undefined && (
        <p className="mt-1 text-xs tabular-nums text-dusk/60">
          {change === null ? (
            <>上一期無資料</>
          ) : (
            <>
              <span className={change >= 0 ? "text-moss" : "text-clay"}>
                {change >= 0 ? "▲" : "▼"} {Math.abs(change * 100).toFixed(1)}
                {format === "percent" ? " 個百分點" : "%"}
              </span>{" "}
              vs 上一期 {formatValue(previous as number, format)}
            </>
          )}
        </p>
      )}
      {hint && change === undefined && <p className="mt-1 text-xs text-dusk/60">{hint}</p>}
    </div>
  );
}

// ── Small segmented control ────────────────────────────────────────────────

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label?: string;
}) {
  return (
    <div className="inline-flex rounded-xl border border-sand/60 bg-white p-0.5" role="group" aria-label={label}>
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          aria-pressed={opt.value === value}
          onClick={() => onChange(opt.value)}
          className={clsx(
            "min-h-[34px] rounded-lg px-3 text-xs font-semibold transition-colors",
            opt.value === value ? "bg-dusk text-white" : "text-dusk/60 hover:text-dusk",
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
