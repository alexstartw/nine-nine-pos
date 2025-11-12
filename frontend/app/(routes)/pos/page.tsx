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

type CartItem = {
  product: PosProduct;
  quantity: number;
};

const paymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: '現金', value: 'cash' },
  { label: '轉帳', value: 'transfer' },
  { label: '行動支付', value: 'mobile' }
];

const currency = (value: number) => Math.round(value).toLocaleString('zh-TW');

export default function PosPage() {
  const [barcode, setBarcode] = useState('');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [memberPhone, setMemberPhone] = useState('');
  const [member, setMember] = useState<PosMemberInfo | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isScanning, setScanning] = useState(false);
  const [isSubmitting, setSubmitting] = useState(false);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<PosCheckoutResponse | null>(null);
  const [dailySummary, setDailySummary] = useState<PosDailySummary | null>(null);

  const cartSubtotal = useMemo(
    () => cart.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cart]
  );

  const estimatedDiscount = useMemo(() => {
    if (!member || cartSubtotal <= 0) return 0;
    const rate = member.is_birthday_month && member.birthday_discount_available ? 0.12 : 0.05;
    return Math.round(cartSubtotal * rate * 100) / 100;
  }, [member, cartSubtotal]);

  const estimatedTotal = useMemo(
    () => Math.max(cartSubtotal - estimatedDiscount, 0),
    [cartSubtotal, estimatedDiscount]
  );

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
  }

  async function handleMemberLookup() {
    if (!memberPhone.trim()) {
      setMember(null);
      return;
    }
    setLookupLoading(true);
    setError(null);
    try {
      const { data } = await apiClient.get<PosMemberInfo>('/api/pos/members/by-phone', {
        params: { phone: memberPhone.trim() }
      });
      setMember(data);
    } catch (err) {
      setMember(null);
      setError('找不到會員電話，請確認後再試');
    } finally {
      setLookupLoading(false);
    }
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
        quantity: item.quantity
      }))
    };

    const phoneToSubmit = member?.phone ?? memberPhone.trim();
    if (phoneToSubmit) {
      payload.member_phone = phoneToSubmit;
    }

    try {
      const { data } = await apiClient.post<PosCheckoutResponse>('/api/pos/checkout', payload);
      setReceipt(data);
      setMessage('結帳完成');
      setCart([]);
      setMember(null);
      setMemberPhone('');
      setPaymentMethod('cash');
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

            <div className="rounded-2xl border border-sand/60">
              <div className="border-b border-sand/40 bg-linen px-4 py-2 text-sm font-semibold text-dusk">
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
                      <th className="px-4 py-2 text-right">小計</th>
                      <th className="px-4 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {cart.map((item) => (
                      <tr key={item.product.id} className="border-t border-sand/40">
                        <td className="px-4 py-2">{item.product.name}</td>
                        <td className="px-4 py-2">{currency(item.product.price)}</td>
                        <td className="px-4 py-2">
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              className="rounded-full border border-sand/60 px-2"
                              onClick={() => updateQuantity(item.product.id, -1)}
                              disabled={isSubmitting}
                            >
                              -
                            </button>
                            <span className="w-8 text-center">{item.quantity}</span>
                            <button
                              type="button"
                              className="rounded-full border border-sand/60 px-2"
                              onClick={() => updateQuantity(item.product.id, 1)}
                              disabled={isSubmitting}
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-4 py-2 text-right">
                          {currency(item.product.price * item.quantity)}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <button
                            className="text-sm text-clay hover:underline"
                            onClick={() => removeItem(item.product.id)}
                            disabled={isSubmitting}
                          >
                            移除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
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
                    }}
                    disabled={isSubmitting}
                  >
                    清除
                  </button>
                )}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  type="tel"
                  className="flex-1 rounded-xl border border-sand/60 px-3 py-2"
                  placeholder="輸入電話"
                  value={memberPhone}
                  onChange={(event) => setMemberPhone(event.target.value)}
                  disabled={lookupLoading || isSubmitting}
                />
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

            <div className="rounded-2xl border border-sand/60 p-4 space-y-2 text-sm">
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
              {receipt.discounts.birthday_discount_applied ? (
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
