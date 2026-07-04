"use client";

import clsx from "clsx";
import { FormEvent, useRef, useState } from "react";
import {
  apiClient,
  extractApiError,
  ExchangeCheckoutPayload,
  ExchangeCheckoutResponse,
  ExchangeOriginalItem,
  ExchangeOriginalLookupResponse,
  OrderMemberInfo,
  OrderRecord,
  PaginatedResponse,
  PaymentMethod,
  PosCheckoutItemPayload,
  PosMemberInfo,
} from "@/lib/api";
import { DatePickerField } from "@/components/DatePickerField";

type ReturnRow = {
  item: ExchangeOriginalItem;
  selected: boolean;
  quantity: number;
  refundPrice: number;
};

type PurchaseRow = {
  product_id: number;
  name: string;
  barcode: string;
  price: number;
  quantity: number;
  custom_price: number | null;
  custom_reason: string;
};

const currency = (v: number) => Math.round(v).toLocaleString("zh-TW");

const paymentOptions: { label: string; value: PaymentMethod }[] = [
  { label: "現金", value: "cash" },
  { label: "轉帳", value: "transfer" },
  { label: "行動支付", value: "mobile" },
];

interface Props {
  onExchangeComplete: (resp: ExchangeCheckoutResponse) => void;
}

export function ExchangePanel({ onExchangeComplete }: Props) {
  const barcodeRef = useRef<HTMLInputElement>(null);

  // ── Order search ─────────────────────────────────────────────────────────
  const [searchDate, setSearchDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [searchProduct, setSearchProduct] = useState("");
  const [searchMember, setSearchMember] = useState("");
  const [searchResults, setSearchResults] = useState<OrderRecord[]>([]);
  const [searchTotal, setSearchTotal] = useState(0);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const SEARCH_SIZE = 10;

  // ── Order ID quick input ──────────────────────────────────────────────────
  const [orderIdInput, setOrderIdInput] = useState("");

  // ── Exchange lookup (after order selected) ────────────────────────────────
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookupData, setLookupData] =
    useState<ExchangeOriginalLookupResponse | null>(null);
  const [returnRows, setReturnRows] = useState<ReturnRow[]>([]);

  // ── Purchase items ────────────────────────────────────────────────────────
  const [barcode, setBarcode] = useState("");
  const [purchaseRows, setPurchaseRows] = useState<PurchaseRow[]>([]);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // ── Checkout options ──────────────────────────────────────────────────────
  const [memberPhone, setMemberPhone] = useState("");
  const [memberInfo, setMemberInfo] = useState<PosMemberInfo | null>(null);
  const [memberLoading, setMemberLoading] = useState(false);
  const [memberError, setMemberError] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cash");
  const [manualDiscountInput, setManualDiscountInput] = useState("");
  const [manualDiscountRate, setManualDiscountRate] = useState<number | null>(
    null,
  );
  const [discountError, setDiscountError] = useState<string | null>(null);
  const [roundDown, setRoundDown] = useState(false);
  const [note, setNote] = useState("");
  const [submitLoading, setSubmitLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Search ────────────────────────────────────────────────────────────────

  async function handleSearch(page = 1) {
    const isKeyword = Boolean(searchProduct.trim() || searchMember.trim());
    setSearchLoading(true);
    setSearchError(null);
    setSearchPage(page);
    try {
      const params: Record<string, string | number> = {
        page,
        size: SEARCH_SIZE,
      };
      if (searchDate) params.target_date = searchDate;
      if (searchProduct.trim()) params.product_name = searchProduct.trim();
      if (searchMember.trim()) params.member_name = searchMember.trim();
      // When keyword search without explicit date, let backend default (no date filter)
      if (isKeyword && !searchDate) delete params.target_date;
      const { data } =
        await apiClient.get<PaginatedResponse<OrderRecord>>("/api/orders", {
          params,
        });
      setSearchResults(data.data);
      setSearchTotal(data.total);
    } catch (err) {
      setSearchError(extractApiError(err, "搜尋失敗，請稍後再試"));
    } finally {
      setSearchLoading(false);
    }
  }

  // ── Load selected order for exchange ─────────────────────────────────────

  async function loadOrder(id: number) {
    setLookupLoading(true);
    setLookupError(null);
    setLookupData(null);
    setReturnRows([]);
    try {
      const { data } = await apiClient.get<ExchangeOriginalLookupResponse>(
        `/api/pos/orders/${id}/exchange-lookup`,
      );
      setLookupData(data);
      setReturnRows(
        data.items.map((item) => ({
          item,
          selected: false,
          quantity: 1,
          refundPrice: item.sold_unit_price,
        })),
      );
      if (data.member?.phone) setMemberPhone(data.member.phone);
    } catch (err) {
      setLookupError(extractApiError(err, "查詢失敗，請確認訂單編號"));
    } finally {
      setLookupLoading(false);
    }
  }

  async function handleDirectLookup(e: FormEvent) {
    e.preventDefault();
    const id = parseInt(orderIdInput.trim(), 10);
    if (!id) {
      setLookupError("請輸入有效的訂單編號");
      return;
    }
    await loadOrder(id);
  }

  function handleReset() {
    setOrderIdInput("");
    setLookupData(null);
    setReturnRows([]);
    setPurchaseRows([]);
    setMemberPhone("");
    setMemberInfo(null);
    setBarcode("");
    setManualDiscountInput("");
    setManualDiscountRate(null);
    setRoundDown(false);
    setNote("");
    setSubmitError(null);
    setLookupError(null);
    setScanError(null);
    setSearchResults([]);
    setSearchTotal(0);
  }

  // ── Return row controls ───────────────────────────────────────────────────

  function toggleReturnRow(idx: number) {
    setReturnRows((rows) =>
      rows.map((r, i) => (i === idx ? { ...r, selected: !r.selected } : r)),
    );
  }

  function setReturnQty(idx: number, qty: number) {
    setReturnRows((rows) =>
      rows.map((r, i) => {
        if (i !== idx) return r;
        return {
          ...r,
          quantity: Math.max(1, Math.min(qty, r.item.refundable_quantity)),
        };
      }),
    );
  }

  function setRefundPrice(idx: number, price: number) {
    setReturnRows((rows) =>
      rows.map((r, i) =>
        i === idx ? { ...r, refundPrice: Math.max(0, price) } : r,
      ),
    );
  }

  // ── Purchase scan ─────────────────────────────────────────────────────────

  async function handleScan(e: FormEvent) {
    e.preventDefault();
    if (!barcode.trim()) return;
    setScanLoading(true);
    setScanError(null);
    try {
      const { data } = await apiClient.get(
        `/api/pos/products/${barcode.trim()}`,
      );
      setPurchaseRows((rows) => {
        const existing = rows.find((r) => r.product_id === data.id);
        if (existing)
          return rows.map((r) =>
            r.product_id === data.id ? { ...r, quantity: r.quantity + 1 } : r,
          );
        return [
          ...rows,
          {
            product_id: data.id,
            name: data.name,
            barcode: data.barcode,
            price: data.price,
            quantity: 1,
            custom_price: null,
            custom_reason: "",
          },
        ];
      });
      setBarcode("");
      barcodeRef.current?.focus();
    } catch {
      setScanError("找不到對應條碼");
    } finally {
      setScanLoading(false);
    }
  }

  function adjustPurchaseQty(productId: number, delta: number) {
    setPurchaseRows((rows) =>
      rows
        .map((r) =>
          r.product_id === productId ? { ...r, quantity: r.quantity + delta } : r,
        )
        .filter((r) => r.quantity > 0),
    );
  }

  function removePurchaseRow(productId: number) {
    setPurchaseRows((rows) => rows.filter((r) => r.product_id !== productId));
  }

  // ── Member lookup ─────────────────────────────────────────────────────────

  async function handleMemberLookup() {
    if (!memberPhone.trim()) {
      setMemberInfo(null);
      return;
    }
    setMemberLoading(true);
    setMemberError(null);
    try {
      const { data } = await apiClient.get<PosMemberInfo>(
        "/api/pos/members/by-phone",
        { params: { phone: memberPhone.trim() } },
      );
      setMemberInfo(data);
    } catch {
      setMemberInfo(null);
      setMemberError("找不到此會員");
    } finally {
      setMemberLoading(false);
    }
  }

  // ── Discount ──────────────────────────────────────────────────────────────

  function handleDiscountInput(value: string) {
    setManualDiscountInput(value);
    if (!value.trim()) {
      setManualDiscountRate(null);
      setDiscountError(null);
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0 || n > 90) {
      setManualDiscountRate(null);
      setDiscountError("折扣必須介於 0% 至 90%");
      return;
    }
    setManualDiscountRate(n / 100);
    setDiscountError(null);
  }

  // ── Derived totals ────────────────────────────────────────────────────────

  const selectedReturns = returnRows.filter((r) => r.selected);
  const refundTotal = selectedReturns.reduce(
    (sum, r) => sum + r.refundPrice * r.quantity,
    0,
  );
  const purchaseGross = purchaseRows.reduce(
    (sum, r) => sum + (r.custom_price ?? r.price) * r.quantity,
    0,
  );
  const memberDiscountRate =
    memberInfo?.is_birthday_month && memberInfo.birthday_discount_available
      ? 0.12
      : 0.05;
  const appliedRate =
    manualDiscountRate ?? (memberInfo ? memberDiscountRate : 0);
  const estimatedDiscount = Math.round(purchaseGross * appliedRate);
  const purchaseNet = Math.max(purchaseGross - estimatedDiscount, 0);
  const netPayable = purchaseNet - refundTotal;

  // ── Checkout ──────────────────────────────────────────────────────────────

  async function handleCheckout() {
    if (selectedReturns.length === 0) {
      setSubmitError("請至少選擇一項退回商品");
      return;
    }
    setSubmitLoading(true);
    setSubmitError(null);
    const payload: ExchangeCheckoutPayload = {
      original_order_id: lookupData?.order_id ?? null,
      member_phone: memberPhone.trim() || null,
      payment_method: paymentMethod,
      return_items: selectedReturns.map((r) => ({
        original_order_item_id: r.item.order_item_id,
        product_id: r.item.product_id,
        quantity: r.quantity,
        refund_unit_price: r.refundPrice,
      })),
      purchase_items: purchaseRows.map(
        (r): PosCheckoutItemPayload => ({
          product_id: r.product_id,
          quantity: r.quantity,
          custom_price: r.custom_price ?? undefined,
          custom_reason: r.custom_reason || undefined,
        }),
      ),
      manual_discount_rate: manualDiscountRate,
      round_down_to_ten: roundDown,
      note: note.trim() || null,
    };
    try {
      const { data } = await apiClient.post<ExchangeCheckoutResponse>(
        "/api/pos/exchange",
        payload,
      );
      onExchangeComplete(data);
      handleReset();
    } catch (err) {
      setSubmitError(extractApiError(err, "換貨失敗，請確認庫存與資料"));
    } finally {
      setSubmitLoading(false);
    }
  }

  const originalMember: OrderMemberInfo | null = lookupData?.member ?? null;
  const totalSearchPages = Math.ceil(searchTotal / SEARCH_SIZE);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="mt-6 space-y-6">
      {/* Step 1: find original order */}
      <div className="rounded-2xl border border-sand/60 bg-white/90 p-5 shadow-sm">
        <p className="mb-4 text-sm font-semibold text-dusk">
          第一步：找到原始訂單
        </p>

        {/* Search bar */}
        {!lookupData && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <label className="flex flex-col text-xs text-dusk/70">
                日期
                <div className="mt-1 w-40">
                  <DatePickerField
                    value={searchDate}
                    onChange={setSearchDate}
                    disabled={searchLoading}
                  />
                </div>
              </label>
              <label className="flex flex-col text-xs text-dusk/70">
                商品名稱
                <input
                  type="text"
                  className="mt-1 w-36 rounded-xl border border-sand/60 px-3 py-2 text-sm"
                  placeholder="搜尋商品…"
                  value={searchProduct}
                  onChange={(e) => setSearchProduct(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch(1)}
                  disabled={searchLoading}
                />
              </label>
              <label className="flex flex-col text-xs text-dusk/70">
                會員名稱
                <input
                  type="text"
                  className="mt-1 w-32 rounded-xl border border-sand/60 px-3 py-2 text-sm"
                  placeholder="搜尋會員…"
                  value={searchMember}
                  onChange={(e) => setSearchMember(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch(1)}
                  disabled={searchLoading}
                />
              </label>
              <button
                type="button"
                className="rounded-xl bg-dusk px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60 min-h-[40px]"
                onClick={() => handleSearch(1)}
                disabled={searchLoading}
              >
                {searchLoading ? "搜尋中…" : "搜尋"}
              </button>
            </div>

            {searchError && (
              <p className="text-sm text-clay">{searchError}</p>
            )}

            {/* Search results */}
            {searchResults.length > 0 && (
              <div className="rounded-xl border border-sand/40 bg-white">
                <div className="rounded-t-xl border-b border-sand/30 bg-linen/60 px-4 py-2 text-xs text-dusk/70">
                  共 {searchTotal} 筆，顯示第 {(searchPage - 1) * SEARCH_SIZE + 1}–
                  {Math.min(searchPage * SEARCH_SIZE, searchTotal)} 筆
                </div>
                <ul className="divide-y divide-sand/20">
                  {searchResults.map((order) => (
                    <li
                      key={order.id}
                      className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-linen/40"
                    >
                      <div className="min-w-0 flex-1 text-sm">
                        <div className="flex flex-wrap items-baseline gap-2">
                          <span className="font-semibold text-dusk">
                            #{order.id}
                          </span>
                          <span className="text-xs text-dusk/60">
                            {new Date(order.created_at).toLocaleString("zh-TW")}
                          </span>
                          {order.member?.name && (
                            <span className="text-xs text-moss">
                              {order.member.name}
                            </span>
                          )}
                          {order.is_cancelled && (
                            <span className="rounded-full bg-clay/10 px-1.5 py-0.5 text-xs text-clay">
                              已取消
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-dusk/50">
                          {order.items
                            .filter((i) => !i.is_return)
                            .map((i) => i.product_name)
                            .join("、") || "—"}
                        </p>
                        <p className="text-xs text-dusk/60">
                          實收 {currency(order.total_price)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="shrink-0 rounded-xl bg-dusk px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60 min-h-[36px]"
                        onClick={() => loadOrder(order.id)}
                        disabled={lookupLoading || order.is_cancelled}
                      >
                        選擇
                      </button>
                    </li>
                  ))}
                </ul>
                {totalSearchPages > 1 && (
                  <div className="flex justify-center gap-2 border-t border-sand/30 px-4 py-3">
                    <button
                      type="button"
                      className="rounded-lg border border-sand/60 px-3 py-1 text-xs disabled:opacity-40"
                      disabled={searchPage <= 1 || searchLoading}
                      onClick={() => handleSearch(searchPage - 1)}
                    >
                      ← 上一頁
                    </button>
                    <span className="px-2 py-1 text-xs text-dusk/60">
                      {searchPage} / {totalSearchPages}
                    </span>
                    <button
                      type="button"
                      className="rounded-lg border border-sand/60 px-3 py-1 text-xs disabled:opacity-40"
                      disabled={searchPage >= totalSearchPages || searchLoading}
                      onClick={() => handleSearch(searchPage + 1)}
                    >
                      下一頁 →
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 border-t border-sand/40" />
              <span className="text-xs text-dusk/40">或直接輸入訂單編號</span>
              <div className="flex-1 border-t border-sand/40" />
            </div>

            {/* Direct order ID */}
            <form onSubmit={handleDirectLookup} className="flex gap-3">
              <input
                type="number"
                inputMode="numeric"
                min="1"
                className="flex-1 rounded-2xl border border-sand/60 px-4 py-2 text-base"
                placeholder="訂單 #"
                value={orderIdInput}
                onChange={(e) => setOrderIdInput(e.target.value)}
                disabled={lookupLoading}
              />
              <button
                type="submit"
                className="rounded-2xl bg-moss px-5 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
                disabled={lookupLoading || !orderIdInput.trim()}
              >
                {lookupLoading ? "載入中…" : "直接查詢"}
              </button>
            </form>
          </div>
        )}

        {lookupError && <p className="mt-2 text-sm text-clay">{lookupError}</p>}

        {lookupData && (
          <div className="flex items-center justify-between rounded-xl bg-linen/60 px-4 py-3 text-sm">
            <div>
              <span className="font-semibold text-dusk">
                訂單 #{lookupData.order_id}
              </span>
              {" · "}
              {new Date(lookupData.created_at).toLocaleString("zh-TW")}
              {originalMember?.name && (
                <span className="ml-2 text-dusk/70">
                  · {originalMember.name}（{originalMember.phone ?? ""}）
                </span>
              )}
            </div>
            <button
              type="button"
              className="ml-4 shrink-0 text-xs text-dusk/60 hover:text-dusk"
              onClick={handleReset}
              disabled={submitLoading}
            >
              重新選擇
            </button>
          </div>
        )}
      </div>

      {/* Step 2: exchange builder */}
      {lookupData && (
        <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
          {/* Left */}
          <div className="space-y-5">
            {/* Return items */}
            <div className="rounded-2xl border border-sand/60 bg-white/90 shadow-sm">
              <div className="rounded-t-2xl border-b border-sand/40 bg-linen px-4 py-2 text-sm font-semibold text-dusk">
                退回商品（A）
              </div>
              {returnRows.length === 0 ? (
                <p className="px-4 py-4 text-sm text-dusk/60">
                  此訂單無可退商品。
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-linen/50 text-left">
                    <tr>
                      <th className="px-3 py-2">退回</th>
                      <th className="px-3 py-2">品名</th>
                      <th className="px-3 py-2">當初售價</th>
                      <th className="px-3 py-2">退貨數</th>
                      <th className="px-3 py-2">退款單價</th>
                    </tr>
                  </thead>
                  <tbody>
                    {returnRows.map((row, idx) => (
                      <tr
                        key={row.item.order_item_id}
                        className={clsx(
                          "border-t border-sand/20",
                          row.selected && "bg-moss/5",
                        )}
                      >
                        <td className="px-3 py-3">
                          <input
                            type="checkbox"
                            className="h-5 w-5 cursor-pointer accent-dusk"
                            checked={row.selected}
                            onChange={() => toggleReturnRow(idx)}
                            disabled={submitLoading}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <p className="font-medium">{row.item.product_name}</p>
                          {(row.item.color || row.item.size) && (
                            <p className="text-xs text-dusk/60">
                              {[row.item.color, row.item.size]
                                .filter(Boolean)
                                .join(" / ")}
                            </p>
                          )}
                          <p className="text-xs text-dusk/50">
                            可退：{row.item.refundable_quantity} 件
                          </p>
                        </td>
                        <td className="px-3 py-3 text-right">
                          {currency(row.item.sold_unit_price)}
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={1}
                            max={row.item.refundable_quantity}
                            className="w-16 rounded-lg border border-sand/60 px-2 py-1 text-center"
                            value={row.quantity}
                            onChange={(e) =>
                              setReturnQty(
                                idx,
                                parseInt(e.target.value, 10) || 1,
                              )
                            }
                            disabled={!row.selected || submitLoading}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <input
                            type="number"
                            min={0}
                            className="w-24 rounded-lg border border-sand/60 px-2 py-1 text-right"
                            value={row.refundPrice}
                            onChange={(e) =>
                              setRefundPrice(
                                idx,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            disabled={!row.selected || submitLoading}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Purchase items */}
            <div className="rounded-2xl border border-sand/60 bg-white/90 shadow-sm">
              <div className="rounded-t-2xl border-b border-sand/40 bg-linen px-4 py-2 text-sm font-semibold text-dusk">
                換購商品（B）
              </div>
              <div className="p-4">
                <form onSubmit={handleScan} className="flex gap-3">
                  <input
                    ref={barcodeRef}
                    type="text"
                    inputMode="numeric"
                    className="flex-1 rounded-xl border border-sand/60 px-3 py-2 text-sm"
                    placeholder="掃描換購商品條碼"
                    value={barcode}
                    onChange={(e) => setBarcode(e.target.value)}
                    disabled={scanLoading || submitLoading}
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-dusk px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={scanLoading || submitLoading || !barcode.trim()}
                  >
                    加入
                  </button>
                </form>
                {scanError && (
                  <p className="mt-1 text-xs text-clay">{scanError}</p>
                )}
                {purchaseRows.length > 0 && (
                  <table className="mt-3 w-full text-sm">
                    <thead className="bg-linen/50 text-left">
                      <tr>
                        <th className="px-3 py-2">品名</th>
                        <th className="px-3 py-2">單價</th>
                        <th className="px-3 py-2">數量</th>
                        <th className="px-3 py-2 text-right">小計</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseRows.map((row) => (
                        <tr
                          key={row.product_id}
                          className="border-t border-sand/20"
                        >
                          <td className="px-3 py-2">{row.name}</td>
                          <td className="px-3 py-2">
                            {currency(row.custom_price ?? row.price)}
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-1">
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-sand/60 text-sm"
                                onClick={() =>
                                  adjustPurchaseQty(row.product_id, -1)
                                }
                                disabled={submitLoading}
                              >
                                −
                              </button>
                              <span className="w-6 text-center">
                                {row.quantity}
                              </span>
                              <button
                                type="button"
                                className="flex h-7 w-7 items-center justify-center rounded-full border border-sand/60 text-sm"
                                onClick={() =>
                                  adjustPurchaseQty(row.product_id, 1)
                                }
                                disabled={submitLoading}
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2 text-right">
                            {currency(
                              (row.custom_price ?? row.price) * row.quantity,
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              className="text-xs text-clay hover:underline"
                              onClick={() => removePurchaseRow(row.product_id)}
                              disabled={submitLoading}
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
            </div>
          </div>

          {/* Right: member + payment + summary */}
          <div className="space-y-4">
            {/* Member */}
            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                會員
              </p>
              <div className="mt-2 flex gap-2">
                <input
                  type="tel"
                  className="flex-1 rounded-xl border border-sand/60 px-3 py-2 text-sm"
                  placeholder="電話"
                  value={memberPhone}
                  onChange={(e) => {
                    setMemberPhone(e.target.value);
                    setMemberInfo(null);
                    setMemberError(null);
                  }}
                  disabled={memberLoading || submitLoading}
                />
                <button
                  type="button"
                  className="rounded-xl bg-moss px-3 py-2 text-sm font-semibold text-white disabled:opacity-60 min-h-[44px]"
                  onClick={handleMemberLookup}
                  disabled={
                    memberLoading || submitLoading || !memberPhone.trim()
                  }
                >
                  查詢
                </button>
              </div>
              {memberError && (
                <p className="mt-1 text-xs text-clay">{memberError}</p>
              )}
              {memberInfo && (
                <div className="mt-2 rounded-xl bg-linen/80 p-3 text-xs">
                  <p className="font-semibold">{memberInfo.name}</p>
                  <p className="text-dusk/70">{memberInfo.member_code}</p>
                  <p className="mt-1 text-moss">
                    {memberInfo.is_birthday_month &&
                    memberInfo.birthday_discount_available
                      ? "生日 88 折可用"
                      : "會員 95 折"}
                  </p>
                </div>
              )}
            </div>

            {/* Payment */}
            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                付款方式
              </p>
              <div className="mt-2 grid gap-2">
                {paymentOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={clsx(
                      "rounded-xl border px-3 py-2 text-left text-sm min-h-[44px]",
                      paymentMethod === opt.value
                        ? "border-dusk bg-dusk text-white"
                        : "border-sand/60 text-dusk",
                    )}
                    onClick={() => setPaymentMethod(opt.value)}
                    disabled={submitLoading}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Discount */}
            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                換購折扣（選填）
              </p>
              <input
                type="number"
                inputMode="decimal"
                min="0"
                max="90"
                className="mt-2 w-full rounded-xl border border-sand/60 px-3 py-2 text-sm"
                placeholder="0–90（折扣百分比，如 5 代表 95 折）"
                value={manualDiscountInput}
                onChange={(e) => handleDiscountInput(e.target.value)}
                disabled={submitLoading}
              />
              {discountError && (
                <p className="mt-1 text-xs text-clay">{discountError}</p>
              )}
            </div>

            {/* Note */}
            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                備註（選填）
              </p>
              <input
                type="text"
                className="mt-2 w-full rounded-xl border border-sand/60 px-3 py-2 text-sm"
                placeholder="換貨原因或備注"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={submitLoading}
              />
            </div>

            {/* Summary + checkout */}
            <div className="rounded-2xl border border-sand/60 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                金額試算
              </p>
              <div className="mt-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span className="text-clay">退款小計</span>
                  <span className="text-clay">- {currency(refundTotal)}</span>
                </div>
                <div className="flex justify-between">
                  <span>換購小計</span>
                  <span>{currency(purchaseGross)}</span>
                </div>
                {estimatedDiscount > 0 && (
                  <div className="flex justify-between text-moss">
                    <span>折扣</span>
                    <span>- {currency(estimatedDiscount)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between border-t border-sand/40 pt-2 text-base font-semibold text-dusk">
                  <span>應收差額</span>
                  <span className={netPayable < 0 ? "text-clay" : ""}>
                    {netPayable < 0 ? "退 " : ""}
                    {currency(Math.abs(netPayable))}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className={clsx(
                  "mt-3 w-full rounded-full border px-4 py-2 text-sm font-semibold transition",
                  roundDown
                    ? "border-dusk bg-dusk text-white"
                    : "border-sand/60 text-dusk",
                )}
                onClick={() => setRoundDown(!roundDown)}
                disabled={submitLoading}
              >
                {roundDown ? "已捨去個位數（關閉）" : "無條件捨去個位數"}
              </button>

              <button
                type="button"
                className="mt-3 w-full rounded-2xl bg-dusk px-4 py-3 text-sm font-semibold text-white shadow disabled:opacity-60"
                onClick={handleCheckout}
                disabled={submitLoading || selectedReturns.length === 0}
              >
                {submitLoading ? "處理中..." : "確認換貨"}
              </button>

              {submitError && (
                <p className="mt-2 text-sm text-clay">{submitError}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
