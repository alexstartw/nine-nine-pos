'use client';

import clsx from 'clsx';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  apiClient,
  PaymentMethod,
  PosCheckoutPayload,
  PosCheckoutResponse,
  PosDailySummary,
  PosMemberInfo,
  PosProduct
} from '@/lib/api';
import { useRouter } from 'next/navigation';

type CartItem = {
  product: PosProduct;
  quantity: number;
};

type CustomPriceMap = Record<
  number,
  {
    price: number;
    reason: string;
  }
>;

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

export default function PosPage() {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [memberPhone, setMemberPhone] = useState('');
  const [member, setMember] = useState<PosMemberInfo | null>(null);
  const [memberMatches, setMemberMatches] = useState<PosMemberInfo[]>([]);
  const [showMemberOptions, setShowMemberOptions] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isScanning, setScanning] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PosCheckoutResponse | null>(null);
  const [dailySummary, setDailySummary] = useState<PosDailySummary | null>(null);
  const [manualDiscountRate, setManualDiscountRate] = useState<number | null>(null);
  const [manualDiscountInput, setManualDiscountInput] = useState('');
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [roundDown, setRoundDown] = useState(false);
  const [customPrices, setCustomPrices] = useState<CustomPriceMap>({});

  const { cartSubtotal, discountableSubtotal, clearanceSubtotal } = useMemo(
    () =>
      cart.reduce(
        (acc, item) => {
          const customPriceEntry = customPrices[item.product.id];
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
    [cart, customPrices]
  );

  const memberDiscountRate = useMemo(() => {
    if (!member) return 0;
    return member.is_birthday_month && member.birthday_discount_available ? 0.12 : 0.05;
  }, [member]);

  const appliedDiscountRate = manualDiscountRate ?? memberDiscountRate;
  const activeDiscountLabel = manualDiscountRate !== null
    ? `自訂 ${Math.round((1 - manualDiscountRate) * 100)} 折`
    : member
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
    if (roundDown) {
      total -= total % 10;
    }
    return total;
  }, [discountableSubtotal, clearanceSubtotal, estimatedDiscount, roundDown]);

  function applyQuickDiscount(rate: number) {
    setManualDiscountRate(rate);
    setManualDiscountInput(String(Math.round(rate * 100)));
    setDiscountError(null);
  }

  function clearManualDiscount() {
    setManualDiscountRate(null);
    setManualDiscountInput('');
    setDiscountError(null);
  }

  function handleManualDiscountInput(value: string) {
    setManualDiscountInput(value);
    if (!value.trim()) {
      setManualDiscountRate(null);
      setDiscountError(null);
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) {
      setManualDiscountRate(null);
      setDiscountError('請輸入數字');
      return;
    }
    if (numeric < 0 || numeric > 90) {
      setManualDiscountRate(null);
      setDiscountError('折扣必須介於 0% 至 90%');
      return;
    }
    setManualDiscountRate(numeric / 100);
    setDiscountError(null);
  }

  async function fetchDailySummary() {
    try {
      const { data } = await apiClient.get<PosDailySummary>('/api/pos/summary/daily');
      setDailySummary(data);
    } catch {
      // ignore summary errors
    }
  }

  useEffect(() => {
    fetchDailySummary();
  }, []);

  async function handleScanSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!barcode.trim()) return;
    setScanning(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PosProduct>(`/api/pos/products/${barcode.trim()}`);
      setCart((prev) => {
        const existing = prev.find((item) => item.product.id === data.id);
        if (existing) {
          return prev.map((item) =>
            item.product.id === data.id ? { ...item, quantity: item.quantity + 1 } : item
          );
        }
        return [...prev, { product: data, quantity: 1 }];
      });
      setBarcode('');
    } catch (err) {
      setError('找不到對應條碼或商品已下架');
    } finally {
      setScanning(false);
    }
  }

  function updateQuantity(productId: number, delta: number) {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product.id !== productId) return item;
          const nextQuantity = item.quantity + delta;
          return nextQuantity > 0 ? { ...item, quantity: nextQuantity } : null;
        })
        .filter((item): item is CartItem => Boolean(item))
    );
  }

function removeItem(productId: number) {
  setCart((prev) => prev.filter((item) => item.product.id !== productId));
  setCustomPrices((prev) => {
    const next = { ...prev };
    delete next[productId];
    return next;
  });
}

interface CartRowProps {
  item: CartItem;
  quantity: number;
  customPrice: number | null;
  customReason: string;
  onUpdateQuantity: (delta: number) => void;
  onUpdateCustom: (price: number | null, reason: string) => void;
  onRemove: () => void;
  disabled: boolean;
}

function CartRow({
  item,
  quantity,
  customPrice,
  customReason,
  onUpdateQuantity,
  onUpdateCustom,
  onRemove,
  disabled
}: CartRowProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [tempPrice, setTempPrice] = useState<string>(
    customPrice !== null ? String(customPrice) : String(item.product.price)
  );
  const [tempReason, setTempReason] = useState(customReason);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTempPrice(customPrice !== null ? String(customPrice) : String(item.product.price));
    setTempReason(customReason);
  }, [customPrice, customReason, item.product.price]);

  const displayPrice = customPrice ?? item.product.price;
  const displaySubtotal = displayPrice * quantity;

  function handleConfirmCustom() {
    const numeric = Number(tempPrice);
    if (!Number.isFinite(numeric) || numeric < 0) {
      setError('售價需為非負數字');
      return;
    }
    onUpdateCustom(numeric, tempReason.trim() || '大拍賣');
    setDialogOpen(false);
    setError(null);
  }

  function handleClearCustom() {
    onUpdateCustom(null, '');
    setTempPrice(String(item.product.price));
    setTempReason('');
    setError(null);
    setDialogOpen(false);
  }

  return (
    <>
      <tr className="border-t border-sand/40">
        <td className="px-4 py-2">
          <p>{item.product.name}</p>
          {customReason && (
            <p className="text-xs text-moss">出清：{customReason}</p>
          )}
        </td>
        <td className="px-4 py-2">
          <span>{currency(displayPrice)}</span>
          {customPrice !== null && (
            <span className="ml-2 rounded-full bg-moss/10 px-2 py-0.5 text-xs text-moss">特價</span>
          )}
        </td>
        <td className="px-4 py-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded-full border border-sand/60 px-2"
              onClick={() => onUpdateQuantity(-1)}
              disabled={disabled}
            >
              -
            </button>
            <span className="w-8 text-center">{quantity}</span>
            <button
              type="button"
              className="rounded-full border border-sand/60 px-2"
              onClick={() => onUpdateQuantity(1)}
              disabled={disabled}
            >
              +
            </button>
          </div>
        </td>
        <td className="px-4 py-2">
          <button
            type="button"
            className="rounded-full border border-sand/60 px-3 py-1 text-xs text-dusk hover:bg-linen/80 disabled:opacity-50"
            onClick={() => {
              setDialogOpen(true);
              setError(null);
            }}
            disabled={disabled}
          >
            大拍賣
          </button>
        </td>
        <td className="px-4 py-2 text-right">
          {currency(displaySubtotal)}
        </td>
        <td className="px-4 py-2 text-right">
          <button
            className="text-sm text-clay hover:underline"
            onClick={onRemove}
            disabled={disabled}
          >
            移除
          </button>
        </td>
      </tr>

      {dialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-dusk/50" onClick={() => setDialogOpen(false)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl border border-sand/60 bg-white p-5 shadow-2xl">
            <h5 className="text-lg font-semibold text-dusk">設定大拍賣價格</h5>
            <p className="mt-1 text-sm text-dusk/70">{item.product.name}</p>
            <label className="mt-3 block text-sm font-medium text-dusk/80">
              特價 (元)
              <input
                type="number"
                min="0"
                className="mt-1 w-full rounded-xl border border-sand/60 px-3 py-2"
                value={tempPrice}
                onChange={(event) => setTempPrice(event.target.value)}
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-dusk/80">
              理由
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-sand/60 px-3 py-2"
                value={tempReason}
                onChange={(event) => setTempReason(event.target.value)}
                placeholder="如：出清、瑕疵等 (選填)"
              />
            </label>
            {error && <p className="mt-2 text-sm text-clay">{error}</p>}
            <div className="mt-4 flex justify-end gap-3">
              {customPrice !== null && (
                <button
                  type="button"
                  className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk hover:bg-linen/80"
                  onClick={handleClearCustom}
                >
                  取消特價
                </button>
              )}
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-dusk/70 hover:bg-linen"
                onClick={() => setDialogOpen(false)}
              >
                關閉
              </button>
              <button
                type="button"
                className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow"
                onClick={handleConfirmCustom}
              >
                套用
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

  async function handleMemberLookup() {
    const rawInput = memberPhone.trim();
    if (!rawInput) {
      setMember(null);
      setMemberMatches([]);
      setShowMemberOptions(false);
      return;
    }
    const digitsOnly = rawInput.replace(/\D/g, '');
    setLookupLoading(true);
    setError(null);
    try {
      if (digitsOnly.length === 3) {
        const { data } = await apiClient.get<PosMemberInfo[]>('/api/pos/members/search', {
          params: { query: digitsOnly }
        });
        setMemberMatches(data);
        setShowMemberOptions(true);
        if (data.length === 1) {
          handleSelectMember(data[0]);
        }
      } else if (digitsOnly.length >= 4) {
        const { data } = await apiClient.get<PosMemberInfo>('/api/pos/members/by-phone', {
          params: { phone: rawInput }
        });
        handleSelectMember(data);
      } else {
        setError('請輸入完整電話或後三碼');
      }
    } catch (err) {
      setMember(null);
      setMemberMatches([]);
      setShowMemberOptions(false);
      setError('找不到會員電話，請確認後再試');
    } finally {
      setLookupLoading(false);
    }
  }

  function handleSelectMember(info: PosMemberInfo) {
    setMember(info);
    setMemberPhone(info.phone ?? '');
    setMemberMatches([]);
    setShowMemberOptions(false);
  }

  function handleCustomPriceChange(productId: number, price: number | null, reason: string) {
    setCustomPrices((prev) => {
      const next = { ...prev };
      if (price === null) {
        delete next[productId];
      } else {
        next[productId] = { price, reason };
      }
      return next;
    });
  }

  async function handleCheckout() {
    if (!cart.length) {
      setError('請先加入商品');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);

    const payload: PosCheckoutPayload = {
      payment_method: paymentMethod,
      items: cart.map((item) => ({
        product_id: item.product.id,
        quantity: item.quantity,
        custom_price: customPrices[item.product.id]?.price ?? undefined,
        custom_reason: customPrices[item.product.id]?.reason ?? undefined
      }))
    };

    const phoneToSubmit = member?.phone ?? memberPhone.trim();
    if (phoneToSubmit) {
      payload.member_phone = phoneToSubmit;
    }
    if (manualDiscountRate !== null) {
      payload.manual_discount_rate = manualDiscountRate;
    }
    if (roundDown) {
      payload.round_down_to_ten = true;
    }

    try {
      const { data } = await apiClient.post<PosCheckoutResponse>('/api/pos/checkout', payload);
      setReceipt(data);
      setMessage('結帳完成');
      setCart([]);
      setMember(null);
      setMemberPhone('');
      setPaymentMethod('cash');
      setManualDiscountRate(null);
      setManualDiscountInput('');
      setDiscountError(null);
      setRoundDown(false);
      setCustomPrices({});
      setBarcode('');
      await fetchDailySummary();
    } catch (err) {
      setError('結帳失敗，請檢查庫存或會員資料');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">POS</p>
            <h3 className="text-2xl font-semibold">銷售結帳</h3>
            <p className="text-sm text-dusk/70">使用條碼槍掃描商品，系統自動帶入資訊並完成結帳。</p>
          </div>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-[2fr,1fr]">
          <section className="space-y-4">
            <form onSubmit={handleScanSubmit} className="flex gap-3">
              <input
                type="text"
                className="flex-1 rounded-2xl border border-sand/60 px-4 py-3 text-lg"
                placeholder="掃描條碼或輸入條碼"
                value={barcode}
                onChange={(event) => setBarcode(event.target.value)}
                disabled={isScanning || isSubmitting}
                autoFocus
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
              {cart.length === 0 ? (
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
                    {cart.map((item) => (
                      <CartRow
                        key={item.product.id}
                        item={item}
                        quantity={item.quantity}
                        customPrice={customPrices[item.product.id]?.price ?? null}
                        customReason={customPrices[item.product.id]?.reason ?? ''}
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
            <div className="rounded-2xl border border-sand/60 p-4 mt-4 space-y-2 text-sm">
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
                {clearanceSubtotal > 0 ? ` + 大拍賣 ${currency(clearanceSubtotal)}` : ''} = {currency(estimatedTotal)}
              </p>
              {clearanceSubtotal > 0 && (
                <p className="text-[11px] text-clay">大拍賣品項不再疊加會員或自訂折扣</p>
              )}
              <button
                type="button"
                className={clsx(
                  'w-full rounded-full border px-4 py-2 text-sm font-semibold transition',
                  roundDown ? 'border-dusk bg-dusk text-white' : 'border-sand/60 text-dusk'
                )}
                onClick={() => setRoundDown((prev) => !prev)}
                disabled={isSubmitting}
              >
                {roundDown ? '已捨去個位數 (關閉)' : '無條件捨去個位數'}
              </button>
              <button
                type="button"
                className="mt-4 w-full rounded-2xl bg-dusk px-4 py-3 text-sm font-semibold text-white shadow disabled:opacity-60"
                onClick={handleCheckout}
                disabled={isSubmitting || cart.length === 0}
              >
                {isSubmitting ? '結帳中...' : '確認結帳'}
              </button>
              {error && <p className="text-sm text-clay">{error}</p>}
              {message && <p className="text-sm text-moss">{message}</p>}
            </div>
          </section>

          <section className="space-y-4">
            <div className="rounded-2xl border border-sand/60 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">會員</p>
                  <h4 className="text-lg font-semibold">電話查詢</h4>
                </div>
                {member && (
                  <button
                    className="text-sm text-dusk/60 hover:text-dusk"
                    onClick={() => {
                      setMember(null);
                      setMemberPhone('');
                      setMemberMatches([]);
                      setShowMemberOptions(false);
                    }}
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
                    value={memberPhone}
                    onChange={(event) => {
                      setMemberPhone(event.target.value);
                      setMemberMatches([]);
                      setShowMemberOptions(false);
                    }}
                    disabled={lookupLoading || isSubmitting}
                  />
                  {showMemberOptions && memberMatches.length > 0 && (
                    <div className="absolute left-0 right-0 z-20 mt-2 max-h-60 overflow-y-auto rounded-2xl border border-sand/50 bg-white shadow-lg">
                      {memberMatches.map((candidate) => (
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
                  disabled={lookupLoading || isSubmitting || !memberPhone.trim()}
                >
                  查詢
                </button>
              </div>
              {member ? (
                <div className="mt-3 rounded-xl bg-linen/80 p-3 text-sm">
                  <p className="font-semibold">{member.name}</p>
                  <p className="text-xs text-dusk/70">ID: {member.member_code}</p>
                  <p className="text-xs text-dusk/70">電話：{member.phone ?? '-'}</p>
                  <p className="mt-2 text-xs text-moss">
                    {member.is_birthday_month && member.birthday_discount_available
                      ? '生日優惠可用（88折一次）'
                      : '會員享 95 折'}
                  </p>
                </div>
              ) : (
                <p className="mt-3 text-xs text-dusk/60">未查詢會員時以一般價格結帳。</p>
              )}
            </div>

            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">付款方式</p>
              <div className="mt-3 grid grid-cols-1 gap-2">
                {paymentOptions.map((option) => (
                  <button
                    key={option.value}
                    className={clsx(
                      'rounded-xl border px-3 py-2 text-left text-sm',
                      paymentMethod === option.value
                        ? 'border-dusk bg-dusk text-white'
                        : 'border-sand/60 text-dusk'
                    )}
                    onClick={() => setPaymentMethod(option.value)}
                    type="button"
                    disabled={isSubmitting}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-sand/60 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">折扣設定</p>
                  <p className="text-sm text-dusk/70">{activeDiscountLabel}</p>
                </div>
                {manualDiscountRate !== null && (
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
                      manualDiscountRate !== null && Math.abs(manualDiscountRate - option.rate) < 1e-4
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
                  value={manualDiscountInput}
                  onChange={(event) => handleManualDiscountInput(event.target.value)}
                  disabled={isSubmitting}
                />
              </label>
              {discountError && <p className="text-xs text-clay">{discountError}</p>}
            </div>

          </section>
        </div>
      </div>

      {receipt && (
        <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">最新結帳</p>
              <h4 className="text-lg font-semibold">訂單 #{receipt.order_id}</h4>
            </div>
            <p className="text-sm text-dusk/70">
              {new Date(receipt.created_at).toLocaleString('zh-TW')}
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
              <p>付款方式：{paymentOptions.find((p) => p.value === receipt.payment_method)?.label}</p>
              <p>銷貨成本：{currency(receipt.cost_total)}</p>
              <p>毛利：{currency(receipt.profit_total)}</p>
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

      {dailySummary && (
        <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">今日概況</p>
              <h4 className="text-lg font-semibold">
                {new Date(dailySummary.date).toLocaleDateString('zh-TW')}
              </h4>
            </div>
            <p className="text-sm text-dusk/70">訂單數：{dailySummary.orders_count}</p>
          </div>
          <div className="mt-4 grid gap-3 text-sm md:grid-cols-4">
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">營收</p>
              <p className="text-lg font-semibold">{currency(dailySummary.net_total)}</p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">折扣</p>
              <p className="text-lg font-semibold text-clay">
                - {currency(dailySummary.discount_total)}
              </p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">成本</p>
              <p className="text-lg font-semibold">{currency(dailySummary.cost_total)}</p>
            </div>
            <div className="rounded-2xl bg-linen/60 p-4">
              <p className="text-xs text-dusk/60">毛利</p>
              <p className="text-lg font-semibold text-moss">
                {currency(dailySummary.profit_total)}
              </p>
            </div>
          </div>
          <div className="mt-4 text-sm text-dusk/70">
            <p className="font-semibold">付款方式統計</p>
            <ul className="mt-2 list-disc pl-5">
              {paymentOptions.map((option) => (
                <li key={option.value}>
                  {option.label}：{dailySummary.payment_breakdown[option.value] ?? 0} 筆
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </div>
  );
}
