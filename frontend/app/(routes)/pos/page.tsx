"use client";

import clsx from "clsx";
import { useEffect, useRef, useState } from "react";
import {
  apiClient,
  ExchangeCheckoutResponse,
  PaymentMethod,
  PosDailySummary,
  PosCheckoutResponse,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { ExchangePanel } from "./ExchangePanel";
import { PosTabContent } from "./PosTabContent";
import { useTabManager } from "./useTabManager";
import type { TabState } from "./types";

const paymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: "現金", value: "cash" },
  { label: "轉帳", value: "transfer" },
  { label: "行動支付", value: "mobile" },
];

const currency = (value: number) => Math.round(value).toLocaleString("zh-TW");

export default function PosPage() {
  const { isAdmin } = useAuth();
  const {
    tabs,
    activeTabId,
    activeTab,
    addTab,
    removeTab,
    switchTab,
    updateTab,
    resetTab,
    canAddTab,
    canRemoveTab,
  } = useTabManager();

  const [mode, setMode] = useState<"sale" | "exchange">("sale");
  const [receipt, setReceipt] = useState<PosCheckoutResponse | null>(null);
  const [exchangeReceipt, setExchangeReceipt] =
    useState<ExchangeCheckoutResponse | null>(null);
  const [dailySummary, setDailySummary] = useState<PosDailySummary | null>(
    null,
  );
  const [closeConfirmTabId, setCloseConfirmTabId] = useState<string | null>(
    null,
  );

  // AbortController for daily summary fetch
  const summaryAbortRef = useRef<AbortController | null>(null);

  async function fetchDailySummary() {
    summaryAbortRef.current?.abort();
    const controller = new AbortController();
    summaryAbortRef.current = controller;
    try {
      const { data } = await apiClient.get<PosDailySummary>(
        "/api/pos/summary/daily",
        {
          signal: controller.signal,
        },
      );
      setDailySummary(data);
    } catch {
      // ignore — summary is non-critical
    }
  }

  useEffect(() => {
    fetchDailySummary();
    return () => summaryAbortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Page Visibility API: re-fetch summary when tab becomes visible again
  useEffect(() => {
    function handleVisibility() {
      if (document.visibilityState === "visible") {
        fetchDailySummary();
      }
    }
    document.addEventListener("visibilitychange", handleVisibility);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibility);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleCheckoutComplete(tabId: string, resp: PosCheckoutResponse) {
    setReceipt(resp);
    setExchangeReceipt(null);
    resetTab(tabId);
    fetchDailySummary();
  }

  function handleExchangeComplete(resp: ExchangeCheckoutResponse) {
    setExchangeReceipt(resp);
    setReceipt(null);
    fetchDailySummary();
  }

  function handleCloseTab(tabId: string) {
    const tab = tabs.find((t) => t.id === tabId);
    if (tab && tab.cart.length > 0) {
      setCloseConfirmTabId(tabId);
    } else {
      removeTab(tabId);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">
              POS
            </p>
            <h3 className="text-2xl font-semibold">
              {mode === "exchange" ? "換貨 / 退貨" : "銷售結帳"}
            </h3>
            <p className="text-sm text-dusk/70">
              {mode === "exchange"
                ? "輸入原始訂單查詢可退商品，同步處理換購品項。"
                : "使用條碼槍掃描商品，系統自動帶入資訊並完成結帳。"}
            </p>
          </div>
          {/* Mode toggle */}
          <div className="mt-3 flex gap-2 md:mt-0">
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold transition min-h-[44px]",
                mode === "sale"
                  ? "border-dusk bg-dusk text-white"
                  : "border-sand/60 text-dusk hover:border-dusk/50",
              )}
              onClick={() => setMode("sale")}
            >
              一般結帳
            </button>
            <button
              type="button"
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold transition min-h-[44px]",
                mode === "exchange"
                  ? "border-dusk bg-dusk text-white"
                  : "border-sand/60 text-dusk hover:border-dusk/50",
              )}
              onClick={() => setMode("exchange")}
            >
              換貨 / 退貨
            </button>
          </div>
        </div>

        {mode === "exchange" ? (
          <ExchangePanel onExchangeComplete={handleExchangeComplete} />
        ) : (
          <>
            {/* Tab bar */}
            <div className="mt-4 flex items-center gap-1 overflow-x-auto rounded-xl bg-linen/60 p-1">
              {tabs.map((tab) => (
                <div key={tab.id} className="flex shrink-0 items-center">
                  <button
                    onClick={() => switchTab(tab.id)}
                    className={clsx(
                      "rounded-lg px-3 py-2.5 text-sm font-medium transition min-h-[44px] active:scale-[0.98]",
                      tab.id === activeTabId
                        ? "bg-dusk text-amber-50 shadow"
                        : "text-dusk/60 hover:text-dusk",
                    )}
                  >
                    {tab.label}
                    {tab.cart.length > 0 && (
                      <span
                        className={clsx(
                          "ml-1.5 rounded-full px-1.5 py-0.5 text-xs",
                          tab.id === activeTabId
                            ? "bg-white/20 text-amber-50"
                            : "bg-dusk/10 text-dusk/60",
                        )}
                      >
                        {tab.cart.length}
                      </span>
                    )}
                  </button>
                  {canRemoveTab && (
                    <button
                      onClick={() => handleCloseTab(tab.id)}
                      className="ml-0.5 flex h-[44px] w-[44px] items-center justify-center rounded-full text-dusk/40 hover:text-clay active:scale-95"
                      title="關閉此訂單"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
              {canAddTab && (
                <button
                  onClick={addTab}
                  className="ml-1 shrink-0 rounded-lg border border-dusk/20 px-3 py-2.5 text-sm text-dusk/60 hover:border-dusk/50 hover:text-dusk min-h-[44px]"
                  title="新增訂單分頁"
                >
                  + 新增
                </button>
              )}
            </div>

            {/* Active tab content — key forces remount on tab switch, triggering auto-focus */}
            <PosTabContent
              key={activeTabId}
              tab={activeTab}
              onUpdate={(patch: Partial<TabState>) =>
                updateTab(activeTabId, patch)
              }
              onCheckoutComplete={(resp) =>
                handleCheckoutComplete(activeTabId, resp)
              }
            />
          </>
        )}
      </div>

      {/* Receipt */}
      {receipt && (
        <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                最新結帳
              </p>
              <h4 className="text-lg font-semibold">
                訂單 #{receipt.order_id}
              </h4>
            </div>
            <p className="text-sm text-dusk/70">
              {new Date(receipt.created_at).toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-2xl bg-linen/60 p-4">
              <p>金額總計：{currency(receipt.gross_total)}</p>
              <p>折扣：- {currency(receipt.discount_total)}</p>
              <p className="font-semibold text-dusk">
                應收金額：{currency(receipt.total_price)}
              </p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p>
                付款方式：
                {
                  paymentOptions.find((p) => p.value === receipt.payment_method)
                    ?.label
                }
              </p>
              {isAdmin && <p>銷貨成本：{currency(receipt.cost_total)}</p>}
              {isAdmin && <p>毛利：{currency(receipt.profit_total)}</p>}
              {receipt.discounts.manual_discount > 0 ? (
                <p className="text-xs text-moss">已套用自訂折扣</p>
              ) : receipt.discounts.birthday_discount_applied ? (
                <p className="text-xs text-moss">已使用生日 88 折</p>
              ) : receipt.discounts.member_discount_applied ? (
                <p className="text-xs text-moss">已套用會員 95 折</p>
              ) : (
                <p className="text-xs text-dusk/60">無優惠</p>
              )}
            </div>
          </div>
          {receipt.member && (
            <p className="mt-2 text-xs text-dusk/70">
              會員：{receipt.member.name}（{receipt.member.member_code}）
            </p>
          )}
        </section>
      )}

      {/* Exchange receipt */}
      {exchangeReceipt && (
        <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                換貨完成
              </p>
              <h4 className="text-lg font-semibold">
                訂單 #{exchangeReceipt.order_id}
                {exchangeReceipt.original_order_id && (
                  <span className="ml-2 text-sm font-normal text-dusk/60">
                    （原始：#{exchangeReceipt.original_order_id}）
                  </span>
                )}
              </h4>
            </div>
            <p className="text-sm text-dusk/70">
              {new Date(exchangeReceipt.created_at).toLocaleString("zh-TW")}
            </p>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-clay">
                退款：- {currency(exchangeReceipt.refund_total)}
              </p>
              <p>換購：{currency(exchangeReceipt.purchase_gross)}</p>
              {exchangeReceipt.purchase_discount > 0 && (
                <p className="text-moss">
                  折扣：- {currency(exchangeReceipt.purchase_discount)}
                </p>
              )}
              <p className="font-semibold text-dusk">
                差額應收：{currency(exchangeReceipt.net_payable)}
              </p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p>
                付款方式：
                {
                  paymentOptions.find(
                    (p) => p.value === exchangeReceipt.payment_method,
                  )?.label
                }
              </p>
              {isAdmin && <p>毛利：{currency(exchangeReceipt.profit_total)}</p>}
              <p className="mt-1 text-xs text-moss">換貨紀錄</p>
            </div>
          </div>
          {exchangeReceipt.member && (
            <p className="mt-2 text-xs text-dusk/70">
              會員：{exchangeReceipt.member.name}（
              {exchangeReceipt.member.member_code}）
            </p>
          )}
        </section>
      )}

      {/* Daily summary */}
      {dailySummary && (
        <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                今日概況
              </p>
              <h4 className="text-lg font-semibold">
                {new Date(dailySummary.date).toLocaleDateString("zh-TW")}
              </h4>
            </div>
            <p className="text-sm text-dusk/70">
              訂單數：{dailySummary.orders_count}
            </p>
          </div>
          <div
            className={`mt-4 grid gap-3 text-sm ${isAdmin ? "md:grid-cols-4" : "md:grid-cols-2"}`}
          >
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">營收</p>
              <p className="text-lg font-semibold">
                {currency(dailySummary.net_total)}
              </p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">折扣</p>
              <p className="text-lg font-semibold text-clay">
                - {currency(dailySummary.discount_total)}
              </p>
            </div>
            {isAdmin && (
              <div className="rounded-2xl bg-linen/60 p-4">
                <p className="text-xs text-dusk/60">成本</p>
                <p className="text-lg font-semibold">
                  {currency(dailySummary.cost_total)}
                </p>
              </div>
            )}
            {isAdmin && (
              <div className="rounded-2xl bg-linen/60 p-4">
                <p className="text-xs text-dusk/60">毛利</p>
                <p className="text-lg font-semibold text-moss">
                  {currency(dailySummary.profit_total)}
                </p>
              </div>
            )}
          </div>
          <div className="mt-4 text-sm text-dusk/70">
            <p className="font-semibold">付款方式統計</p>
            <ul className="mt-2 list-disc pl-5">
              {paymentOptions.map((option) => (
                <li key={option.value}>
                  {option.label}：
                  {dailySummary.payment_breakdown[option.value] ?? 0} 筆
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Close-tab confirmation modal */}
      {closeConfirmTabId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-dusk/50"
            onClick={() => setCloseConfirmTabId(null)}
          />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-sand/60 bg-white p-6 shadow-2xl">
            <h5 className="text-lg font-semibold text-dusk">
              確定關閉此訂單？
            </h5>
            <p className="mt-2 text-sm text-dusk/70">
              此分頁有未結帳商品，關閉後資料將清除。
            </p>
            <div className="mt-5 flex justify-end gap-3">
              <button
                className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen/80 min-h-[44px]"
                onClick={() => setCloseConfirmTabId(null)}
              >
                取消
              </button>
              <button
                className="rounded-full bg-clay px-4 py-2 text-sm font-semibold text-white shadow min-h-[44px]"
                onClick={() => {
                  removeTab(closeConfirmTabId);
                  setCloseConfirmTabId(null);
                }}
              >
                確定關閉
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
