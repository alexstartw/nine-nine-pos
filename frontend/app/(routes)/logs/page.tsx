"use client";

import { useEffect, useState } from "react";
import {
  apiClient,
  AppLog,
  extractApiError,
  PaginatedResponse,
} from "@/lib/api";
import { PaginationControls } from "@/components/PaginationControls";
import { formatDateTime } from "@/lib/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const PAGE_SIZE = 50;

export default function LogsPage() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [clearing, setClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);

  async function fetchLogs(p = 1) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PaginatedResponse<AppLog>>(
        "/api/admin/logs",
        { params: { page: p, size: PAGE_SIZE } },
      );
      setLogs(data.data);
      setTotal(data.total);
      setPage(p);
    } catch (err) {
      setError(extractApiError(err, "載入失敗"));
    } finally {
      setLoading(false);
    }
  }

  async function handleClear() {
    setClearing(true);
    try {
      await apiClient.delete("/api/admin/logs");
      setLogs([]);
      setTotal(0);
      setPage(1);
      setConfirmClear(false);
    } catch (err) {
      setConfirmClear(false);
      setError(extractApiError(err, "清除失敗"));
    } finally {
      setClearing(false);
    }
  }

  function toggleExpand(id: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  useEffect(() => {
    fetchLogs(1);
  }, []);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">
            Error Logs
          </p>
          <h3 className="text-3xl font-semibold text-dusk">錯誤日誌</h3>
          <p className="text-sm text-dusk/70">共 {total} 筆錯誤記錄</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="min-h-[44px] rounded-xl border border-sand/60 px-4 text-sm text-dusk hover:bg-linen/80 disabled:opacity-50"
            onClick={() => fetchLogs(page)}
            disabled={loading}
          >
            {loading ? "載入中…" : "重新整理"}
          </button>
          {total > 0 && (
            <button
              type="button"
              className="min-h-[44px] rounded-xl border border-clay/40 px-4 text-sm text-clay hover:bg-clay/10 disabled:opacity-50"
              onClick={() => setConfirmClear(true)}
              disabled={clearing}
            >
              {clearing ? "清除中…" : "清除全部"}
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      {logs.length === 0 && !loading && (
        <div className="rounded-2xl bg-white/85 px-6 py-12 text-center text-sm text-dusk/60 shadow">
          目前沒有錯誤記錄
        </div>
      )}

      {logs.length > 0 && (
        <section>
          <div className="divide-y divide-sand/40 overflow-hidden rounded-2xl bg-white/85 shadow">
            {logs.map((log) => {
              const isOpen = expanded.has(log.id);
              return (
                <div key={log.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-4 px-5 py-4 text-left transition hover:bg-linen/40"
                    onClick={() => toggleExpand(log.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="mt-0.5 shrink-0 rounded-full bg-clay/10 px-2.5 py-0.5 text-xs font-semibold text-clay">
                      {log.level}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="font-mono text-sm font-medium text-dusk">
                          {log.method} {log.path}
                        </span>
                        <span className="text-xs tabular-nums text-dusk/60">
                          {formatDateTime(log.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-sm text-dusk/70">
                        {log.message}
                      </p>
                    </div>
                    <svg
                      aria-hidden="true"
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`mt-1 shrink-0 text-dusk/50 transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {isOpen && log.traceback && (
                    <div className="px-5 pb-4">
                      <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-dusk p-4 font-mono text-xs leading-relaxed text-linen">
                        {log.traceback}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <PaginationControls
            page={page}
            size={PAGE_SIZE}
            total={total}
            onPageChange={(next) => fetchLogs(next)}
          />
        </section>
      )}

      {confirmClear && (
        <ConfirmDialog
          title="清除所有錯誤日誌？"
          details={`目前共 ${total} 筆`}
          description="清除後無法還原，之後將無法追查這些錯誤。"
          confirmLabel="全部清除"
          destructive
          busy={clearing}
          onConfirm={handleClear}
          onCancel={() => setConfirmClear(false)}
        />
      )}
    </div>
  );
}
