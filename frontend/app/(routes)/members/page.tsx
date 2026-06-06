"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  apiClient,
  Member,
  MemberPayload,
  MemberPurchaseItem,
  PaginatedResponse,
} from "@/lib/api";
import { DatePickerField } from "@/components/DatePickerField";
import { PaginationControls } from "@/components/PaginationControls";
import { DEFAULT_PAGE_SIZE } from "@/lib/constants";
import { SkeletonTableRows } from "@/components/ui/Skeleton";

const defaultForm: MemberPayload = {
  name: "",
  birthday: "",
  joined_date: "",
  phone: "",
  note: "",
};

const PAGE_SIZE = DEFAULT_PAGE_SIZE;

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

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [form, setForm] = useState<MemberPayload>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [editingMember, setEditingMember] = useState<Member | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortField, setSortField] = useState<"created" | "joined" | "name">(
    "created",
  );
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);
  const [totalMembers, setTotalMembers] = useState(0);

  const [orderHistoryMember, setOrderHistoryMember] = useState<Member | null>(
    null,
  );
  const [purchaseItems, setPurchaseItems] = useState<MemberPurchaseItem[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchaseQ, setPurchaseQ] = useState("");

  const modalTitle = useMemo(
    () => (modalMode === "edit" ? "更新會員資料" : "新增會員"),
    [modalMode],
  );

  async function fetchMembers(overrides?: {
    search?: string;
    sort?: string;
    dir?: "asc" | "desc";
    page?: number;
  }) {
    const q = overrides?.search ?? searchTerm;
    const sort = overrides?.sort ?? sortField;
    const dir = overrides?.dir ?? sortDir;
    const nextPage = overrides?.page ?? page;
    setListLoading(true);
    try {
      const keyword = q.trim();
      const { data } = await apiClient.get<PaginatedResponse<Member>>(
        "/api/members",
        {
          params: {
            page: nextPage,
            size: PAGE_SIZE,
            q: keyword || undefined,
            sort,
            sort_dir: dir,
          },
        },
      );
      const totalPages = Math.max(
        1,
        Math.ceil(Math.max(data.total, 0) / PAGE_SIZE),
      );
      if (data.total > 0 && nextPage > totalPages) {
        setPage(totalPages);
        await fetchMembers({ search: q, sort, dir, page: totalPages });
        return;
      }
      setMembers(data.data);
      setTotalMembers(data.total);
      setPage(Math.min(nextPage, totalPages));
    } catch (err) {
      setError("無法取得會員資料，請稍後再試");
    } finally {
      setListLoading(false);
    }
  }

  function handleMemberPageChange(nextPage: number) {
    fetchMembers({ page: nextPage });
  }

  useEffect(() => {
    fetchMembers({ page: 1 });
  }, []);

  const PURCHASE_PAGE_SIZE = 20;

  async function openOrderHistory(member: Member, targetPage = 1, q = "") {
    setOrderHistoryMember(member);
    setPurchaseLoading(true);
    setPurchasePage(targetPage);
    try {
      const { data } = await apiClient.get<
        PaginatedResponse<MemberPurchaseItem>
      >(`/api/members/${member.id}/items`, {
        params: {
          page: targetPage,
          size: PURCHASE_PAGE_SIZE,
          q: q || undefined,
        },
      });
      setPurchaseItems(data.data);
      setPurchaseTotal(data.total);
    } catch {
      setPurchaseItems([]);
      setPurchaseTotal(0);
    } finally {
      setPurchaseLoading(false);
    }
  }

  function closeOrderHistory() {
    setOrderHistoryMember(null);
    setPurchaseItems([]);
    setPurchaseTotal(0);
    setPurchasePage(1);
    setPurchaseQ("");
  }

  function handlePurchaseSearch() {
    if (!orderHistoryMember) return;
    openOrderHistory(orderHistoryMember, 1, purchaseQ);
  }

  function openCreateModal() {
    setModalMode("create");
    setEditingMember(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(member: Member) {
    setModalMode("edit");
    setEditingMember(member);
    setForm({
      name: member.name,
      birthday: member.birthday ?? "",
      joined_date: member.joined_date ?? "",
      phone: member.phone ?? "",
      note: member.note ?? "",
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setModalOpen(false);
    setModalMode("create");
    setEditingMember(null);
    setForm(defaultForm);
    setError(null);
  }

  function sanitizePayload(input: MemberPayload) {
    return {
      name: input.name.trim(),
      birthday: input.birthday ? input.birthday : null,
      joined_date: input.joined_date ? input.joined_date : null,
      phone: input.phone?.trim() || null,
      note: input.note?.trim() || null,
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const payload = sanitizePayload(form);
    const isEditMode = modalMode === "edit" && editingMember;

    try {
      if (isEditMode) {
        await apiClient.put(`/api/members/${editingMember.id}`, payload);
      } else {
        await apiClient.post("/api/members", payload);
      }
      await fetchMembers();
      closeModal();
    } catch (err) {
      setError(
        isEditMode ? "更新會員資料失敗" : "新增會員失敗，請檢查必填欄位",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("確定要刪除此會員嗎？")) return;
    try {
      await apiClient.delete(`/api/members/${id}`);
      if (editingMember?.id === id) {
        closeModal();
      }
      await fetchMembers();
    } catch (err) {
      setError("刪除會員失敗");
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">
              Members
            </p>
            <h3 className="text-2xl font-semibold">會員資料</h3>
            <p className="text-sm text-dusk/70">
              管理會員的基本資料與聯繫資訊。
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90 min-h-[44px] active:scale-[0.98]"
            onClick={openCreateModal}
          >
            + 新增會員
          </button>
        </div>

        <form
          className="mt-4 grid gap-4 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            fetchMembers({ page: 1 });
          }}
        >
          <label className="text-sm">
            關鍵字
            <input
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              placeholder="輸入姓名、電話、會員 ID 或備註"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
            />
          </label>
          <label className="text-sm">
            排序欄位
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={sortField}
              onChange={(event) => {
                const nextSort = event.target.value as
                  | "created"
                  | "joined"
                  | "name";
                setSortField(nextSort);
                fetchMembers({ sort: nextSort, page: 1 });
              }}
            >
              <option value="created">建立時間</option>
              <option value="joined">入會日期</option>
              <option value="name">姓名</option>
            </select>
          </label>
          <label className="text-sm">
            排序方向
            <select
              className="mt-1 w-full rounded-lg border border-sand/60 bg-linen px-3 py-2"
              value={sortDir}
              onChange={(event) => {
                const nextDir = event.target.value as "asc" | "desc";
                setSortDir(nextDir);
                fetchMembers({ dir: nextDir, page: 1 });
              }}
            >
              <option value="desc">由新到舊</option>
              <option value="asc">由舊到新</option>
            </select>
          </label>
          <div className="md:col-span-3 flex justify-end gap-3">
            <button
              type="button"
              className="rounded-full border border-sand/60 px-4 py-2 text-sm text-dusk min-h-[44px]"
              onClick={() => {
                setSearchTerm("");
                setSortField("created");
                setSortDir("desc");
                fetchMembers({
                  search: "",
                  sort: "created",
                  dir: "desc",
                  page: 1,
                });
              }}
            >
              清除條件
            </button>
            <button
              type="submit"
              className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90 min-h-[44px]"
            >
              套用條件
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-linen text-left">
              <tr>
                <th className="px-3 py-2">會員 ID</th>
                <th className="px-3 py-2">姓名</th>
                <th className="px-3 py-2">生日</th>
                <th className="px-3 py-2">入會日期</th>
                <th className="px-3 py-2">電話</th>
                <th className="px-3 py-2">累積消費</th>
                <th className="px-3 py-2">備註</th>
                <th className="px-3 py-2">操作</th>
              </tr>
            </thead>
            <tbody>
              {listLoading ? (
                <SkeletonTableRows rows={8} cols={8} />
              ) : members.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-8 text-center text-sm text-dusk/60"
                  >
                    尚未建立會員資料。點擊「新增會員」開始建立。
                  </td>
                </tr>
              ) : (
                members.map((member) => (
                  <tr key={member.id} className="border-b border-sand/30">
                    <td className="px-3 py-2 font-mono text-xs uppercase tracking-wide">
                      {member.member_code}
                    </td>
                    <td className="px-3 py-2 font-medium">{member.name}</td>
                    <td className="px-3 py-2">{formatDate(member.birthday)}</td>
                    <td className="px-3 py-2">
                      {formatDate(member.joined_date)}
                    </td>
                    <td className="px-3 py-2">{member.phone || "-"}</td>
                    <td className="px-3 py-2">
                      <button
                        className="font-medium text-moss hover:underline disabled:cursor-default disabled:no-underline"
                        onClick={() => openOrderHistory(member)}
                        disabled={member.total_spent === 0}
                        title={
                          member.total_spent === 0
                            ? "尚無消費紀錄"
                            : "查看購買紀錄"
                        }
                      >
                        {member.total_spent > 0
                          ? `$${Math.round(member.total_spent).toLocaleString("zh-TW")}`
                          : "-"}
                      </button>
                    </td>
                    <td className="px-3 py-2">{member.note || "-"}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 text-sm">
                        <button
                          className="min-h-[44px] min-w-[44px] px-2 text-moss hover:underline"
                          onClick={() => openEditModal(member)}
                        >
                          編輯
                        </button>
                        <button
                          className="min-h-[44px] min-w-[44px] px-2 text-clay hover:underline"
                          onClick={() => handleDelete(member.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <PaginationControls
          page={page}
          size={PAGE_SIZE}
          total={totalMembers}
          onPageChange={handleMemberPageChange}
        />
      </section>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-dusk/60 backdrop-blur-sm"
            onClick={() => (!loading ? closeModal() : null)}
          />
          <div className="relative z-10 w-full max-w-xl rounded-2xl border border-sand/40 bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  {modalTitle}
                </p>
                <h4 className="text-xl font-semibold">
                  {modalMode === "edit" ? "維護會員基本資料" : "建立新會員"}
                </h4>
              </div>
              <button
                className="min-h-[44px] min-w-[44px] text-sm text-dusk/70 hover:text-dusk"
                onClick={() => (!loading ? closeModal() : null)}
                aria-label="Close modal"
              >
                ✕
              </button>
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-clay/40 bg-clay/10 px-3 py-2 text-sm text-clay">
                {error}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleSubmit}>
              <label className="flex flex-col text-sm font-medium text-dusk/80">
                姓名 *
                <input
                  type="text"
                  className="mt-1 rounded-xl border border-sand/60 px-3 py-2"
                  value={form.name}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, name: event.target.value }))
                  }
                  required
                  disabled={loading}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-dusk/80">
                  生日
                  <span className="text-xs font-normal text-dusk/60">
                    格式：YYYY-MM-DD，例如 1990-08-15
                  </span>
                  <DatePickerField
                    className="mt-1 w-full"
                    value={form.birthday || ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, birthday: value }))
                    }
                    disabled={loading}
                  />
                </label>
                <label className="flex flex-col text-sm font-medium text-dusk/80">
                  入會日期
                  <span className="text-xs font-normal text-dusk/60">
                    格式：YYYY-MM-DD，例如 2024-01-15
                  </span>
                  <DatePickerField
                    className="mt-1 w-full"
                    value={form.joined_date || ""}
                    onChange={(value) =>
                      setForm((prev) => ({ ...prev, joined_date: value }))
                    }
                    disabled={loading}
                  />
                </label>
              </div>

              <label className="flex flex-col text-sm font-medium text-dusk/80">
                電話
                <input
                  type="tel"
                  inputMode="tel"
                  className="mt-1 rounded-xl border border-sand/60 px-3 py-2"
                  value={form.phone || ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, phone: event.target.value }))
                  }
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-dusk/80">
                備註
                <textarea
                  className="mt-1 rounded-xl border border-sand/60 px-3 py-2"
                  rows={3}
                  value={form.note || ""}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, note: event.target.value }))
                  }
                  disabled={loading}
                />
              </label>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-dusk/80 hover:bg-linen min-h-[44px]"
                  onClick={closeModal}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60 min-h-[44px]"
                  disabled={loading}
                >
                  {modalMode === "edit" ? "儲存變更" : "建立會員"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {orderHistoryMember && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8">
          <div
            className="absolute inset-0 bg-dusk/60"
            onClick={closeOrderHistory}
          />
          <div className="relative z-10 mx-4 w-full max-w-xl rounded-2xl border border-sand/60 bg-white shadow-xl">
            {/* Header */}
            <div className="flex items-start justify-between border-b border-sand/40 px-6 py-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">
                  Purchase History
                </p>
                <h4 className="text-lg font-semibold">
                  {orderHistoryMember.name} 的購買紀錄
                </h4>
                <p className="text-xs text-dusk/60">
                  累積消費：$
                  {Math.round(orderHistoryMember.total_spent).toLocaleString(
                    "zh-TW",
                  )}{" "}
                  · 共 {purchaseTotal} 筆品項
                </p>
              </div>
              <button
                className="min-h-[44px] min-w-[44px] px-2 text-sm text-dusk/60 hover:text-dusk"
                onClick={closeOrderHistory}
              >
                關閉
              </button>
            </div>

            {/* Search */}
            <div className="flex gap-2 border-b border-sand/40 px-4 py-3">
              <input
                type="text"
                placeholder="搜尋品名或條碼…"
                value={purchaseQ}
                onChange={(e) => setPurchaseQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handlePurchaseSearch()}
                className="flex-1 rounded-full border border-sand/60 bg-linen/40 px-3 py-1.5 text-sm text-dusk placeholder-dusk/40 outline-none focus:border-dusk/50"
              />
              <button
                onClick={handlePurchaseSearch}
                disabled={purchaseLoading}
                className="rounded-full bg-dusk px-4 py-2.5 text-sm font-semibold text-amber-50 disabled:opacity-60 min-h-[44px]"
              >
                搜尋
              </button>
              {purchaseQ && (
                <button
                  onClick={() => {
                    setPurchaseQ("");
                    openOrderHistory(orderHistoryMember, 1, "");
                  }}
                  className="rounded-full border border-sand/60 px-3 py-2.5 text-sm text-dusk/60 hover:text-dusk min-h-[44px]"
                >
                  清除
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[60vh] overflow-y-auto">
              {purchaseLoading ? (
                <p className="py-8 text-center text-sm text-dusk/60">
                  載入中...
                </p>
              ) : purchaseItems.length === 0 ? (
                <p className="py-8 text-center text-sm text-dusk/60">
                  {purchaseQ ? "查無符合的購買紀錄" : "尚無購買紀錄"}
                </p>
              ) : (
                <table className="w-full text-sm text-dusk">
                  <thead>
                    <tr className="border-b border-sand/40 text-left text-xs uppercase tracking-wide text-dusk/50">
                      <th className="px-4 py-2">品名</th>
                      <th className="px-4 py-2">購買時間</th>
                      <th className="px-4 py-2 text-right">金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchaseItems.map((item, idx) => (
                      <tr
                        key={`${item.order_id}-${idx}`}
                        className={`border-b border-sand/30 ${item.is_cancelled ? "text-dusk/40" : ""}`}
                      >
                        <td className="px-4 py-2.5">
                          <p className="font-medium leading-snug">
                            {item.product_name}
                            {(item.color || item.size) && (
                              <span className="ml-1 text-dusk/50">
                                {[item.color, item.size]
                                  .filter(Boolean)
                                  .join(" / ")}
                              </span>
                            )}
                            <span className="ml-1 text-dusk/40">
                              × {item.quantity}
                            </span>
                            {item.is_cancelled && (
                              <span className="ml-1.5 text-xs text-clay">
                                已取消
                              </span>
                            )}
                          </p>
                        </td>
                        <td className="px-4 py-2.5 text-xs text-dusk/60">
                          {new Date(item.order_created_at).toLocaleString(
                            "zh-TW",
                            {
                              year: "numeric",
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            },
                          )}
                        </td>
                        <td className="px-4 py-2.5 text-right font-semibold text-moss">
                          ${Math.round(item.subtotal).toLocaleString("zh-TW")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Pagination */}
            {purchaseTotal > PURCHASE_PAGE_SIZE && (
              <div className="flex items-center justify-between border-t border-sand/40 px-6 py-3 text-sm">
                <button
                  className="rounded-full border border-sand/60 px-4 py-1.5 text-dusk disabled:opacity-40"
                  disabled={purchasePage <= 1 || purchaseLoading}
                  onClick={() =>
                    openOrderHistory(
                      orderHistoryMember,
                      purchasePage - 1,
                      purchaseQ,
                    )
                  }
                >
                  上一頁
                </button>
                <span className="text-xs text-dusk/60">
                  第 {purchasePage} 頁 /{" "}
                  {Math.ceil(purchaseTotal / PURCHASE_PAGE_SIZE)} 頁
                </span>
                <button
                  className="rounded-full border border-sand/60 px-4 py-1.5 text-dusk disabled:opacity-40"
                  disabled={
                    purchasePage >=
                      Math.ceil(purchaseTotal / PURCHASE_PAGE_SIZE) ||
                    purchaseLoading
                  }
                  onClick={() =>
                    openOrderHistory(
                      orderHistoryMember,
                      purchasePage + 1,
                      purchaseQ,
                    )
                  }
                >
                  下一頁
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
