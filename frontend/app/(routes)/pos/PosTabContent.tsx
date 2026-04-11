'use client';

import clsx from 'clsx';
import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, PaymentMethod, PosCheckoutPayload, PosCheckoutResponse, PosMemberInfo, PosProduct } from '@/lib/api';
import { CartRow } from './CartRow';
import type { CartItem, TabState } from './types';

const paymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: '現金', value: 'cash' },
  { label: '轉帳', value: 'transfer' },
  { label: '行動支付', value: 'mobile' }
];

const quickDiscounts = [
  { label: '95 折', rate: 0.05 },
  { label: '9 折', rate: 0.1 },
  { label: '88 折', rate: 0.12 }
];

const currency = (value: number) => Math.round(value).toLocaleString('zh-TW');

interface Props {
  tab: TabState;
  onUpdate: (patch: Partial<TabState>) => void;
  onCheckoutComplete: (receipt: PosCheckoutResponse) => void;
}

export function PosTabContent({ tab, onUpdate, onCheckoutComplete }: Props) {
  const barcodeRef = useRef<HTMLInputElement>(null);

  // Transient UI states (not persisted in tab)
  const [isScanning, setScanning] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Auto-focus barcode input when this tab mounts (tab switch)
  useEffect(() => {
    barcodeRef.current?.focus();
  }, []);

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
        { cartSubtotal: 0, discountableSubtotal: 0, clearanceSubtotal: 0 }
      ),
    [tab.cart, tab.customPrices]
  );

  const memberDiscountRate = useMemo(() => {
    if (!tab.member) return 0;
    return tab.member.is_birthday_month && tab.member.birthday_discount_available ? 0.12 : 0.05;
  }, [tab.member]);

  const appliedDiscountRate = tab.manualDiscountRate ?? memberDiscountRate;
  const activeDiscountLabel =
    tab.manualDiscountRate !== null
      ? `自訂 ${Math.round((1 - tab.manualDiscountRate) * 100)} 折`
      : tab.member
        ? memberDiscountRate >= 0.12
          ? '生日 88 折'
          : '會員 95 折'
        : '無折扣';

  const estimatedDiscount = useMemo(() => {
    if (discountableSubtotal <= 0) return 0;
    return Math.round(discountableSubtotal * appliedDiscountRate);
  }, [discountableSubtotal, appliedDiscountRate]);

  const estimatedTotal = useMemo(() => {
    const regularTotal = Math.max(discountableSubtotal - estimatedDiscount, 0);
    let total = regularTotal + clearanceSubtotal;
    if (tab.roundDown) total -= total % 10;
    return total;
  }, [discountableSubtotal, clearanceSubtotal, estimatedDiscount, tab.roundDown]);

  // ── Discount handlers ──────────────────────────────────────────────────────
  function applyQuickDiscount(rate: number) {
    onUpdate({
      manualDiscountRate: rate,
      manualDiscountInput: String(Math.round(rate * 100)),
      discountError: null
    });
  }

  function clearManualDiscount() {
    onUpdate({ manualDiscountRate: null, manualDiscountInput: '', discountError: null });
  }

  function handleManualDiscountInput(value: string) {
    if (!value.trim()) {
      onUpdate({ manualDiscountInput: value, manualDiscountRate: null, discountError: null });
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      onUpdate({ manualDiscountInput: value, manualDiscountRate: null, discountError: '請輸入數字' });
      return;
    }
    if (numeric < 0 || numeric > 90) {
      onUpdate({ manualDiscountInput: value, manualDiscountRate: null, discountError: '折扣必須介於 0% 至 90%' });
      return;
    }
    onUpdate({ manualDiscountInput: value, manualDiscountRate: numeric / 100, discountError: null });
  }

  // ── Cart handlers ──────────────────────────────────────────────────────────
  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!tab.barcode.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PosProduct>(`/api/pos/products/${tab.barcode.trim()}`);
      const existing = tab.cart.find((item) => item.product.id === data.id);
      const newCart: CartItem[] = existing
        ? tab.cart.map((item) =>
            item.product.id === data.id ? { ...item, quantity: item.quantity + 1 } : item
          )
        : [...tab.cart, { product: data, quantity: 1 }];
      onUpdate({ cart: newCart, barcode: '' });
    } catch {
      setError('找不到對應條碼或商品已下架');
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
          .filter((item): item is CartItem => Boolean(item))
      });
    },
    [tab.cart, onUpdate]
  );

  const removeItem = useCallback(
    (productId: number) => {
      const next = { ...tab.customPrices };
      delete next[productId];
      onUpdate({
        cart: tab.cart.filter((item) => item.product.id !== productId),
        customPrices: next
      });
    },
    [tab.cart, tab.customPrices, onUpdate]
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
    [tab.customPrices, onUpdate]
  );

  // ── Member lookup ──────────────────────────────────────────────────────────
  async function handleMemberLookup() {
    const raw = tab.memberPhone.trim();
    if (!raw) {
      onUpdate({ member: null, memberMatches: [], showMemberOptions: false });
      return;
    }
    const digits = raw.replace(/\D/g, '');
    setLookupLoading(true);
    setError(null);
    try {
      if (digits.length === 3) {
        const { data } = await apiClient.get<PosMemberInfo[]>('/api/pos/members/search', {
          params: { query: digits }
        });
        onUpdate({ memberMatches: data, showMemberOptions: true });
        if (data.length === 1) handleSelectMember(data[0]);
      } else if (digits.length >= 4) {
        const { data } = await apiClient.get<PosMemberInfo>('/api/pos/members/by-phone', {
          params: { phone: raw }
        });
        handleSelectMember(data);
      } else {
        setError('請輸入完整電話或後三碼');
      }
    } catch {
      onUpdate({ member: null, memberMatches: [], showMemberOptions: false });
      setError('找不到會員電話，請確認後再試');
    } finally {
      setLookupLoading(false);
    }
  }

  function handleSelectMember(info: PosMemberInfo) {
    const patch: Partial<TabState> = {
      member: info,
      memberPhone: info.phone ?? '',
      memberMatches: [],
      showMemberOptions: false
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
      setError('請先加入商品');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const payload: PosCheckoutPayload = {
      payment_method: tab.paymentMethod,
      items: tab.cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        custom_price: tab.customPrices[item.product.id]?.price ?? undefined,
        custom_reason: tab.customPrices[item.product.id]?.reason ?? undefined
      }))
    };

    const phoneToSubmit = tab.member?.phone ?? tab.memberPhone.trim();
    if (phoneToSubmit) payload.member_phone = phoneToSubmit;
    if (tab.manualDiscountRate !== null) payload.manual_discount_rate = tab.manualDiscountRate;
    if (tab.roundDown) payload.round_down_to_ten = true;

    try {
      const { data } = await apiClient.post<PosCheckoutResponse>('/api/pos/checkout', payload);
      setMessage('結帳完成');
      onCheckoutComplete(data);
    } catch {
      setError('結帳失敗，請檢查庫存或會員資料');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
      {/* Left: barcode + cart + totals */}
      <section className="space-y-4">
        <form onSubmit={handleScanSubmit} className="flex gap-3">
          <input
            ref={barcodeRef}
            type="text"
            className="flex-1 rounded-2xl border border-sand/60 px-4 py-3 text-lg"
            placeholder="掃描條碼或輸入條碼"
            value={tab.barcode}
            onChange={(e) => onUpdate({ barcode: e.target.value })}
            disabled={isScanning || isSubmitting}
          />
          <button
            type="submit"
            className="rounded-2xl bg-dusk px-5 py-3 text-sm font-semibold text-white shadow"
            disabled={isScanning || isSubmitting}
          >
            加入
          </button>
        </form>

        <div className="rounded-2xl border border-sand/60 bg-white/90 shadow-sm">
          <div className="rounded-t-2xl border-b border-sand/40 bg-linen px-4 py-2 text-sm font-semibold text-dusk">
            訂單項目
          </div>
          {tab.cart.length === 0 ? (
            <div className="px-4 py-6 text-sm text-dusk/60">請掃描商品加入訂單。</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-linen text-left">
                <tr>
                  <th className="px-4 py-2">品名</th>
                  <th className="px-4 py-2">單價</th>
                  <th className="px-4 py-2">數量</th>
                  <th className="px-4 py-2">大拍賣</th>
                  <th className="px-4 py-2 text-right">小計</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {tab.cart.map((item) => (
                  <CartRow
                    key={item.product.id}
                    item={item}
                    quantity={item.quantity}
                    customPrice={tab.customPrices[item.product.id]?.price ?? null}
                    customReason={tab.customPrices[item.product.id]?.reason ?? ''}
                    onUpdateQuantity={(delta) => updateQuantity(item.product.id, delta)}
                    onUpdateCustom={(price, reason) =>
                      handleCustomPriceChange(item.product.id, price, reason)
                    }
                    onRemove={() => removeItem(item.product.id)}
                    disabled={isSubmitting}
                  />
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-4 space-y-2 rounded-2xl border border-sand/60 p-4 text-sm">
          <div className="flex items-center justify-between">
            <span>小計</span>
            <span className="font-semibold">{currency(cartSubtotal)}</span>
          </div>
          <div className="flex items-center justify-between text-moss">
            <span>預估折扣</span>
            <span>- {currency(estimatedDiscount)}</span>
          </div>
          <div className="flex items-center justify-between text-lg font-semibold text-dusk">
            <span>應收</span>
            <span>{currency(estimatedTotal)}</span>
          </div>
          <p className="text-xs text-dusk/60">
            計算：一般 {currency(discountableSubtotal)} - 折扣 {currency(estimatedDiscount)}
            {clearanceSubtotal > 0 ? ` + 大拍賣 ${currency(clearanceSubtotal)}` : ''} ={' '}
            {currency(estimatedTotal)}
          </p>
          {clearanceSubtotal > 0 && (
            <p className="text-[11px] text-clay">大拍賣品項不再疊加會員或自訂折扣</p>
          )}
          <button
            type="button"
            className={clsx(
              'w-full rounded-full border px-4 py-2 text-sm font-semibold transition',
              tab.roundDown ? 'border-dusk bg-dusk text-white' : 'border-sand/60 text-dusk'
            )}
            onClick={() => onUpdate({ roundDown: !tab.roundDown })}
            disabled={isSubmitting}
          >
            {tab.roundDown ? '已捨去個位數 (關閉)' : '無條件捨去個位數'}
          </button>
          <button
            type="button"
            className="mt-4 w-full rounded-2xl bg-dusk px-4 py-3 text-sm font-semibold text-white shadow disabled:opacity-60"
            onClick={handleCheckout}
            disabled={isSubmitting || tab.cart.length === 0}
          >
            {isSubmitting ? '結帳中...' : '確認結帳'}
          </button>
          {error && <p className="text-sm text-clay">{error}</p>}
          {message && <p className="text-sm text-moss">{message}</p>}
        </div>
      </section>

      {/* Right: member + payment + discount */}
      <section className="space-y-4">
        {/* Member */}
        <div className="rounded-2xl border border-sand/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">會員</p>
              <h4 className="text-lg font-semibold">電話查詢</h4>
            </div>
            {tab.member && (
              <button
                className="text-sm text-dusk/60 hover:text-dusk"
                onClick={() =>
                  onUpdate({ member: null, memberPhone: '', memberMatches: [], showMemberOptions: false })
                }
                disabled={isSubmitting}
              >
                清除
              </button>
            )}
          </div>
          <div className="mt-3 flex gap-2">
            <div className="relative flex-1">
              <input
                type="tel"
                className="w-full rounded-xl border border-sand/60 px-3 py-2"
                placeholder="輸入電話或後三碼"
                value={tab.memberPhone}
                onChange={(e) =>
                  onUpdate({ memberPhone: e.target.value, memberMatches: [], showMemberOptions: false })
                }
                disabled={lookupLoading || isSubmitting}
              />
              {tab.showMemberOptions && tab.memberMatches.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-sand/50 bg-white shadow-lg">
                  {tab.memberMatches.map((candidate) => (
                    <button
                      key={candidate.id}
                      type="button"
                      className="flex w-full flex-col items-start gap-0.5 border-b border-sand/20 px-3 py-2 text-left text-sm last:border-b-0 hover:bg-linen/80"
                      onClick={() => handleSelectMember(candidate)}
                      disabled={isSubmitting}
                    >
                      <span className="font-semibold text-dusk">{candidate.name}</span>
                      <span className="text-xs text-dusk/70">
                        {candidate.phone ?? '無電話'} · {candidate.member_code}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              className="rounded-xl bg-moss px-4 py-2 text-sm font-semibold text-white"
              onClick={handleMemberLookup}
              disabled={lookupLoading || isSubmitting || !tab.memberPhone.trim()}
            >
              查詢
            </button>
          </div>
          {tab.member ? (
            <div className="mt-3 rounded-xl bg-linen/80 p-3 text-sm">
              <p className="font-semibold">{tab.member.name}</p>
              <p className="text-xs text-dusk/70">ID: {tab.member.member_code}</p>
              <p className="text-xs text-dusk/70">電話：{tab.member.phone ?? '-'}</p>
              <p className="mt-2 text-xs text-moss">
                {tab.member.is_birthday_month && tab.member.birthday_discount_available
                  ? '生日優惠可用（88折一次）'
                  : '會員享 95 折'}
              </p>
            </div>
          ) : (
            <p className="mt-3 text-xs text-dusk/60">未查詢會員時以一般價格結帳。</p>
          )}
        </div>

        {/* Payment */}
        <div className="rounded-2xl border border-sand/60 p-4">
          <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">付款方式</p>
          <div className="mt-3 grid grid-cols-1 gap-2">
            {paymentOptions.map((option) => (
              <button
                key={option.value}
                className={clsx(
                  'rounded-xl border px-3 py-2 text-left text-sm',
                  tab.paymentMethod === option.value
                    ? 'border-dusk bg-dusk text-white'
                    : 'border-sand/60 text-dusk'
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

        {/* Discount */}
        <div className="space-y-3 rounded-2xl border border-sand/60 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">折扣設定</p>
              <p className="text-sm text-dusk/70">{activeDiscountLabel}</p>
            </div>
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
          <div className="flex flex-wrap gap-2">
            {quickDiscounts.map((option) => (
              <button
                key={option.rate}
                type="button"
                className={clsx(
                  'rounded-full border px-3 py-1.5 text-sm',
                  tab.manualDiscountRate !== null &&
                    Math.abs(tab.manualDiscountRate - option.rate) < 1e-4
                    ? 'border-dusk bg-dusk text-white'
                    : 'border-sand/60 text-dusk'
                )}
                onClick={() => applyQuickDiscount(option.rate)}
                disabled={isSubmitting}
              >
                {option.label}
              </button>
            ))}
          </div>
          <label className="text-xs text-dusk/70">
            自訂折扣（輸入扣除百分比，如 5 代表 95 折）
            <input
              type="number"
              min="0"
              max="90"
              className="mt-1 w-full rounded-xl border border-sand/60 px-3 py-2"
              placeholder="0 - 90"
              value={tab.manualDiscountInput}
              onChange={(e) => handleManualDiscountInput(e.target.value)}
              disabled={isSubmitting}
            />
          </label>
          {tab.discountError && <p className="text-xs text-clay">{tab.discountError}</p>}
        </div>
      </section>
    </div>
  );
}
