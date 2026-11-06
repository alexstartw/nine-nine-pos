"use client";

import clsx from "clsx";
import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  apiClient,
  PaymentMethod,
  PosCheckoutPayload,
  PosCheckoutResponse,
  PosMemberInfo,
  PosProduct,
} from "@/lib/api";
import { CartRow } from "./CartRow";
import type { ReceiptLine } from "./CheckoutSuccessOverlay";
import { QuickMemberModal } from "./QuickMemberModal";
import type { CartItem, TabState } from "./types";

const paymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: "現金", value: "cash" },
  { label: "轉帳", value: "transfer" },
  { label: "行動支付", value: "mobile" },
];

const quickDiscounts = [
  { label: "95 折", rate: 0.05 },
  { label: "9 折", rate: 0.1 },
  { label: "88 折", rate: 0.12 },
];

const currency = (value: number) => Math.round(value).toLocaleString("zh-TW");

interface Props {
  tab: TabState;
  onUpdate: (patch: Partial<TabState>) => void;
  onCheckoutComplete: (
    receipt: PosCheckoutResponse,
    lines: ReceiptLine[],
  ) => void;
  /** 顯示在購物車下方的內容（例如今日概況） */
  footer?: ReactNode;
  /** 每次遞增就把焦點送回條碼欄（結帳確認視窗關閉後） */
  focusBarcodeNonce?: number;
}

export function PosTabContent({
  tab,
  onUpdate,
  onCheckoutComplete,
  footer,
  focusBarcodeNonce = 0,
}: Props) {
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Transient UI states (not persisted in tab)
  const [isScanning, setScanning] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Phone that was looked up but not found → offer to create the member.
  const [notFoundPhone, setNotFoundPhone] = useState<string | null>(null);
  const [quickMemberOpen, setQuickMemberOpen] = useState(false);

  // Auto-focus barcode input when this tab mounts (tab switch), and again
  // whenever the parent asks for it (after the checkout confirmation closes).
  useEffect(() => {
    barcodeRef.current?.focus();
  }, [focusBarcodeNonce]);

  // ── Derived calculations ───────────────────────────────────────────────────
  const { cartSubtotal, discountableSubtotal, clearanceSubtotal } = useMemo(
    () =>
      tab.cart.reduce(
        (acc, item) => {
          const customPriceEntry = tab.customPrices[item.product.id];
          const price = customPriceEntry?.price ?? item.product.price;
          const subtotal = price * item.quantity;
          acc.cartSubtotal += subtotal;
          if (customPriceEntry) {
            acc.clearanceSubtotal += subtotal;
          } else {
            acc.discountableSubtotal += subtotal;
          }
          return acc;
        },
        { cartSubtotal: 0, discountableSubtotal: 0, clearanceSubtotal: 0 },
      ),
    [tab.cart, tab.customPrices],
  );

  const memberDiscountRate = useMemo(() => {
    if (!tab.member) return 0;
    return tab.member.is_birthday_month &&
      tab.member.birthday_discount_available
      ? 0.12
      : 0.05;
  }, [tab.member]);

  const appliedDiscountRate = tab.manualDiscountRate ?? memberDiscountRate;
  const activeDiscountLabel =
    tab.manualDiscountRate !== null
      ? `自訂 ${Math.round((1 - tab.manualDiscountRate) * 100)} 折`
      : tab.member
        ? memberDiscountRate >= 0.12
          ? "生日 88 折"
          : "會員 95 折"
        : "無折扣";

  const estimatedDiscount = useMemo(() => {
    if (discountableSubtotal <= 0) return 0;
    return Math.round(discountableSubtotal * appliedDiscountRate);
  }, [discountableSubtotal, appliedDiscountRate]);

  const estimatedTotal = useMemo(() => {
    const regularTotal = Math.max(discountableSubtotal - estimatedDiscount, 0);
    let total = regularTotal + clearanceSubtotal;
    if (tab.roundDown) total -= total % 10;
    return total;
  }, [
    discountableSubtotal,
    clearanceSubtotal,
    estimatedDiscount,
    tab.roundDown,
  ]);

  // ── Discount handlers ──────────────────────────────────────────────────────
  function applyQuickDiscount(rate: number) {
    onUpdate({
      manualDiscountRate: rate,
      manualDiscountInput: String(Math.round(rate * 100)),
      discountError: null,
    });
  }

  function clearManualDiscount() {
    onUpdate({
      manualDiscountRate: null,
      manualDiscountInput: "",
      discountError: null,
    });
  }

  function handleManualDiscountInput(value: string) {
    if (!value.trim()) {
      onUpdate({
        manualDiscountInput: value,
        manualDiscountRate: null,
        discountError: null,
      });
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      onUpdate({
        manualDiscountInput: value,
        manualDiscountRate: null,
        discountError: "請輸入數字",
      });
      return;
    }
    if (numeric < 0 || numeric > 90) {
      onUpdate({
        manualDiscountInput: value,
        manualDiscountRate: null,
        discountError: "折扣必須介於 0% 至 90%",
      });
      return;
    }
    onUpdate({
      manualDiscountInput: value,
      manualDiscountRate: numeric / 100,
      discountError: null,
    });
  }

  // ── Cart handlers ──────────────────────────────────────────────────────────
  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tab.barcode.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PosProduct>(
        `/api/pos/products/${tab.barcode.trim()}`,
      );
      const existing = tab.cart.find((item) => item.product.id === data.id);
      const newCart: CartItem[] = existing
        ? tab.cart.map((item) =>
            item.product.id === data.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          )
        : [...tab.cart, { product: data, quantity: 1 }];
      onUpdate({ cart: newCart, barcode: "" });
    } catch {
      setError("找不到對應條碼或商品已下架");
    } finally {
      setScanning(false);
    }
  }

  const updateQuantity = useCallback(
    (productId: number, delta: number) => {
      onUpdate({
        cart: tab.cart
          .map((item) => {
            if (item.product.id !== productId) return item;
            const next = item.quantity + delta;
            return next > 0 ? { ...item, quantity: next } : null;
          })
          .filter((item): item is CartItem => Boolean(item)),
      });
    },
    [tab.cart, onUpdate],
  );

  const removeItem = useCallback(
    (productId: number) => {
      const next = { ...tab.customPrices };
      delete next[productId];
      onUpdate({
        cart: tab.cart.filter((item) => item.product.id !== productId),
        customPrices: next,
      });
    },
    [tab.cart, tab.customPrices, onUpdate],
  );

  const handleCustomPriceChange = useCallback(
    (productId: number, price: number | null, reason: string) => {
      const next = { ...tab.customPrices };
      if (price === null) {
        delete next[productId];
      } else {
        next[productId] = { price, reason };
      }
      onUpdate({ customPrices: next });
    },
    [tab.customPrices, onUpdate],
  );

  // ── Member lookup ──────────────────────────────────────────────────────────
  async function handleMemberLookup() {
    const raw = tab.memberPhone.trim();
    if (!raw) {
      onUpdate({ member: null, memberMatches: [], showMemberOptions: false });
      return;
    }
    const digits = raw.replace(/\D/g, "");
    setLookupLoading(true);
    setError(null);
    setNotFoundPhone(null);
    try {
      if (digits.length === 3) {
        const { data } = await apiClient.get<PosMemberInfo[]>(
          "/api/pos/members/search",
          {
            params: { query: digits },
          },
        );
        onUpdate({ memberMatches: data, showMemberOptions: true });
        if (data.length === 1) handleSelectMember(data[0]);
      } else if (digits.length >= 4) {
        const { data } = await apiClient.get<PosMemberInfo>(
          "/api/pos/members/by-phone",
          {
            params: { phone: raw },
          },
        );
        handleSelectMember(data);
      } else {
        setError("請輸入完整電話或後三碼");
      }
    } catch {
      onUpdate({ member: null, memberMatches: [], showMemberOptions: false });
      setNotFoundPhone(raw);
    } finally {
      setLookupLoading(false);
    }
  }

  function handleSelectMember(info: PosMemberInfo) {
    setNotFoundPhone(null);
    const patch: Partial<TabState> = {
      member: info,
      memberPhone: info.phone ?? "",
      memberMatches: [],
      showMemberOptions: false,
    };
    // Auto-rename tab to member name if still on default label
    if (/^訂單 \d+$/.test(tab.label)) {
      patch.label = info.name;
    }
    onUpdate(patch);
  }

  // ── Checkout ───────────────────────────────────────────────────────────────
  async function handleCheckout() {
    if (!tab.cart.length) {
      setError("請先加入商品");
      return;
    }
    setSubmitting(true);
    setError(null);

    const payload: PosCheckoutPayload = {
      payment_method: tab.paymentMethod,
      items: tab.cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        custom_price: tab.customPrices[item.product.id]?.price ?? undefined,
        custom_reason: tab.customPrices[item.product.id]?.reason ?? undefined,
      })),
    };

    // Snapshot the cart for the printed receipt — the tab is cleared on success.
    const lines: ReceiptLine[] = tab.cart.map((item) => {
      const unitPrice =
        tab.customPrices[item.product.id]?.price ?? item.product.price;
      return {
        name: item.product.name,
        barcode: item.product.barcode,
        quantity: item.quantity,
        unitPrice,
        subtotal: unitPrice * item.quantity,
      };
    });

    const phoneToSubmit = tab.member?.phone ?? tab.memberPhone.trim();
    if (phoneToSubmit) payload.member_phone = phoneToSubmit;
    if (tab.manualDiscountRate !== null)
      payload.manual_discount_rate = tab.manualDiscountRate;
    if (tab.roundDown) payload.round_down_to_ten = true;

    try {
      const { data } = await apiClient.post<PosCheckoutResponse>(
        "/api/pos/checkout",
        payload,
      );
      // Success is confirmed by the overlay the parent opens, not a status line.
      onCheckoutComplete(data, lines);
    } catch {
      setError("結帳失敗，請檢查庫存或會員資料");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  const sectionLabel = "text-xs text-dusk/60";

  return (
    <div className="mt-4 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr),380px] xl:grid-cols-[minmax(0,1fr),420px]">
      {/* Left: barcode + cart */}
      <section className="min-w-0 space-y-4">
        <form onSubmit={handleScanSubmit} className="flex gap-3">
          <input
            ref={barcodeRef}
            type="text"
            inputMode="numeric"
            className="min-h-[52px] min-w-0 flex-1 rounded-xl border-2 border-dusk/70 bg-white px-4 text-lg outline-none transition focus:border-dusk focus:ring-4 focus:ring-dusk/15"
            placeholder="掃描條碼或輸入條碼"
            value={tab.barcode}
            onChange={(e) => onUpdate({ barcode: e.target.value })}
            disabled={isScanning || isSubmitting}
          />
          <button
            type="submit"
            className="min-h-[52px] rounded-xl bg-dusk px-6 text-sm font-semibold text-white shadow active:scale-[0.98] disabled:opacity-60"
            disabled={isScanning || isSubmitting}
          >
            加入
          </button>
        </form>

        <div className="overflow-hidden rounded-2xl bg-white/85 shadow">
          <h2 className="px-5 pb-1 pt-4 text-base font-semibold text-dusk">
            訂單項目
          </h2>
          {tab.cart.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-dusk/60">
              請掃描商品加入訂單。
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-xs text-dusk/60">
                  <tr>
                    <th className="px-4 py-2 font-medium">品名</th>
                    <th className="px-4 py-2 font-medium">單價</th>
                    <th className="px-4 py-2 font-medium">數量</th>
                    <th className="px-4 py-2 font-medium">大拍賣</th>
                    <th className="px-4 py-2 text-right font-medium">小計</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {tab.cart.map((item) => (
                    <CartRow
                      key={item.product.id}
                      item={item}
                      quantity={item.quantity}
                      customPrice={
                        tab.customPrices[item.product.id]?.price ?? null
                      }
                      customReason={
                        tab.customPrices[item.product.id]?.reason ?? ""
                      }
                      onUpdateQuantity={(delta) =>
                        updateQuantity(item.product.id, delta)
                      }
                      onUpdateCustom={(price, reason) =>
                        handleCustomPriceChange(item.product.id, price, reason)
                      }
                      onRemove={() => removeItem(item.product.id)}
                      disabled={isSubmitting}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {footer}
      </section>

      {/* Right: checkout panel — 會員 → 折扣設定 → 付款方式 → 金額 → 確認結帳 */}
      <aside className="space-y-5 rounded-2xl bg-white/85 p-5 shadow lg:sticky lg:top-6">
        {/* Member */}
        <div>
          <div className="flex items-center justify-between">
            <div>
              <p className={sectionLabel}>會員</p>
              <h4 className="text-base font-semibold">電話查詢</h4>
            </div>
            {!tab.member && (
              <button
                type="button"
                className="min-h-[36px] rounded-lg px-2.5 text-sm font-semibold text-dusk hover:bg-dusk/10"
                onClick={() => setQuickMemberOpen(true)}
                disabled={isSubmitting}
              >
                + 新增會員
              </button>
            )}
            {tab.member && (
              <button
                className="min-h-[36px] px-2 text-sm text-dusk/60 hover:text-dusk"
                onClick={() =>
                  onUpdate({
                    member: null,
                    memberPhone: "",
                    memberMatches: [],
                    showMemberOptions: false,
                  })
                }
                disabled={isSubmitting}
              >
                清除
              </button>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <div className="relative min-w-0 flex-1">
              <input
                type="tel"
                inputMode="tel"
                className="min-h-[44px] w-full rounded-xl border border-sand/60 px-3"
                placeholder="輸入電話或後三碼"
                value={tab.memberPhone}
                onChange={(e) => {
                  setNotFoundPhone(null);
                  onUpdate({
                    memberPhone: e.target.value,
                    memberMatches: [],
                    showMemberOptions: false,
                  });
                }}
                disabled={lookupLoading || isSubmitting}
              />
              {tab.showMemberOptions && tab.memberMatches.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-sand/50 bg-white shadow-lg">
                  {tab.memberMatches.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border-b border-sand/20 px-3 py-3 text-left text-sm last:border-b-0 hover:bg-linen/80 min-h-[44px]"
                      onClick={() => handleSelectMember(candidate)}
                      disabled={isSubmitting}
                    >
                      <span className="font-semibold text-dusk">
                        {candidate.name}
                      </span>
                      <span className="text-xs text-dusk/70">
                        {candidate.phone ?? "無電話"} · {candidate.member_code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="rounded-xl bg-dusk px-4 text-sm font-semibold text-white min-h-[44px] active:scale-[0.98] disabled:opacity-60 hover:bg-dusk/90"
              onClick={handleMemberLookup}
              disabled={
                lookupLoading || isSubmitting || !tab.memberPhone.trim()
              }
            >
              查詢
            </button>
          </div>
          {tab.member ? (
            <div className="mt-3 flex items-start justify-between gap-3 rounded-xl bg-linen/80 p-3 text-sm">
              <div className="min-w-0">
                <p className="font-semibold">{tab.member.name}</p>
                <p className="text-xs text-dusk/70">
                  ID: {tab.member.member_code}
                </p>
                <p className="text-xs text-dusk/70">
                  電話：{tab.member.phone ?? "-"}
                </p>
              </div>
              <p className="shrink-0 rounded-full bg-moss/10 px-2.5 py-1 text-xs text-moss">
                {tab.member.is_birthday_month &&
                tab.member.birthday_discount_available
                  ? "生日優惠可用（88折一次）"
                  : "會員享 95 折"}
              </p>
            </div>
          ) : notFoundPhone ? (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-linen/80 p-3 text-sm">
              <p className="min-w-0 text-dusk">
                查無「{notFoundPhone}」的會員。
              </p>
              <button
                type="button"
                className="min-h-[36px] shrink-0 rounded-lg bg-dusk px-3 text-xs font-semibold text-white hover:bg-dusk/90"
                onClick={() => setQuickMemberOpen(true)}
                disabled={isSubmitting}
              >
                建立新會員
              </button>
            </div>
          ) : (
            <p className="mt-2 text-xs text-dusk/60">
              未查詢會員時以一般價格結帳。
            </p>
          )}
          {quickMemberOpen && (
            <QuickMemberModal
              initialPhone={
                notFoundPhone && notFoundPhone.replace(/\D/g, "").length > 3
                  ? notFoundPhone
                  : tab.memberPhone.replace(/\D/g, "").length > 3
                    ? tab.memberPhone
                    : ""
              }
              onClose={() => setQuickMemberOpen(false)}
              onSelect={(info) => {
                setQuickMemberOpen(false);
                handleSelectMember(info);
              }}
            />
          )}
        </div>

        {/* Discount */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className={sectionLabel}>折扣設定</p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-dusk">
                {activeDiscountLabel}
              </p>
              {tab.manualDiscountRate !== null && (
                <button
                  type="button"
                  className="text-xs text-dusk/60 hover:text-dusk"
                  onClick={clearManualDiscount}
                  disabled={isSubmitting}
                >
                  清除
                </button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-[repeat(3,minmax(0,1fr)),88px] gap-2">
            {quickDiscounts.map((option) => (
              <button
                key={option.rate}
                type="button"
                className={clsx(
                  "rounded-xl border text-sm min-h-[44px] active:scale-[0.98]",
                  tab.manualDiscountRate !== null &&
                    Math.abs(tab.manualDiscountRate - option.rate) < 1e-4
                    ? "border-dusk bg-dusk text-white"
                    : "border-sand/60 text-dusk hover:border-dusk/40",
                )}
                onClick={() => applyQuickDiscount(option.rate)}
                disabled={isSubmitting}
              >
                {option.label}
              </button>
            ))}
            <input
              id={`manual-discount-${tab.id}`}
              type="number"
              inputMode="decimal"
              min="0"
              max="90"
              className="min-h-[44px] w-full min-w-0 rounded-xl border border-sand/60 px-2 text-center"
              placeholder="0 - 90"
              value={tab.manualDiscountInput}
              onChange={(e) => handleManualDiscountInput(e.target.value)}
              disabled={isSubmitting}
            />
          </div>
          <label
            htmlFor={`manual-discount-${tab.id}`}
            className="block text-xs text-dusk/60"
          >
            自訂折扣（輸入扣除百分比，如 5 代表 95 折）
          </label>
          {tab.discountError && (
            <p className="text-xs text-clay">{tab.discountError}</p>
          )}
        </div>

        {/* Payment */}
        <div className="space-y-2">
          <p className={sectionLabel}>付款方式</p>
          <div className="grid grid-cols-3 gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                className={clsx(
                  "rounded-xl border px-2 text-sm min-h-[44px] active:scale-[0.98]",
                  tab.paymentMethod === option.value
                    ? "border-dusk bg-dusk font-semibold text-white"
                    : "border-sand/60 text-dusk hover:border-dusk/40",
                )}
                onClick={() => onUpdate({ paymentMethod: option.value })}
                type="button"
                disabled={isSubmitting}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {/* Totals */}
        <div className="space-y-1.5 border-t border-sand/40 pt-4 text-sm">
          <div className="flex items-center justify-between">
            <span>小計</span>
            <span className="font-semibold">{currency(cartSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-moss">
            <span>預估折扣</span>
            <span>- {currency(estimatedDiscount)}</span>
          </div>
          <div className="mt-2 flex items-baseline justify-between border-t border-dashed border-sand/70 pt-3 text-dusk">
            <span className="text-base font-semibold">應收</span>
            <span className="text-4xl font-bold tracking-tight">
              {currency(estimatedTotal)}
            </span>
          </div>
          <p className="text-xs text-dusk/60">
            計算：一般 {currency(discountableSubtotal)} - 折扣{" "}
            {currency(estimatedDiscount)}
            {clearanceSubtotal > 0
              ? ` + 大拍賣 ${currency(clearanceSubtotal)}`
              : ""}{" "}
            = {currency(estimatedTotal)}
          </p>
          {clearanceSubtotal > 0 && (
            <p className="text-[11px] text-clay">
              大拍賣品項不再疊加會員或自訂折扣
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-2">
          <button
            type="button"
            className={clsx(
              "w-full rounded-xl border px-4 text-sm font-semibold transition min-h-[44px]",
              tab.roundDown
                ? "border-dusk bg-dusk text-white"
                : "border-sand/60 text-dusk hover:border-dusk/40",
            )}
            onClick={() => onUpdate({ roundDown: !tab.roundDown })}
            disabled={isSubmitting}
          >
            {tab.roundDown ? "已捨去個位數 (關閉)" : "無條件捨去個位數"}
          </button>
          <button
            type="button"
            className="min-h-[56px] w-full rounded-xl bg-dusk px-4 text-base font-semibold text-white shadow active:scale-[0.99] disabled:opacity-60"
            onClick={handleCheckout}
            disabled={isSubmitting || tab.cart.length === 0}
          >
            {isSubmitting ? "結帳中..." : "確認結帳"}
          </button>
          {/* Persistent live region so errors are announced, not just drawn. */}
          <div role="alert" aria-live="assertive">
            {error && <p className="text-sm text-clay">{error}</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}
