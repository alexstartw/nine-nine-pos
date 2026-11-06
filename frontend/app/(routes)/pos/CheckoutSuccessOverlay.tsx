"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import type { PosCheckoutResponse } from "@/lib/api";
import { formatDateTime, formatMoney, formatPaymentMethod } from "@/lib/format";

/** One printed line of the receipt, captured from the cart at checkout time. */
export interface ReceiptLine {
  name: string;
  barcode: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface Props {
  receipt: PosCheckoutResponse;
  lines: ReceiptLine[];
  isAdmin: boolean;
  /** Dismiss and return to scanning the next order. */
  onClose: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function discountNote(receipt: PosCheckoutResponse): string {
  if (receipt.discounts.manual_discount > 0) return "已套用自訂折扣";
  if (receipt.discounts.birthday_discount_applied) return "已使用生日 88 折";
  if (receipt.discounts.member_discount_applied) return "已套用會員 95 折";
  return "無優惠";
}

/**
 * Full-screen confirmation shown the moment a sale goes through: the amount the
 * customer owes, large enough to read across the counter, plus the receipt that
 * gets printed. Dismissing it returns the cashier to the barcode field.
 */
export function CheckoutSuccessOverlay({
  receipt,
  lines,
  isAdmin,
  onClose,
}: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    nextRef.current?.focus();
  }, []);

  // Scope the print stylesheet to this overlay so Cmd+P elsewhere is unaffected.
  useEffect(() => {
    document.documentElement.classList.add("receipt-print-mode");
    return () =>
      document.documentElement.classList.remove("receipt-print-mode");
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Enter") {
        // Let a focused button handle its own Enter; otherwise Enter means "next".
        const active = document.activeElement;
        if (active instanceof HTMLButtonElement) return;
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "Tab") {
        const nodes =
          dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        if (!nodes || nodes.length === 0) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div
      data-print-root
      className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
    >
      <div
        data-print-hide
        className="absolute inset-0 bg-dusk/70 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-success-title"
        className="relative z-10 flex max-h-full w-full max-w-lg flex-col rounded-2xl bg-white p-6 shadow-xl"
      >
        {/* Only the receipt scrolls; the actions stay reachable. */}
        <div data-print-sheet className="min-h-0 overflow-y-auto">
          <h2
            id="checkout-success-title"
            className="text-2xl font-semibold text-dusk"
          >
            結帳完成
          </h2>
          <p className="mt-1 text-sm text-dusk/80">
            訂單 #{receipt.order_id} · {formatDateTime(receipt.created_at)}
          </p>

          <div className="mt-5 rounded-2xl bg-linen/70 px-5 py-4">
            <p className="text-sm text-dusk/80">應收金額</p>
            <p className="mt-1 text-5xl font-semibold tabular-nums text-dusk">
              {formatMoney(receipt.total_price)}
            </p>
            <p className="mt-2 text-base font-medium text-dusk">
              {formatPaymentMethod(receipt.payment_method)}
            </p>
          </div>

          {lines.length > 0 && (
            <table className="mt-5 w-full text-sm">
              <thead>
                <tr className="border-b border-sand/60 text-left text-dusk/80">
                  <th className="pb-1 font-medium">商品</th>
                  <th className="pb-1 text-right font-medium">數量</th>
                  <th className="pb-1 text-right font-medium">小計</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.barcode} className="border-b border-sand/30">
                    <td className="py-1.5 pr-2 text-dusk">
                      {line.name}
                      <span className="ml-1 text-xs text-dusk/80">
                        {formatMoney(line.unitPrice)}
                      </span>
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-dusk">
                      {line.quantity}
                    </td>
                    <td className="py-1.5 text-right tabular-nums text-dusk">
                      {formatMoney(line.subtotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <dl className="mt-4 space-y-1 text-sm text-dusk">
            <div className="flex justify-between">
              <dt className="text-dusk/80">金額總計</dt>
              <dd className="tabular-nums">
                {formatMoney(receipt.gross_total)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-dusk/80">折扣</dt>
              <dd className="tabular-nums text-clay">
                {formatMoney(-receipt.discount_total)}
              </dd>
            </div>
            {isAdmin && (
              <div className="flex justify-between">
                <dt className="text-dusk/80">銷貨成本</dt>
                <dd className="tabular-nums">
                  {formatMoney(receipt.cost_total)}
                </dd>
              </div>
            )}
            {isAdmin && (
              <div className="flex justify-between">
                <dt className="text-dusk/80">毛利</dt>
                <dd className="tabular-nums text-moss">
                  {formatMoney(receipt.profit_total)}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-dusk/80">優惠</dt>
              <dd>{discountNote(receipt)}</dd>
            </div>
            {receipt.member && (
              <div className="flex justify-between">
                <dt className="text-dusk/80">會員</dt>
                <dd>
                  {receipt.member.name}（{receipt.member.member_code}）
                </dd>
              </div>
            )}
          </dl>
        </div>

        <div data-print-hide className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => window.print()}
            className="min-h-[52px] flex-1 rounded-xl border border-sand/60 px-4 text-base font-semibold text-dusk transition-colors hover:bg-linen"
          >
            列印收據
          </button>
          <button
            ref={nextRef}
            type="button"
            onClick={onClose}
            className="min-h-[52px] flex-1 rounded-xl bg-dusk px-4 text-base font-semibold text-white shadow active:scale-[0.99]"
          >
            下一筆
            <span className="ml-2 text-xs font-normal text-white/70">
              Enter
            </span>
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
