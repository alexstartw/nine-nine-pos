"use client";

import { useEffect, useState } from "react";
import {
  apiClient,
  extractApiError,
  User,
  UserCreatePayload,
  UserRole,
  UserUpdatePayload,
} from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";
import { SelectField } from "@/components/SelectField";
import { PaginationControls } from "@/components/PaginationControls";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { formatDateLocal } from "@/lib/format";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "管理員",
  staff: "工讀生",
};

export default function UsersPage() {
  const { user: currentUser, isLoaded } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<UserCreatePayload>({
    username: "",
    password: "",
    role: "staff",
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  // Row actions report into the page instead of a native alert, which cannot
  // say which account failed and can be permanently suppressed by the browser.
  const [actionError, setActionError] = useState<string | null>(null);
  const [pendingDisable, setPendingDisable] = useState<User | null>(null);
  const [togglingUser, setTogglingUser] = useState<number | null>(null);
  // A role change is a privilege change, so it gets confirmed like a deletion.
  const [pendingRole, setPendingRole] = useState<{
    user: User;
    role: UserRole;
  } | null>(null);
  const [savingRole, setSavingRole] = useState(false);

  const SIZE = 20;

  useEffect(() => {
    if (!isLoaded) return;
    if (currentUser?.role !== "admin") {
      router.replace("/analytics/sales");
      return;
    }
    fetchUsers();
  }, [isLoaded, page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await apiClient.get(
        `/api/users?page=${page}&size=${SIZE}`,
      );
      setUsers(data.data);
      setTotal(data.total);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate() {
    setCreateError(null);
    setCreateLoading(true);
    try {
      await apiClient.post("/api/users", createForm);
      setShowCreate(false);
      setCreateForm({ username: "", password: "", role: "staff" });
      fetchUsers();
    } catch (err) {
      setCreateError(extractApiError(err, "建立失敗"));
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleToggleActive(u: User) {
    setActionError(null);
    setTogglingUser(u.id);
    try {
      await apiClient.put(`/api/users/${u.id}`, {
        is_active: !u.is_active,
      } satisfies UserUpdatePayload);
      setPendingDisable(null);
      await fetchUsers();
    } catch (err) {
      setPendingDisable(null);
      setActionError(
        extractApiError(
          err,
          `${u.is_active ? "停用" : "啟用"}帳號「${u.username}」失敗`,
        ),
      );
    } finally {
      setTogglingUser(null);
    }
  }

  async function handleChangeRole(u: User, role: UserRole) {
    setActionError(null);
    setSavingRole(true);
    try {
      await apiClient.put(`/api/users/${u.id}`, {
        role,
      } satisfies UserUpdatePayload);
      setPendingRole(null);
      await fetchUsers();
    } catch (err) {
      setPendingRole(null);
      setActionError(
        extractApiError(err, `將「${u.username}」改為${ROLE_LABEL[role]}失敗`),
      );
    } finally {
      setSavingRole(false);
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    setResetLoading(true);
    try {
      await apiClient.post(`/api/users/${resetTarget.id}/reset-password`, {
        new_password: newPassword,
      });
      setResetTarget(null);
      setNewPassword("");
    } catch (err) {
      setResetError(extractApiError(err, "重設失敗"));
    } finally {
      setResetLoading(false);
    }
  }

  if (!isLoaded) return null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-8">
      {/* Header */}
      <section className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">
            User Management
          </p>
          <h3 className="text-3xl font-semibold text-dusk">帳號管理</h3>
          <p className="text-sm text-dusk/70">管理系統使用者帳號與角色權限。</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-dusk px-5 text-sm font-semibold text-white shadow hover:bg-dusk/90"
        >
          新增帳號
        </button>
      </section>

      {actionError && (
        <p
          role="alert"
          className="rounded-xl bg-clay/10 px-4 py-3 text-sm text-clay"
        >
          {actionError}
        </p>
      )}

      {/* Table */}
      <section>
        <div className="overflow-x-auto rounded-2xl bg-white/85 shadow">
          <table className="w-full min-w-[720px] whitespace-nowrap text-sm">
            <thead className="border-b border-sand/40 text-left text-xs text-dusk/70">
              <tr>
                <th className="px-3 py-3">帳號</th>
                <th className="px-3 py-3">顯示名稱</th>
                <th className="px-3 py-3">角色</th>
                <th className="px-3 py-3">狀態</th>
                <th className="px-3 py-3">建立時間</th>
                <th className="px-3 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-dusk/60"
                  >
                    載入中…
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-12 text-center text-dusk/60"
                  >
                    尚無帳號
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr
                    key={u.id}
                    className="border-t border-sand/30 transition first:border-t-0 hover:bg-linen/40"
                  >
                    <td className="px-3 py-2 font-mono font-medium">
                      {u.username}
                    </td>
                    <td className="px-3 py-2 text-dusk/70">
                      {u.display_name ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <SelectField
                        size="sm"
                        value={u.role}
                        disabled={u.username === currentUser?.username}
                        onChange={(e) => {
                          const next = e.target.value as UserRole;
                          if (next !== u.role)
                            setPendingRole({ user: u, role: next });
                        }}
                        className="w-28"
                      >
                        <option value="admin">管理員</option>
                        <option value="staff">工讀生</option>
                      </SelectField>
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                          u.is_active
                            ? "bg-moss/15 text-moss"
                            : "bg-clay/10 text-clay"
                        }`}
                      >
                        {u.is_active ? "啟用" : "停用"}
                      </span>
                    </td>
                    <td className="px-3 py-2 tabular-nums text-dusk/70">
                      {formatDateLocal(u.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => {
                            setResetTarget(u);
                            setNewPassword("");
                            setResetError(null);
                          }}
                          className="min-h-[32px] rounded-lg px-2.5 text-xs font-semibold text-dusk hover:bg-dusk/10"
                        >
                          重設密碼
                        </button>
                        {u.username !== currentUser?.username && (
                          <button
                            onClick={() =>
                              u.is_active
                                ? setPendingDisable(u)
                                : handleToggleActive(u)
                            }
                            disabled={togglingUser === u.id}
                            className={`min-h-[32px] rounded-lg px-2.5 text-xs font-semibold disabled:opacity-50 ${
                              u.is_active
                                ? "text-clay/80 hover:bg-clay/10 hover:text-clay"
                                : "text-moss hover:bg-moss/10"
                            }`}
                          >
                            {u.is_active ? "停用" : "啟用"}
                          </button>
                        )}
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
          size={SIZE}
          total={total}
          onPageChange={setPage}
        />
      </section>

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-dusk/60 backdrop-blur-sm"
            onClick={() => {
              setShowCreate(false);
              setCreateError(null);
            }}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-xl font-semibold text-dusk">新增帳號</h4>
            <div className="mt-5 flex flex-col gap-4">
              <label className="text-sm text-dusk/70">
                帳號
                <input
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk"
                  value={createForm.username}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, username: e.target.value })
                  }
                />
              </label>
              <label className="text-sm text-dusk/70">
                密碼（至少 8 位）
                <input
                  type="password"
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk"
                  value={createForm.password}
                  onChange={(e) =>
                    setCreateForm({ ...createForm, password: e.target.value })
                  }
                />
              </label>
              <label className="text-sm text-dusk/70">
                角色
                <SelectField
                  className="mt-1 w-full"
                  value={createForm.role}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      role: e.target.value as UserRole,
                    })
                  }
                >
                  <option value="staff">工讀生</option>
                  <option value="admin">管理員</option>
                </SelectField>
              </label>
              <label className="text-sm text-dusk/70">
                顯示名稱（選填）
                <input
                  className="mt-1 min-h-[44px] w-full rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk"
                  value={createForm.display_name ?? ""}
                  onChange={(e) =>
                    setCreateForm({
                      ...createForm,
                      display_name: e.target.value,
                    })
                  }
                />
              </label>
              {createError && (
                <p className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">
                  {createError}
                </p>
              )}
            </div>
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => {
                  setShowCreate(false);
                  setCreateError(null);
                }}
                className="min-h-[44px] flex-1 rounded-xl border border-sand/60 px-4 text-sm text-dusk hover:bg-linen/80"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={createLoading}
                className="min-h-[44px] flex-1 rounded-xl bg-dusk px-5 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
              >
                {createLoading ? "建立中…" : "建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-dusk/60 backdrop-blur-sm"
            onClick={() => setResetTarget(null)}
          />
          <div className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <h4 className="text-xl font-semibold text-dusk">重設密碼</h4>
            <p className="mt-1 text-sm text-dusk/70">
              帳號：
              <span className="font-mono font-medium text-dusk">
                {resetTarget.username}
              </span>
            </p>
            <label className="mt-5 block text-sm text-dusk/70">
              新密碼（至少 8 位）
              <input
                type="password"
                className="mt-1 min-h-[44px] w-full rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            {resetError && (
              <p className="mt-3 rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">
                {resetError}
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                onClick={() => setResetTarget(null)}
                className="min-h-[44px] flex-1 rounded-xl border border-sand/60 px-4 text-sm text-dusk hover:bg-linen/80"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading || newPassword.length < 8}
                className="min-h-[44px] flex-1 rounded-xl bg-dusk px-5 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
              >
                {resetLoading ? "重設中…" : "確認重設"}
              </button>
            </div>
          </div>
        </div>
      )}

      {pendingDisable && (
        <ConfirmDialog
          title="停用這個帳號？"
          details={
            <>
              <p className="font-mono font-semibold">
                {pendingDisable.username}
              </p>
              <p className="text-dusk/80">
                {pendingDisable.display_name ?? "未設顯示名稱"} ／{" "}
                {ROLE_LABEL[pendingDisable.role]}
              </p>
            </>
          }
          description="停用後這個帳號無法登入，正在班上的人會在下一次操作時被登出。之後可以再啟用。"
          confirmLabel="停用帳號"
          destructive
          busy={togglingUser === pendingDisable.id}
          onConfirm={() => handleToggleActive(pendingDisable)}
          onCancel={() => setPendingDisable(null)}
        />
      )}

      {pendingRole && (
        <ConfirmDialog
          title="變更這個帳號的角色？"
          details={
            <>
              <p className="font-mono font-semibold">
                {pendingRole.user.username}
              </p>
              <p className="text-dusk/80">
                {ROLE_LABEL[pendingRole.user.role]} →{" "}
                <span className="font-semibold text-dusk">
                  {ROLE_LABEL[pendingRole.role]}
                </span>
              </p>
            </>
          }
          description={
            pendingRole.role === "admin"
              ? "管理員可以看到成本與毛利、刪除會員、修改商品，並管理所有帳號。"
              : "工讀生看不到成本與毛利，也無法修改商品或管理帳號。"
          }
          confirmLabel="變更角色"
          busy={savingRole}
          onConfirm={() => handleChangeRole(pendingRole.user, pendingRole.role)}
          onCancel={() => setPendingRole(null)}
        />
      )}
    </div>
  );
}
