"use client";

import { useEffect, useState } from "react";
import { apiClient, User, UserCreatePayload, UserRole, UserUpdatePayload } from "@/lib/api";
import { useAuth } from "@/contexts/AuthContext";
import { useRouter } from "next/navigation";

const ROLE_LABEL: Record<UserRole, string> = { admin: "管理員", staff: "工讀生" };

export default function UsersPage() {
  const { user: currentUser, isLoaded } = useAuth();
  const router = useRouter();

  const [users, setUsers] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState<UserCreatePayload>({ username: "", password: "", role: "staff" });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);

  const [resetTarget, setResetTarget] = useState<User | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const SIZE = 20;

  useEffect(() => {
    if (!isLoaded) return;
    if (currentUser?.role !== "admin") { router.replace("/analytics/sales"); return; }
    fetchUsers();
  }, [isLoaded, page]);

  async function fetchUsers() {
    setLoading(true);
    try {
      const { data } = await apiClient.get(`/api/users?page=${page}&size=${SIZE}`);
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
    } catch (e: any) {
      setCreateError(e.response?.data?.detail ?? "建立失敗");
    } finally {
      setCreateLoading(false);
    }
  }

  async function handleToggleActive(u: User) {
    try {
      await apiClient.put(`/api/users/${u.id}`, { is_active: !u.is_active } satisfies UserUpdatePayload);
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.detail ?? "操作失敗");
    }
  }

  async function handleChangeRole(u: User, role: UserRole) {
    try {
      await apiClient.put(`/api/users/${u.id}`, { role } satisfies UserUpdatePayload);
      fetchUsers();
    } catch (e: any) {
      alert(e.response?.data?.detail ?? "操作失敗");
    }
  }

  async function handleResetPassword() {
    if (!resetTarget) return;
    setResetError(null);
    setResetLoading(true);
    try {
      await apiClient.post(`/api/users/${resetTarget.id}/reset-password`, { new_password: newPassword });
      setResetTarget(null);
      setNewPassword("");
    } catch (e: any) {
      setResetError(e.response?.data?.detail ?? "重設失敗");
    } finally {
      setResetLoading(false);
    }
  }

  const totalPages = Math.ceil(total / SIZE);

  if (!isLoaded) return null;

  return (
    <div className="p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-widest text-dusk/50 mb-1">User Management</p>
          <h2 className="text-2xl font-semibold">帳號管理</h2>
          <p className="text-sm text-dusk/70">管理系統使用者帳號與角色權限。</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-dusk text-linen rounded-lg text-sm font-medium hover:bg-dusk/90 transition-colors"
        >
          新增帳號
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-dusk/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-linen/60 border-b border-dusk/10">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-dusk/60">帳號</th>
              <th className="px-4 py-3 text-left font-medium text-dusk/60">顯示名稱</th>
              <th className="px-4 py-3 text-left font-medium text-dusk/60">角色</th>
              <th className="px-4 py-3 text-left font-medium text-dusk/60">狀態</th>
              <th className="px-4 py-3 text-left font-medium text-dusk/60">建立時間</th>
              <th className="px-4 py-3 text-right font-medium text-dusk/60">操作</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-dusk/40">載入中…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center text-dusk/40">尚無帳號</td></tr>
            ) : users.map((u) => (
              <tr key={u.id} className="border-b border-dusk/5 last:border-0 hover:bg-linen/30 transition-colors">
                <td className="px-4 py-3 font-mono font-medium">{u.username}</td>
                <td className="px-4 py-3 text-dusk/70">{u.display_name ?? "—"}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    disabled={u.username === currentUser?.username}
                    onChange={(e) => handleChangeRole(u, e.target.value as UserRole)}
                    className="text-xs border border-dusk/20 rounded px-2 py-1 bg-transparent disabled:opacity-50 cursor-pointer"
                  >
                    <option value="admin">管理員</option>
                    <option value="staff">工讀生</option>
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium ${
                    u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                  }`}>
                    {u.is_active ? "啟用" : "停用"}
                  </span>
                </td>
                <td className="px-4 py-3 text-dusk/50 text-xs">
                  {new Date(u.created_at).toLocaleDateString("zh-TW")}
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => { setResetTarget(u); setNewPassword(""); setResetError(null); }}
                      className="text-xs text-dusk/60 hover:text-dusk underline"
                    >
                      重設密碼
                    </button>
                    {u.username !== currentUser?.username && (
                      <button
                        onClick={() => handleToggleActive(u)}
                        className={`text-xs underline ${u.is_active ? "text-red-500 hover:text-red-700" : "text-green-600 hover:text-green-800"}`}
                      >
                        {u.is_active ? "停用" : "啟用"}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-8 h-8 rounded text-sm ${p === page ? "bg-dusk text-linen" : "bg-white border border-dusk/20 text-dusk hover:bg-linen"}`}
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">新增帳號</h3>
            <div className="flex flex-col gap-3">
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-dusk/60 uppercase tracking-wide">帳號</span>
                <input
                  className="border border-dusk/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-dusk/50"
                  value={createForm.username}
                  onChange={(e) => setCreateForm({ ...createForm, username: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-dusk/60 uppercase tracking-wide">密碼（至少 8 位）</span>
                <input
                  type="password"
                  className="border border-dusk/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-dusk/50"
                  value={createForm.password}
                  onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-dusk/60 uppercase tracking-wide">角色</span>
                <select
                  className="border border-dusk/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-dusk/50 bg-white"
                  value={createForm.role}
                  onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })}
                >
                  <option value="staff">工讀生</option>
                  <option value="admin">管理員</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-xs font-medium text-dusk/60 uppercase tracking-wide">顯示名稱（選填）</span>
                <input
                  className="border border-dusk/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-dusk/50"
                  value={createForm.display_name ?? ""}
                  onChange={(e) => setCreateForm({ ...createForm, display_name: e.target.value })}
                />
              </label>
              {createError && <p className="text-xs text-red-500">{createError}</p>}
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => { setShowCreate(false); setCreateError(null); }}
                className="flex-1 py-2 border border-dusk/20 rounded-lg text-sm text-dusk/60 hover:bg-linen"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                disabled={createLoading}
                className="flex-1 py-2 bg-dusk text-linen rounded-lg text-sm font-medium hover:bg-dusk/90 disabled:opacity-50"
              >
                {createLoading ? "建立中…" : "建立"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-1">重設密碼</h3>
            <p className="text-sm text-dusk/60 mb-4">帳號：<span className="font-mono font-medium">{resetTarget.username}</span></p>
            <label className="flex flex-col gap-1 mb-3">
              <span className="text-xs font-medium text-dusk/60 uppercase tracking-wide">新密碼（至少 8 位）</span>
              <input
                type="password"
                className="border border-dusk/20 rounded-lg px-3 py-2 text-sm outline-none focus:border-dusk/50"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            {resetError && <p className="text-xs text-red-500 mb-2">{resetError}</p>}
            <div className="flex gap-2 mt-3">
              <button
                onClick={() => setResetTarget(null)}
                className="flex-1 py-2 border border-dusk/20 rounded-lg text-sm text-dusk/60 hover:bg-linen"
              >
                取消
              </button>
              <button
                onClick={handleResetPassword}
                disabled={resetLoading || newPassword.length < 8}
                className="flex-1 py-2 bg-dusk text-linen rounded-lg text-sm font-medium hover:bg-dusk/90 disabled:opacity-50"
              >
                {resetLoading ? "重設中…" : "確認重設"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
