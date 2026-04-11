"use client";

import clsx from "clsx";
import { useEffect, useMemo, useState } from "react";
import {
  apiClient,
  OrderRecord,
  OrderUpdatePayload,
  PaginatedResponse,
  PaymentMethod,
  PosCheckoutItemPayload,
  PosProduct,
} from "@/lib/api";
import { DatePickerField } from "@/components/DatePickerField";
import { PaginationControls } from "@/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";

type EditableOrderItem = {
  product_id: number;
  product_name: string;
  barcode: string;
  unit_price: number;
  quantity: number;
  custom_price_used?: boolean;
  custom_reason?: string | null;
  is_new_item?: boolean;
};

const paymentLabels: Record<PaymentMethod, string> = {
  cash: "現金",
  transfer: "轉帳",
  mobile: "行動支付",
};

const currency = (value: number) => Math.round(value).toLocaleString("zh-TW");

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

function getOrderDiscountLabel(order: OrderRecord): string {
  if (order.birthday_discount_applied) return "生日 88 折";
  if (order.member_discount_applied) return "會員 95 折";
  if (order.discount_total > 0) return "自訂折扣";
  return "無折扣";
}

export default function OrdersPage() {
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [filterDate, setFilterDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalOrders, setTotalOrders] = useState(0);
  const [cancelingId, setCancelingId] = useState<number | null>(null);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [editingOrder, setEditingOrder] = useState<OrderRecord | null>(null);
  const [editForm, setEditForm] = useState<OrderUpdatePayload>({});
  const [editItems, setEditItems] = useState<EditableOrderItem[]>([]);
  const [itemBarcode, setItemBarcode] = useState("");
  const [itemError, setItemError] = useState<string | null>(null);
  const [editError, setEditError] = useState<string | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [addingItem, setAddingItem] = useState(false);

  const activeOrders = useMemo(
    () => orders.filter((order) => !order.is_cancelled),
    [orders],
  );

  const totalGross = useMemo(
    () => activeOrders.reduce((acc, order) => acc + order.gross_total, 0),
    [activeOrders],
  );
  const totalNet = useMemo(
    () => activeOrders.reduce((acc, order) => acc + order.total_price, 0),
    [activeOrders],
  );
  const totalProfit = useMemo(
    () => activeOrders.reduce((acc, order) => acc + order.profit_total, 0),
    [activeOrders],
  );

  async function fetchOrders(options?: { date?: string; page?: number }) {
    const targetDate = options?.date ?? filterDate;
    const nextPage = options?.page ?? page;
    setLoading(true);
    setError(null);
    setCancelError(null);
    try {
      const { data } = await apiClient.get<PaginatedResponse<OrderRecord>>(
        "/api/orders",
        {
          params: { target_date: targetDate, page: nextPage, size: PAGE_SIZE },
        },
      );
      const totalPages = Math.max(
        1,
        Math.ceil(Math.max(data.total, 0) / PAGE_SIZE),
      );
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchOrders({ date: targetDate, page: totalPages });
        return;
      }
      setOrders(data.data);
      setTotalOrders(data.total);
      setPage(Math.min(nextPage, totalPages));
    } catch (err) {
      setError("無法取得訂單，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  function handleOrderPageChange(nextPage: number) {
    fetchOrders({ page: nextPage });
  }

  useEffect(() => {
    fetchOrders({ date: filterDate, page: 1 });
  }, [filterDate]);

  function openEditModal(order: OrderRecord) {
    if (order.is_cancelled) return;
    setEditingOrder(order);
    setEditForm({
      payment_method: order.payment_method,
      member_phone: order.member?.phone ?? "",
      note: order.note ?? "",
    });
    setEditItems(
      order.items.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        barcode: item.barcode,
        unit_price: item.unit_price,
        quantity: item.quantity,
        custom_price_used: item.custom_price_used ?? false,
        custom_reason: item.custom_reason ?? null,
        is_new_item: false,
      })),
    );
    setItemBarcode("");
    setItemError(null);
    setEditError(null);
  }

  function closeEditModal() {
    if (editLoading) return;
    setEditingOrder(null);
    setEditForm({});
    setEditItems([]);
    setItemBarcode("");
    setItemError(null);
    setEditError(null);
  }

  function updateItemQuantity(productId: number, delta: number) {
    setEditItems((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== productId) return item;
          const nextQuantity = item.quantity + delta;
          return nextQuantity > 0 ? { ...item, quantity: nextQuantity } : null;
        })
        .filter((item): item is EditableOrderItem => Boolean(item)),
    );
  }

  function removeItem(productId: number) {
    setEditItems((prev) =>
      prev.filter((item) => item.product_id !== productId),
    );
  }

  async function handleCancelOrder(order: OrderRecord) {
    if (order.is_cancelled) return;
    const confirmed = window.confirm("確定要取消這筆訂單嗎？商品庫存會恢復。");
    if (!confirmed) return;

    setCancelError(null);
    setCancelingId(order.id);
    try {
      const { data } = await apiClient.post<OrderRecord>(
        `/api/orders/${order.id}/cancel`,
      );
      setOrders((prev) =>
        prev.map((item) => (item.id === data.id ? data : item)),
      );
      if (editingOrder?.id === order.id) {
        closeEditModal();
      }
    } catch (err) {
      setCancelError("取消訂單失敗，請稍後再試");
    } finally {
      setCancelingId(null);
    }
  }

  async function handleAddItemByBarcode() {
    if (!itemBarcode.trim()) return;
    setAddingItem(true);
    setItemError(null);
    try {
      const { data } = await apiClient.get<PosProduct>(
        `/api/pos/products/${itemBarcode.trim()}`,
      );
      setEditItems((prev) => {
        const existing = prev.find((item) => item.product_id === data.id);
        if (existing) {
          return prev.map((item) =>
            item.product_id === data.id
              ? { ...item, quantity: item.quantity + 1 }
              : item,
          );
        }
        return [
          ...prev,
          {
            product_id: data.id,
            product_name: data.name,
            barcode: data.barcode,
            unit_price: data.price,
            quantity: 1,
            is_new_item: true,
          },
        ];
      });
      setItemBarcode("");
    } catch (err) {
      setItemError("找不到對應商品，請確認條碼");
    } finally {
      setAddingItem(false);
    }
  }

  async function handleEditSubmit() {
    if (!editingOrder) return;
    if (editItems.length === 0) {
      setItemError("訂單需至少保留一個商品");
      return;
    }
    setEditLoading(true);
    setEditError(null);
    try {
      const sanitizedPhone = editForm.member_phone?.trim();
      const payload: OrderUpdatePayload = {
        payment_method: editForm.payment_method ?? editingOrder.payment_method,
        note: editForm.note ?? "",
        member_phone: sanitizedPhone ?? "",
        items: editItems.map<PosCheckoutItemPayload>((item) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          // 既有品項永遠帶原始售價，避免商品定價變動時影響已成立的訂單
          // 新增品項（條碼掃描）不帶 custom_price，後端使用現在的定價
          ...(!item.is_new_item
            ? {
                custom_price: item.unit_price,
                custom_reason: item.custom_reason ?? undefined,
              }
            : {}),
        })),
      };
      const { data } = await apiClient.put<OrderRecord>(
        `/api/orders/${editingOrder.id}`,
        payload,
      );
      setOrders((prev) =>
        prev.map((order) => (order.id === data.id ? data : order)),
      );
      closeEditModal();
    } catch (err) {
      setEditError("更新訂單失敗，請確認資料或庫存");
    } finally {
      setEditLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
              Orders
            </p>
            <h3 className="text-2xl font-semibold">銷售訂單</h3>
            <p className="text-sm text-dusk/70">
              預設顯示今日訂單，可切換日期進行查詢。
            </p>
          </div>
          <div className="flex items-center gap-3 md:gap-5">
            <label className="flex flex-col text-sm font-medium text-dusk/70">
              日期
              <div className="mt-1 w-64 md:w-72">
                <DatePickerField
                  className="w-full"
                  value={filterDate}
                  onChange={setFilterDate}
                  disabled={loading}
                />
              </div>
            </label>
          </div>
        </div>
        {error && <p className="mt-4 text-sm text-clay">{error}</p>}
        {cancelError && <p className="mt-2 text-sm text-clay">{cancelError}</p>}
        <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
          <div className="rounded-2xl bg-linen/60 p-4">
            <p className="text-xs text-dusk/60">毛額 (含折扣前)</p>
            <p className="text-lg font-semibold">{currency(totalGross)}</p>
          </div>
          <div className="rounded-2xl bg-linen/60 p-4">
            <p className="text-xs text-dusk/60">實收</p>
            <p className="text-lg font-semibold text-moss">
              {currency(totalNet)}
            </p>
          </div>
          <div className="rounded-2xl bg-linen/60 p-4">
            <p className="text-xs text-dusk/60">毛利</p>
            <p className="text-lg font-semibold text-dusk">
              {currency(totalProfit)}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-dusk/70">共 {totalOrders} 筆訂單</p>
        </div>
        {loading ? (
          <p className="text-sm text-dusk/70">載入中...</p>
        ) : orders.length === 0 ? (
          <p className="text-sm text-dusk/70">尚無訂單。</p>
        ) : (
          <div className="space-y-4">
            {orders.map((order) => (
              <div
                key={order.id}
                className={clsx(
                  "rounded-2xl border bg-white/90 p-4 shadow-sm transition overflow-hidden",
                  order.is_cancelled
                    ? "border-clay/50 bg-linen/60 text-dusk/70"
                    : "border-sand/50 hover:border-dusk/50",
                )}
              >
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                      #{order.id}
                    </p>
                    <p className="text-lg font-semibold text-dusk">
                      {new Date(order.created_at).toLocaleTimeString("zh-TW", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                    <p className="text-sm text-dusk/70">
                      {paymentLabels[order.payment_method]} · 實收{" "}
                      {currency(order.total_price)}
                    </p>
                    {order.member && (
                      <p className="text-xs text-dusk/60">
                        會員：{order.member.name ?? "-"}（
                        {order.member.member_code ?? "N/A"}）
                      </p>
                    )}
                    {order.reservation_id && (
                      <p className="text-xs text-amber-700">
                        來源：預定/留貨 #{order.reservation_id}
                      </p>
                    )}
                    {order.is_cancelled && (
                      <p className="mt-1 text-xs font-semibold text-clay">
                        此訂單已取消，不列入統計
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {order.is_cancelled && (
                      <span className="rounded-full bg-clay/10 px-3 py-1 text-xs font-semibold text-clay">
                        已取消
                      </span>
                    )}
                    <button
                      className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk disabled:opacity-60"
                      onClick={() => openEditModal(order)}
                      disabled={order.is_cancelled}
                    >
                      編輯
                    </button>
                    {!order.is_cancelled && (
                      <button
                        className="rounded-full border border-clay/60 px-4 py-2 text-sm text-clay shadow-sm disabled:opacity-60"
                        onClick={() => handleCancelOrder(order)}
                        disabled={cancelingId === order.id}
                      >
                        {cancelingId === order.id ? "取消中..." : "取消訂單"}
                      </button>
                    )}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-xs text-dusk/70">
                  <span className="rounded-full bg-linen/60 px-3 py-1">
                    優惠：{getOrderDiscountLabel(order)}
                  </span>
                  {order.discount_total > 0 && (
                    <span className="rounded-full bg-linen/60 px-3 py-1">
                      折抵金額：{currency(order.discount_total)}
                    </span>
                  )}
                </div>
                <div className="mt-3 grid gap-2 text-sm md:grid-cols-4">
                  <div>
                    <p className="text-xs text-dusk/60">毛額</p>
                    <p>{currency(order.gross_total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dusk/60">折扣</p>
                    <p className="text-clay">
                      - {currency(order.discount_total)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-dusk/60">成本</p>
                    <p>{currency(order.cost_total)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-dusk/60">毛利</p>
                    <p className="text-moss">{currency(order.profit_total)}</p>
                  </div>
                </div>
                {order.note && (
                  <p className="mt-2 rounded-xl bg-linen/60 px-3 py-2 text-xs text-dusk/70">
                    備註：{order.note}
                  </p>
                )}
                <details className="mt-3 rounded-xl border border-sand/50 bg-linen/40 px-4 py-3 text-sm">
                  <summary className="cursor-pointer text-dusk/80">
                    商品明細
                  </summary>
                  <div className="mt-2 space-y-2">
                    {order.items.map((item) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap justify-between text-xs"
                      >
                        <div className="font-medium text-dusk">
                          {item.product_name}{" "}
                          {(item.color || item.size) && (
                            <span className="ml-1 text-[11px] text-dusk/50">
                              {[item.color, item.size]
                                .filter(Boolean)
                                .join(" / ")}
                            </span>
                          )}
                          {item.custom_price_used && (
                            <span className="ml-2 rounded-full bg-moss/10 px-2 py-0.5 text-[11px] text-moss">
                              特價
                            </span>
                          )}
                          {item.custom_reason && (
                            <span className="ml-1 text-[11px] text-dusk/60">
                              ({item.custom_reason})
                            </span>
                          )}
                        </div>
                        <span>
                          {item.quantity} × {currency(item.unit_price)} ={" "}
                          {currency(item.subtotal)}
                        </span>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
        <PaginationControls
          page={page}
          size={PAGE_SIZE}
          total={totalOrders}
          onPageChange={handleOrderPageChange}
        />
      </section>

      {editingOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-dusk/60"
            onClick={closeEditModal}
          />
          <div className="relative z-10 w-full max-w-3xl rounded-2xl border border-sand/60 bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  Edit Order
                </p>
                <h4 className="text-xl font-semibold">
                  訂單 #{editingOrder.id}
                </h4>
              </div>
              <button className="text-sm text-dusk/60" onClick={closeEditModal}>
                Close
              </button>
            </div>
            <div className="mt-4 grid gap-6 lg:grid-cols-2">
              <div className="space-y-4 text-sm">
                <label className="flex flex-col gap-1">
                  付款方式
                  <div className="grid grid-cols-3 gap-2">
                    {Object.entries(paymentLabels).map(([value, label]) => (
                      <button
                        key={value}
                        type="button"
                        className={clsx(
                          "rounded-xl border px-3 py-2",
                          editForm.payment_method === value
                            ? "border-dusk bg-dusk text-white"
                            : "border-sand/60 text-dusk",
                        )}
                        onClick={() =>
                          setEditForm((prev) => ({
                            ...prev,
                            payment_method: value as PaymentMethod,
                          }))
                        }
                        disabled={editLoading}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="flex flex-col gap-1">
                  會員電話
                  <input
                    type="tel"
                    className="rounded-xl border border-sand/60 px-3 py-2"
                    value={editForm.member_phone ?? ""}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        member_phone: event.target.value,
                      }))
                    }
                    placeholder="空白表示移除會員"
                    disabled={editLoading}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  備註
                  <textarea
                    className="rounded-xl border border-sand/60 px-3 py-2"
                    rows={3}
                    value={editForm.note ?? ""}
                    onChange={(event) =>
                      setEditForm((prev) => ({
                        ...prev,
                        note: event.target.value,
                      }))
                    }
                    disabled={editLoading}
                  />
                </label>
              </div>

              <div className="space-y-4 text-sm">
                <form
                  className="flex gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleAddItemByBarcode();
                  }}
                >
                  <input
                    type="text"
                    className="flex-1 rounded-xl border border-sand/60 px-3 py-2"
                    placeholder="掃描或輸入條碼"
                    value={itemBarcode}
                    onChange={(event) => setItemBarcode(event.target.value)}
                    disabled={addingItem || editLoading}
                  />
                  <button
                    type="submit"
                    className="rounded-xl bg-dusk px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
                    disabled={addingItem || editLoading}
                  >
                    加入
                  </button>
                </form>
                {itemError && <p className="text-xs text-clay">{itemError}</p>}
                <div className="rounded-xl border border-sand/60 overflow-hidden">
                  <div className="border-b border-sand/40 bg-linen px-3 py-2 text-xs font-semibold">
                    商品
                  </div>
                  {editItems.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-dusk/60">
                      目前沒有商品
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-left">
                            <th className="px-3 py-2">名稱</th>
                            <th className="px-3 py-2">數量</th>
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2" />
                          </tr>
                        </thead>
                        <tbody>
                          {editItems.map((item) => (
                            <tr
                              key={item.product_id}
                              className="border-t border-sand/40"
                            >
                              <td className="px-3 py-2">{item.product_name}</td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-full border border-sand/60 px-2"
                                    onClick={() =>
                                      updateItemQuantity(item.product_id, -1)
                                    }
                                    disabled={editLoading}
                                  >
                                    -
                                  </button>
                                  <span className="w-8 text-center">
                                    {item.quantity}
                                  </span>
                                  <button
                                    type="button"
                                    className="rounded-full border border-sand/60 px-2"
                                    onClick={() =>
                                      updateItemQuantity(item.product_id, 1)
                                    }
                                    disabled={editLoading}
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                {currency(item.unit_price * item.quantity)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  className="text-clay hover:underline"
                                  onClick={() => removeItem(item.product_id)}
                                  disabled={editLoading}
                                >
                                  移除
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {editError && <p className="mt-4 text-sm text-clay">{editError}</p>}

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                className="rounded-full px-4 py-2 text-sm text-dusk/70 hover:bg-linen"
                onClick={closeEditModal}
                disabled={editLoading}
              >
                取消
              </button>
              <button
                type="button"
                className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
                onClick={handleEditSubmit}
                disabled={editLoading}
              >
                {editLoading ? "儲存中..." : "儲存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
