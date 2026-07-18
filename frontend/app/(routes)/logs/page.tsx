"use client";

import { useEffect, useState } from "react";
import { apiClient, AppLog, extractApiError, PaginatedResponse } from "@/lib/api";

const PAGE_SIZE = 50;

export default function LogsPage() {
  const [logs, setLogs] = useState<AppLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [clearing, setClearing] = useState(false);

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
    if (!confirm("確定清除所有錯誤日誌？此操作無法還原。")) return;
    setClearing(true);
    try {
      await apiClient.delete("/api/admin/logs");
      setLogs([]);
      setTotal(0);
      setPage(1);
    } catch (err) {
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

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-dusk">錯誤日誌</h1>
          <p className="mt-0.5 text-sm text-dusk/60">共 {total} 筆錯誤記錄</p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            className="rounded-xl border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen disabled:opacity-50"
            onClick={() => fetchLogs(page)}
            disabled={loading}
          >
            {loading ? "載入中…" : "重新整理"}
          </button>
          {total > 0 && (
            <button
              type="button"
              className="rounded-xl border border-clay/40 px-4 py-2 text-sm text-clay hover:bg-clay/5 disabled:opacity-50"
              onClick={handleClear}
              disabled={clearing}
            >
              {clearing ? "清除中…" : "清除全部"}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-clay/30 bg-clay/5 px-4 py-3 text-sm text-clay">
          {error}
        </div>
      )}

      {logs.length === 0 && !loading && (
        <div className="rounded-2xl border border-sand/60 bg-white/90 px-6 py-12 text-center text-sm text-dusk/50">
          目前沒有錯誤記錄
        </div>
      )}

      <div className="space-y-3">
        {logs.map((log) => (
          <div
            key={log.id}
            className="rounded-2xl border border-sand/60 bg-white/90 shadow-sm"
          >
            <div
              className="flex cursor-pointer items-start gap-4 px-4 py-3"
              onClick={() => toggleExpand(log.id)}
            >
              <span className="mt-0.5 shrink-0 rounded-lg bg-clay/10 px-2 py-0.5 text-xs font-semibold text-clay">
                {log.level}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-mono text-sm font-medium text-dusk">
                    {log.method} {log.path}
                  </span>
                  <span className="text-xs text-dusk/50">
                    {new Date(log.created_at).toLocaleString("zh-TW")}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-dusk/70">{log.message}</p>
              </div>
              <span className="shrink-0 text-xs text-dusk/40">
                {expanded.has(log.id) ? "▲" : "▼"}
              </span>
            </div>

            {expanded.has(log.id) && log.traceback && (
              <div className="border-t border-sand/30 px-4 py-3">
                <pre className="overflow-x-auto whitespace-pre-wrap break-words rounded-xl bg-gray-950 p-4 text-xs leading-relaxed text-green-400">
                  {log.traceback}
                </pre>
              </div>
            )}
          </div>
        ))}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <button
            type="button"
            className="rounded-lg border border-sand/60 px-4 py-2 text-sm disabled:opacity-40"
            disabled={page <= 1 || loading}
            onClick={() => fetchLogs(page - 1)}
          >
            ← 上一頁
          </button>
          <span className="px-3 py-2 text-sm text-dusk/60">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            className="rounded-lg border border-sand/60 px-4 py-2 text-sm disabled:opacity-40"
            disabled={page >= totalPages || loading}
            onClick={() => fetchLogs(page + 1)}
          >
            下一頁 →
          </button>
        </div>
      )}
    </div>
  );
}
