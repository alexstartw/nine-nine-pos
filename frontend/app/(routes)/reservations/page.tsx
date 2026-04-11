"use client";

import clsx from "clsx";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiClient,
  MemberSuggestion,
  PaginatedResponse,
  PosMemberLookupResponse,
  ReservationPayload,
  ReservationPaymentStatus,
  ReservationRecord,
  ReservationStatus,
  ReservationType,
  ReservationUpdatePayload,
} from "@/lib/api";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { PaginationControls } from "@/components/PaginationControls";
import { DatePickerField } from "@/components/DatePickerField";

interface ProductOption {
  id: number;
  name: string;
  sku: string;
  barcode: string;
  color?: string | null;
  size?: string | null;
  stock: number;
  price: number;
}

type StatusFilter = "all" | ReservationStatus;
type PaymentFilter = "all" | ReservationPaymentStatus;

interface ReservationItemForm {
  product_id: number;
  name: string;
  sku: string;
  barcode: string;
  color?: string | null;
  size?: string | null;
  price: number;
  quantity: number;
}

interface ReservationFormState {
  items: ReservationItemForm[];
  customer_name: string;
  customer_phone: string;
  member_id: number | null;
  note: string;
  expected_date: string;
  hold_until: string;
  payment_status: ReservationPaymentStatus;
  paid_amount: string;
  status: ReservationStatus;
}

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

const typeTabs: { value: ReservationType; label: string }[] = [
  { value: "preorder", label: "預定（缺貨）" },
  { value: "hold", label: "留貨（現貨保留）" },
];

const statusLabels: Record<ReservationStatus, string> = {
  pending: "建立中",
  ready: "可取貨",
  completed: "已完成",
  cancelled: "已取消",
};

const paymentLabels: Record<ReservationPaymentStatus, string> = {
  unpaid: "未付款",
  paid: "已付款",
};

const statusChips: Record<ReservationStatus, string> = {
  pending: "bg-sand/60 text-dusk",
  ready: "bg-moss/20 text-moss/90",
  completed: "bg-dusk/20 text-dusk",
  cancelled: "bg-gray-200 text-gray-600",
};

const paymentChips: Record<ReservationPaymentStatus, string> = {
  unpaid: "bg-rose-100 text-rose-700",
  paid: "bg-moss/20 text-moss/90",
};

const discountPresets = [
  { label: "原價", rate: 1 },
  { label: "95 折", rate: 0.95 },
  { label: "9 折", rate: 0.9 },
  { label: "88 折", rate: 0.88 },
];

function currency(value?: number | null) {
  const normalized =
    typeof value === "number" && Number.isFinite(value) ? value : 0;
  return Math.round(normalized).toLocaleString("zh-TW");
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium" }).format(
      new Date(value),
    );
  } catch {
    return value;
  }
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("zh-TW", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function buildDefaultForm(): ReservationFormState {
  return {
    items: [],
    customer_name: "",
    customer_phone: "",
    member_id: null,
    note: "",
    expected_date: "",
    hold_until: "",
    payment_status: "unpaid",
    paid_amount: "0",
    status: "pending",
  };
}

export default function ReservationsPage() {
  const [activeType, setActiveType] = useState<ReservationType>("preorder");
  const [reservations, setReservations] = useState<ReservationRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("pending");
  const [paymentFilter, setPaymentFilter] = useState<PaymentFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalRecords, setTotalRecords] = useState(0);
  const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
  const [productSearchTerm, setProductSearchTerm] = useState("");
  const [productSearchLoading, setProductSearchLoading] = useState(false);
  const [itemProductId, setItemProductId] = useState<number | "">("");
  const [itemQuantity, setItemQuantity] = useState(1);
  const [amountMode, setAmountMode] = useState<"auto" | "manual">("auto");
  const [discountRate, setDiscountRate] = useState(1);
  const [memberSuggestions, setMemberSuggestions] = useState<
    MemberSuggestion[]
  >([]);
  const [memberSuggestionsLoading, setMemberSuggestionsLoading] =
    useState(false);
  const [selectedMember, setSelectedMember] = useState<MemberSuggestion | null>(
    null,
  );
  const [memberDiscountInfo, setMemberDiscountInfo] =
    useState<PosMemberLookupResponse | null>(null);
  const [memberSearchKeyword, setMemberSearchKeyword] = useState("");

  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [formState, setFormState] =
    useState<ReservationFormState>(buildDefaultForm);
  const [editingReservation, setEditingReservation] =
    useState<ReservationRecord | null>(null);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);

  const summary = useMemo(() => {
    const counts: Record<ReservationStatus, number> = {
      pending: 0,
      ready: 0,
      completed: 0,
      cancelled: 0,
    };
    reservations.forEach((reservation) => {
      counts[reservation.status] += 1;
    });
    return counts;
  }, [reservations]);

  const itemsSubtotal = useMemo(
    () =>
      formState.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0,
      ),
    [formState.items],
  );

  async function fetchReservations(overrides?: {
    type?: ReservationType;
    status?: StatusFilter;
    payment?: PaymentFilter;
    search?: string;
    page?: number;
  }) {
    const type = overrides?.type ?? activeType;
    const status = overrides?.status ?? statusFilter;
    const payment = overrides?.payment ?? paymentFilter;
    const keyword = overrides?.search ?? searchTerm;
    const nextPage = overrides?.page ?? page;

    setLoading(true);
    setListError(null);
    try {
      const params: Record<string, string | number | undefined> = {
        reservation_type: type,
        page: nextPage,
        size: PAGE_SIZE,
      };
      if (status !== "all") params.status = status;
      if (payment !== "all") params.payment_status = payment;
      if (keyword.trim()) params.q = keyword.trim();

      const { data } = await apiClient.get<
        PaginatedResponse<ReservationRecord>
      >("/api/reservations", {
        params,
      });
      const totalPages = Math.max(
        1,
        Math.ceil(Math.max(data.total, 0) / PAGE_SIZE),
      );
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchReservations({
          type,
          status,
          payment,
          search: keyword,
          page: totalPages,
        });
        return;
      }
      setReservations(data.data);
      setTotalRecords(data.total);
      setPage(Math.min(nextPage, totalPages));
    } catch (err) {
      setListError("無法取得預定/留貨資料，請稍後再試");
    } finally {
      setLoading(false);
    }
  }

  async function fetchProductOptions(search?: string) {
    setProductSearchLoading(true);
    try {
      const params: Record<string, string | number> = { page: 1, size: 200 };
      const keyword = search?.trim();
      if (keyword) {
        params.q = keyword;
      }
      const { data } = await apiClient.get<PaginatedResponse<ProductOption>>(
        "/api/products",
        {
          params,
        },
      );
      setProductOptions(data.data);
    } catch {
      setProductOptions([]);
    } finally {
      setProductSearchLoading(false);
    }
  }

  useEffect(() => {
    const handle = setTimeout(() => {
      fetchProductOptions(productSearchTerm);
    }, 400);
    return () => clearTimeout(handle);
  }, [productSearchTerm]);

  useEffect(() => {
    fetchReservations({ page: 1, type: activeType });
  }, [activeType, statusFilter, paymentFilter]);

  useEffect(() => {
    const keyword = memberSearchKeyword.trim();
    if (!keyword || keyword.length < 2) {
      setMemberSuggestions([]);
      setMemberSuggestionsLoading(false);
      return;
    }
    const handle = setTimeout(() => {
      fetchMemberSuggestions(keyword);
    }, 300);
    return () => clearTimeout(handle);
  }, [memberSearchKeyword]);

  function openCreateModal() {
    setFormState(buildDefaultForm());
    setModalMode("create");
    setEditingReservation(null);
    setModalError(null);
    setProductSearchTerm("");
    setItemProductId("");
    setItemQuantity(1);
    setAmountMode("auto");
    setDiscountRate(1);
    setSelectedMember(null);
    setMemberDiscountInfo(null);
    setMemberSuggestions([]);
    setMemberSearchKeyword("");
    fetchProductOptions("");
    setModalOpen(true);
  }

  function openEditModal(record: ReservationRecord) {
    setModalMode("edit");
    setEditingReservation(record);
    setFormState({
      items: record.items.map((item) => ({
        product_id: item.product_id,
        name: item.product.name,
        sku: item.product.sku,
        barcode: item.product.barcode,
        color: item.product.color ?? null,
        size: item.product.size ?? null,
        price: item.product.price,
        quantity: item.quantity,
      })),
      customer_name: record.customer_name,
      customer_phone: record.customer_phone ?? "",
      member_id: record.member_id ?? null,
      note: record.note ?? "",
      expected_date: record.expected_date ?? "",
      hold_until: record.hold_until ?? "",
      payment_status: record.payment_status,
      paid_amount: String(record.paid_amount ?? 0),
      status: record.status,
    });
    setModalError(null);
    const baseTotal = record.items.reduce(
      (sum, item) => sum + (item.product.price || 0) * item.quantity,
      0,
    );
    if (baseTotal > 0) {
      const derivedRate = record.paid_amount
        ? record.paid_amount / baseTotal
        : 1;
      setDiscountRate(Math.max(0, derivedRate));
      setAmountMode("auto");
    } else {
      setDiscountRate(1);
      setAmountMode("manual");
    }
    setItemProductId("");
    setItemQuantity(1);
    if (record.member) {
      const inferredMemberId = record.member.id ?? record.member_id ?? 0;
      setSelectedMember({
        id: inferredMemberId,
        member_code: record.member.member_code ?? "",
        name: record.member.name ?? "",
        phone: record.member.phone ?? "",
      });
    } else {
      setSelectedMember(null);
    }
    setMemberDiscountInfo(null);
    setMemberSearchKeyword("");
    setMemberSuggestions([]);
    setModalOpen(true);
  }

  function closeModal() {
    if (modalLoading) return;
    setModalOpen(false);
    setModalMode("create");
    setEditingReservation(null);
    setFormState(buildDefaultForm());
    setModalError(null);
    setProductSearchTerm("");
    setItemProductId("");
    setItemQuantity(1);
    setAmountMode("auto");
    setDiscountRate(1);
    setSelectedMember(null);
    setMemberDiscountInfo(null);
    setMemberSuggestions([]);
    setMemberSearchKeyword("");
  }

  function handleTabChange(type: ReservationType) {
    setActiveType(type);
    setPage(1);
  }

  function handleFiltersSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    fetchReservations({ page: 1 });
  }

  function handleReservationPageChange(nextPage: number) {
    fetchReservations({ page: nextPage });
  }

  const effectiveModalType: ReservationType =
    modalMode === "edit" && editingReservation
      ? editingReservation.type
      : activeType;

  async function hydrateMemberDiscount(phone?: string | null) {
    if (!phone?.trim()) {
      setMemberDiscountInfo(null);
      return;
    }
    try {
      const { data } = await apiClient.get<PosMemberLookupResponse>(
        "/api/pos/members/by-phone",
        {
          params: { phone: phone.trim() },
        },
      );
      setMemberDiscountInfo(data);
      const nextRate =
        data.is_birthday_month && data.birthday_discount_available
          ? 0.88
          : 0.95;
      setDiscountRate(nextRate);
      setAmountMode("auto");
    } catch {
      setMemberDiscountInfo(null);
    }
  }

  function handleCustomerFieldChange(
    field: "customer_name" | "customer_phone",
    value: string,
  ) {
    const nextValue = value;
    setFormState((prev) => ({
      ...prev,
      [field]: nextValue,
      member_id: selectedMember ? null : prev.member_id,
    }));
    if (selectedMember) {
      setSelectedMember(null);
      setMemberDiscountInfo(null);
    }
    const nextName =
      field === "customer_name" ? nextValue : formState.customer_name;
    const nextPhone =
      field === "customer_phone" ? nextValue : formState.customer_phone;
    const keyword = (nextPhone || nextName).trim();
    setMemberSearchKeyword(keyword);
  }

  async function fetchMemberSuggestions(keyword: string) {
    const trimmed = keyword.trim();
    if (trimmed.length < 2) {
      setMemberSuggestions([]);
      return;
    }
    setMemberSuggestionsLoading(true);
    try {
      const { data } = await apiClient.get<MemberSuggestion[]>(
        "/api/reservations/member-suggestions",
        {
          params: { q: trimmed },
        },
      );
      setMemberSuggestions(data);
    } catch {
      setMemberSuggestions([]);
    } finally {
      setMemberSuggestionsLoading(false);
    }
  }

  async function handleMemberSelect(suggestion: MemberSuggestion) {
    setSelectedMember(suggestion);
    setFormState((prev) => ({
      ...prev,
      member_id: suggestion.id,
      customer_name: suggestion.name || prev.customer_name,
      customer_phone: suggestion.phone ?? prev.customer_phone,
    }));
    setMemberSuggestions([]);
    setMemberSearchKeyword("");
    await hydrateMemberDiscount(suggestion.phone);
  }

  function clearMemberSelection() {
    setSelectedMember(null);
    setMemberDiscountInfo(null);
    setDiscountRate(1);
    setAmountMode("auto");
    setFormState((prev) => ({ ...prev, member_id: null }));
  }

  function sanitizeDate(dateValue: string) {
    const trimmed = dateValue.trim();
    return trimmed ? trimmed : undefined;
  }

  function handleAddItem() {
    if (!itemProductId) return;
    const product = productOptions.find((p) => p.id === Number(itemProductId));
    if (!product) return;
    const qty =
      Number.isFinite(itemQuantity) && itemQuantity > 0 ? itemQuantity : 1;
    setFormState((prev) => {
      const existing = prev.items.find(
        (item) => item.product_id === product.id,
      );
      if (existing) {
        return {
          ...prev,
          items: prev.items.map((item) =>
            item.product_id === product.id
              ? { ...item, quantity: item.quantity + qty }
              : item,
          ),
        };
      }
      return {
        ...prev,
        items: [
          ...prev.items,
          {
            product_id: product.id,
            name: product.name,
            sku: product.sku,
            barcode: product.barcode,
            color: product.color ?? null,
            size: product.size ?? null,
            price: product.price,
            quantity: qty,
          },
        ],
      };
    });
    setItemProductId("");
    setItemQuantity(1);
    setAmountMode("auto");
  }

  function updateItemQuantity(productId: number, delta: number) {
    setFormState((prev) => ({
      ...prev,
      items: prev.items
        .map((item) => {
          if (item.product_id !== productId) return item;
          const nextQty = item.quantity + delta;
          if (nextQty <= 0) return null;
          return { ...item, quantity: nextQty };
        })
        .filter((item): item is ReservationItemForm => Boolean(item)),
    }));
    setAmountMode("auto");
  }

  function removeItem(productId: number) {
    setFormState((prev) => ({
      ...prev,
      items: prev.items.filter((item) => item.product_id !== productId),
    }));
    setAmountMode("auto");
  }

  const discountButtonsDisabled = itemsSubtotal <= 0;
  const paidAmountNumber = Number(formState.paid_amount) || 0;

  useEffect(() => {
    if (amountMode !== "auto") return;
    if (itemsSubtotal <= 0) return;
    const computed = Math.round(itemsSubtotal * discountRate);
    if (paidAmountNumber === computed) return;
    setFormState((prev) => {
      const current = Number(prev.paid_amount) || 0;
      if (current === computed) return prev;
      return { ...prev, paid_amount: String(computed) };
    });
  }, [amountMode, itemsSubtotal, discountRate, paidAmountNumber]);

  function applyDiscount(rate: number) {
    if (itemsSubtotal <= 0) return;
    setDiscountRate(rate);
    setAmountMode("auto");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setModalLoading(true);
    setModalError(null);

    const paidAmount = Number(formState.paid_amount) || 0;

    try {
      if (modalMode === "create") {
        if (formState.items.length === 0) {
          setModalError("請至少加入一項商品");
          setModalLoading(false);
          return;
        }
        const payload: ReservationPayload = {
          type: effectiveModalType,
          items: formState.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
          })),
          customer_name: formState.customer_name.trim(),
          customer_phone: formState.customer_phone.trim() || undefined,
          note: formState.note.trim() || undefined,
          payment_status: formState.payment_status,
          paid_amount: paidAmount,
          member_id: formState.member_id ?? undefined,
        };
        if (effectiveModalType === "preorder") {
          payload.expected_date = sanitizeDate(formState.expected_date);
          payload.hold_until = undefined;
        } else {
          payload.hold_until = sanitizeDate(formState.hold_until);
          payload.expected_date = undefined;
        }
        await apiClient.post("/api/reservations", payload);
      } else if (editingReservation) {
        const payload: ReservationUpdatePayload = {
          customer_name: formState.customer_name.trim(),
          customer_phone: formState.customer_phone.trim() || null,
          items: formState.items.map((item) => ({
            product_id: item.product_id,
            quantity: item.quantity,
          })),
          note: formState.note.trim() || null,
          payment_status: formState.payment_status,
          status: formState.status,
          paid_amount: paidAmount,
          member_id: formState.member_id ?? null,
        };
        if (effectiveModalType === "preorder") {
          payload.expected_date = sanitizeDate(formState.expected_date) ?? null;
          payload.hold_until = null;
        } else {
          payload.hold_until = sanitizeDate(formState.hold_until) ?? null;
          payload.expected_date = null;
        }
        await apiClient.put(
          `/api/reservations/${editingReservation.id}`,
          payload,
        );
      }
      await fetchReservations();
      closeModal();
    } catch (err: any) {
      const serverMessage = err?.response?.data?.detail;
      setModalError(
        serverMessage ||
          (modalMode === "create"
            ? "建立失敗，請檢查必填欄位"
            : "更新失敗，請稍後再試"),
      );
    } finally {
      setModalLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">
              Reservations
            </p>
            <h2 className="text-2xl font-semibold">預定 / 留貨系統</h2>
            <p className="text-sm text-dusk/70">
              統一追蹤缺貨預定與現貨保留，維護交貨日期、付款狀態與客戶備註。
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
            onClick={openCreateModal}
          >
            + 新增{activeType === "preorder" ? "預定" : "留貨"}
          </button>
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {typeTabs.map((tab) => (
            <button
              key={tab.value}
              className={clsx(
                "rounded-full border px-4 py-2 text-sm font-semibold transition",
                tab.value === activeType
                  ? "border-moss bg-moss/10 text-moss"
                  : "border-transparent bg-sand/30 text-dusk hover:bg-sand/60",
              )}
              onClick={() => handleTabChange(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-4">
          {(Object.keys(summary) as ReservationStatus[]).map((status) => (
            <div
              key={status}
              className="rounded-2xl border border-sand/60 bg-white/70 p-4 shadow-sm"
            >
              <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                {statusLabels[status]}
              </p>
              <p className="mt-2 text-3xl font-semibold">{summary[status]}</p>
              <p className="text-xs text-dusk/60">當前頁數統計</p>
            </div>
          ))}
        </div>

        <form
          className="mt-8 grid gap-4 md:grid-cols-4"
          onSubmit={handleFiltersSubmit}
        >
          <label className="text-sm">
            關鍵字
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              placeholder="客戶、電話、商品名稱/SKU/條碼"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="text-sm">
            狀態
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as StatusFilter)
              }
            >
              <option value="all">所有狀態</option>
              <option value="pending">建立中</option>
              <option value="ready">可取貨</option>
              <option value="completed">已完成</option>
              <option value="cancelled">已取消</option>
            </select>
          </label>
          <label className="text-sm">
            付款狀態
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={paymentFilter}
              onChange={(event) =>
                setPaymentFilter(event.target.value as PaymentFilter)
              }
            >
              <option value="all">全部</option>
              <option value="unpaid">未付款</option>
              <option value="paid">已付款</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="submit"
              className="w-full rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90"
            >
              套用篩選
            </button>
          </div>
        </form>

        <div className="mt-8 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.2em] text-dusk/60">
                <th className="px-3 py-2">客戶</th>
                <th className="px-3 py-2">商品</th>
                <th className="px-3 py-2">數量</th>
                <th className="px-3 py-2">狀態</th>
                <th className="px-3 py-2">付款</th>
                <th className="px-3 py-2">
                  {activeType === "preorder" ? "預計到貨" : "保留期限"}
                </th>
                <th className="px-3 py-2">備註</th>
                <th className="px-3 py-2">更新時間</th>
                <th className="px-3 py-2 text-right">動作</th>
              </tr>
            </thead>
            <tbody>
              {reservations.map((reservation) => (
                <tr key={reservation.id} className="border-t border-sand/50">
                  <td className="px-3 py-3">
                    <div className="font-semibold">
                      {reservation.customer_name}
                    </div>
                    {reservation.customer_phone && (
                      <div className="text-xs text-dusk/70">
                        {reservation.customer_phone}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <div className="space-y-1">
                      {reservation.items.map((item) => (
                        <div key={item.id}>
                          <div className="font-semibold">
                            {item.product.name}
                            {(item.product.color || item.product.size) && (
                              <span className="ml-1 text-xs font-normal text-dusk/50">
                                {[item.product.color, item.product.size]
                                  .filter(Boolean)
                                  .join(" / ")}
                              </span>
                            )}
                            <span className="ml-2 text-xs font-normal text-dusk/70">
                              x {item.quantity}
                            </span>
                          </div>
                          <div className="text-[11px] text-dusk/60">
                            SKU {item.product.sku} • {item.product.barcode}
                          </div>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-3 py-3 font-semibold">
                    {reservation.quantity}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={clsx(
                        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                        statusChips[reservation.status],
                      )}
                    >
                      {statusLabels[reservation.status]}
                    </span>
                    {reservation.order_id && (
                      <div className="mt-1 text-[11px] text-dusk/60">
                        訂單 #{reservation.order_id}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={clsx(
                        "inline-flex rounded-full px-2 py-1 text-xs font-semibold",
                        paymentChips[reservation.payment_status],
                      )}
                    >
                      {paymentLabels[reservation.payment_status]}
                    </span>
                    {reservation.paid_amount > 0 && (
                      <div className="text-xs text-dusk/70">
                        已收 NT$ {currency(reservation.paid_amount)}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    {activeType === "preorder"
                      ? formatDate(reservation.expected_date)
                      : formatDate(reservation.hold_until)}
                  </td>
                  <td className="px-3 py-3 text-sm text-dusk/80">
                    {reservation.note ? reservation.note : "—"}
                  </td>
                  <td className="px-3 py-3 text-xs text-dusk/70">
                    {formatDateTime(reservation.updated_at)}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <button
                      className="rounded-full border border-dusk/30 px-3 py-1 text-xs font-semibold text-dusk hover:bg-dusk/10"
                      onClick={() => openEditModal(reservation)}
                    >
                      管理
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!loading && reservations.length === 0 && (
            <div className="py-10 text-center text-sm text-dusk/70">
              目前沒有符合條件的紀錄
            </div>
          )}
          {loading && (
            <div className="py-10 text-center text-sm text-dusk/70">
              讀取中...
            </div>
          )}
          {listError && (
            <div className="mt-4 rounded-lg bg-rose-100 px-4 py-3 text-sm text-rose-700">
              {listError}
            </div>
          )}
        </div>

        <div className="mt-6">
          <PaginationControls
            page={page}
            size={PAGE_SIZE}
            total={totalRecords}
            onPageChange={handleReservationPageChange}
          />
        </div>
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-3xl rounded-3xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  {modalMode === "create"
                    ? "Create Reservation"
                    : "Manage Reservation"}
                </p>
                <h3 className="text-2xl font-semibold">
                  {modalMode === "create"
                    ? `新增${effectiveModalType === "preorder" ? "預定" : "留貨"}`
                    : "更新紀錄"}
                </h3>
                <p className="text-sm text-dusk/70">
                  {effectiveModalType === "preorder"
                    ? "缺貨預定：記錄客戶資訊、預計到貨與付款狀態。"
                    : "留貨保留：確認現貨數量、保留期限與付款情況。"}
                </p>
              </div>
              <button
                aria-label="Close modal"
                className="rounded-full border border-sand/60 p-2 text-sm hover:bg-sand/40"
                onClick={closeModal}
              >
                ✕
              </button>
            </div>

            <form className="mt-4 space-y-6" onSubmit={handleSubmit}>
              <div className="space-y-3 rounded-2xl border border-sand/60 bg-linen/40 p-4">
                <p className="text-sm font-semibold text-dusk">商品明細</p>
                <div className="grid gap-3 md:grid-cols-3">
                  <label className="block text-sm">
                    搜尋商品（品名或條碼）
                    <input
                      className="mt-1 w-full rounded-lg border border-sand/60 bg-white px-3 py-2"
                      placeholder="輸入關鍵字以篩選"
                      value={productSearchTerm}
                      onChange={(event) =>
                        setProductSearchTerm(event.target.value)
                      }
                    />
                    {productSearchLoading && (
                      <p className="mt-1 text-xs text-dusk/70">搜尋中...</p>
                    )}
                  </label>
                  <label className="block text-sm">
                    選擇商品
                    <select
                      className="mt-1 w-full rounded-lg border border-sand/60 bg-white px-3 py-2"
                      value={itemProductId}
                      onChange={(event) =>
                        setItemProductId(
                          event.target.value ? Number(event.target.value) : "",
                        )
                      }
                    >
                      <option value="">請選擇</option>
                      {productOptions.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.color || product.size
                            ? ` (${[product.color, product.size].filter(Boolean).join(" / ")})`
                            : ""}{" "}
                          • SKU {product.sku} • 庫存 {product.stock}
                        </option>
                      ))}
                    </select>
                    {productOptions.length === 0 && !productSearchLoading && (
                      <p className="mt-1 text-xs text-rose-600">
                        沒有找到符合的商品，請換關鍵字試試
                      </p>
                    )}
                  </label>
                  <label className="block text-sm">
                    數量
                    <input
                      className="mt-1 w-full rounded-lg border border-sand/60 bg-white px-3 py-2"
                      type="number"
                      min={1}
                      value={itemQuantity}
                      onChange={(event) => {
                        const value = Number(event.target.value);
                        setItemQuantity(
                          Number.isFinite(value) && value > 0
                            ? Math.floor(value)
                            : 1,
                        );
                      }}
                    />
                  </label>
                  <div className="md:col-span-3 flex justify-end">
                    <button
                      type="button"
                      className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-60"
                      onClick={handleAddItem}
                      disabled={!itemProductId}
                    >
                      加入商品
                    </button>
                  </div>
                </div>
                <div className="rounded-xl border border-sand/60 bg-white/90">
                  <div className="border-b border-sand/50 px-3 py-2 text-xs font-semibold text-dusk/80">
                    商品列表
                  </div>
                  {formState.items.length === 0 ? (
                    <p className="px-3 py-4 text-xs text-dusk/60">
                      尚未加入商品
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs uppercase tracking-[0.2em] text-dusk/60">
                            <th className="px-3 py-2">名稱</th>
                            <th className="px-3 py-2">數量</th>
                            <th className="px-3 py-2 text-right">金額</th>
                            <th className="px-3 py-2"></th>
                          </tr>
                        </thead>
                        <tbody>
                          {formState.items.map((item) => (
                            <tr
                              key={item.product_id}
                              className="border-t border-sand/40"
                            >
                              <td className="px-3 py-2">
                                <div className="font-semibold">
                                  {item.name}
                                  {(item.color || item.size) && (
                                    <span className="ml-1 text-xs font-normal text-dusk/50">
                                      {[item.color, item.size]
                                        .filter(Boolean)
                                        .join(" / ")}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-dusk/60">
                                  SKU {item.sku} • {item.barcode}
                                </div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="rounded-full border border-sand/60 px-2"
                                    onClick={() =>
                                      updateItemQuantity(item.product_id, -1)
                                    }
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
                                  >
                                    +
                                  </button>
                                </div>
                              </td>
                              <td className="px-3 py-2 text-right">
                                NT$ {currency(item.price * item.quantity)}
                              </td>
                              <td className="px-3 py-2 text-right">
                                <button
                                  type="button"
                                  className="text-xs text-clay hover:underline"
                                  onClick={() => removeItem(item.product_id)}
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

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  客戶姓名
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={formState.customer_name}
                    onChange={(event) =>
                      handleCustomerFieldChange(
                        "customer_name",
                        event.target.value,
                      )
                    }
                    required
                  />
                </label>
                <label className="text-sm">
                  聯絡電話
                  <input
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={formState.customer_phone}
                    onChange={(event) =>
                      handleCustomerFieldChange(
                        "customer_phone",
                        event.target.value,
                      )
                    }
                  />
                </label>
              </div>
              {selectedMember && (
                <div className="flex flex-col gap-2 rounded-2xl border border-moss/50 bg-moss/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-moss">
                      已連結會員：{selectedMember.name}
                    </p>
                    <p className="text-xs text-moss/80">
                      會員編號 {selectedMember.member_code}
                      {selectedMember.phone ? ` • ${selectedMember.phone}` : ""}
                    </p>
                    {memberDiscountInfo && (
                      <p className="text-xs text-moss/80">
                        優惠：
                        {memberDiscountInfo.is_birthday_month &&
                        memberDiscountInfo.birthday_discount_available
                          ? "生日 88 折"
                          : "會員 95 折"}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    className="rounded-full border border-moss/60 px-3 py-1 text-xs font-semibold text-moss hover:bg-moss/20"
                    onClick={clearMemberSelection}
                  >
                    移除
                  </button>
                </div>
              )}
              {memberSuggestions.length > 0 && (
                <div className="rounded-2xl border border-sand/60 bg-white/90 p-3 text-sm space-y-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                    匹配的會員
                  </p>
                  <ul className="space-y-2">
                    {memberSuggestions.map((suggestion) => (
                      <li
                        key={suggestion.id}
                        className="flex items-center justify-between rounded-xl border border-sand/60 px-3 py-2"
                      >
                        <div>
                          <p className="font-semibold">{suggestion.name}</p>
                          <p className="text-xs text-dusk/70">
                            {suggestion.phone || "無電話"} •{" "}
                            {suggestion.member_code}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="rounded-full border border-dusk/30 px-3 py-1 text-xs font-semibold text-dusk hover:bg-dusk/10"
                          onClick={() => handleMemberSelect(suggestion)}
                        >
                          套用
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {memberSuggestionsLoading && (
                <p className="text-xs text-dusk/60">搜尋會員中...</p>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                {effectiveModalType === "preorder" ? (
                  <div>
                    <p className="text-sm">預計到貨日</p>
                    <DatePickerField
                      value={formState.expected_date}
                      onChange={(value) =>
                        setFormState((prev) => ({
                          ...prev,
                          expected_date: value,
                        }))
                      }
                      placeholder="選擇日期"
                    />
                  </div>
                ) : (
                  <div>
                    <p className="text-sm">保留期限</p>
                    <DatePickerField
                      value={formState.hold_until}
                      onChange={(value) =>
                        setFormState((prev) => ({ ...prev, hold_until: value }))
                      }
                      placeholder="選擇日期"
                    />
                  </div>
                )}
                <div className="flex flex-col justify-center rounded-xl bg-linen/50 px-3 py-2 text-sm text-dusk/70">
                  <span>商品原價總額：NT$ {currency(itemsSubtotal)}</span>
                  <span className="text-[11px] text-dusk/60">
                    可用折扣按鈕快速帶入收款金額
                  </span>
                </div>
              </div>

              <div className="rounded-2xl border border-sand/60 bg-white/70 p-4 shadow-inner">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                      收款金額
                    </p>
                    <p className="text-2xl font-semibold">
                      NT$ {currency(paidAmountNumber)}
                    </p>
                    <p className="text-xs text-dusk/70">
                      商品原價總額 NT$ {currency(itemsSubtotal)}
                      ，可套用折扣或手動輸入。
                    </p>
                    {amountMode === "auto" && (
                      <p className="text-[11px] text-dusk/60">
                        {discountRate === 1
                          ? "目前為原價"
                          : `目前套用 ${(discountRate * 100).toFixed(0)}% 金額`}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {discountPresets.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className={clsx(
                          "rounded-full border px-3 py-1 text-xs font-semibold",
                          amountMode === "auto" && discountRate === preset.rate
                            ? "border-moss bg-moss/10 text-moss"
                            : "border-dusk/30 text-dusk hover:bg-dusk/10",
                        )}
                        onClick={() => applyDiscount(preset.rate)}
                        disabled={discountButtonsDisabled}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="block text-xs font-semibold text-dusk/80 flex-1">
                    自訂金額（可手動調整）
                    <input
                      type="number"
                      min={0}
                      className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2 text-base"
                      value={formState.paid_amount}
                      onChange={(event) => {
                        setAmountMode("manual");
                        setFormState((prev) => ({
                          ...prev,
                          paid_amount: event.target.value,
                        }));
                      }}
                    />
                  </label>
                  {amountMode === "manual" && (
                    <button
                      type="button"
                      className="rounded-full border border-dusk/30 px-3 py-1 text-xs font-semibold text-dusk hover:bg-dusk/10"
                      onClick={() => {
                        setAmountMode("auto");
                        setDiscountRate(1);
                      }}
                      disabled={discountButtonsDisabled}
                    >
                      回到自動金額
                    </button>
                  )}
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="text-sm">
                  付款狀態
                  <select
                    className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                    value={formState.payment_status}
                    onChange={(event) =>
                      setFormState((prev) => ({
                        ...prev,
                        payment_status: event.target
                          .value as ReservationPaymentStatus,
                      }))
                    }
                  >
                    <option value="unpaid">未付款</option>
                    <option value="paid">已付款</option>
                  </select>
                </label>
                {modalMode === "edit" && (
                  <label className="text-sm">
                    任務狀態
                    <select
                      className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
                      value={formState.status}
                      onChange={(event) =>
                        setFormState((prev) => ({
                          ...prev,
                          status: event.target.value as ReservationStatus,
                        }))
                      }
                    >
                      <option value="pending">建立中</option>
                      <option value="ready">可取貨</option>
                      <option value="completed">已完成</option>
                      <option value="cancelled">已取消</option>
                    </select>
                  </label>
                )}
              </div>

              <label className="text-sm">
                備註
                <textarea
                  className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2 text-sm"
                  rows={2}
                  maxLength={200}
                  value={formState.note}
                  onChange={(event) =>
                    setFormState((prev) => ({
                      ...prev,
                      note: event.target.value,
                    }))
                  }
                />
              </label>

              {modalError && (
                <div className="rounded-lg bg-rose-100 px-4 py-3 text-sm text-rose-700">
                  {modalError}
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  className="rounded-full border border-sand/70 px-4 py-2 text-sm font-semibold text-dusk hover:bg-sand/40"
                  onClick={closeModal}
                  disabled={modalLoading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
                  disabled={modalLoading}
                >
                  {modalMode === "create" ? "建立紀錄" : "儲存變更"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
