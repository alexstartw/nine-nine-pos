'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { apiClient, Member, MemberPayload, PaginatedResponse } from '@/lib/api';
import { DatePickerField } from '@/components/DatePickerField';

const defaultForm: MemberPayload = {
  name: '',
  birthday: '',
  joined_date: '',
  phone: '',
  note: ''
};

function formatDate(value?: string | null) {
  if (!value) return '-';
  try {
    return new Intl.DateTimeFormat('zh-TW', { dateStyle: 'medium' }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function MembersPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [form, setForm] = useState<MemberPayload>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<'create' | 'edit'>('create');
  const [editingMember, setEditingMember] = useState<Member | null>(null);

  const modalTitle = useMemo(() => (modalMode === 'edit' ? '更新會員資料' : '新增會員'), [modalMode]);

  async function fetchMembers() {
    try {
      const { data } = await apiClient.get<PaginatedResponse<Member>>('/api/members', {
        params: { page: 1, size: 100 }
      });
      setMembers(data.data);
    } catch (err) {
      setError('無法取得會員資料，請稍後再試');
    }
  }

  useEffect(() => {
    fetchMembers();
  }, []);

  function openCreateModal() {
    setModalMode('create');
    setEditingMember(null);
    setForm(defaultForm);
    setError(null);
    setModalOpen(true);
  }

  function openEditModal(member: Member) {
    setModalMode('edit');
    setEditingMember(member);
    setForm({
      name: member.name,
      birthday: member.birthday ?? '',
      joined_date: member.joined_date ?? '',
      phone: member.phone ?? '',
      note: member.note ?? ''
    });
    setError(null);
    setModalOpen(true);
  }

  function closeModal() {
    if (loading) return;
    setModalOpen(false);
    setModalMode('create');
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
      note: input.note?.trim() || null
    };
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const payload = sanitizePayload(form);
    const isEditMode = modalMode === 'edit' && editingMember;

    try {
      if (isEditMode) {
        await apiClient.put(`/api/members/${editingMember.id}`, payload);
      } else {
        await apiClient.post('/api/members', payload);
      }
      await fetchMembers();
      closeModal();
    } catch (err) {
      setError(isEditMode ? '更新會員資料失敗' : '新增會員失敗，請檢查必填欄位');
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('確定要刪除此會員嗎？')) return;
    try {
      await apiClient.delete(`/api/members/${id}`);
      if (editingMember?.id === id) {
        closeModal();
      }
      await fetchMembers();
    } catch (err) {
      setError('刪除會員失敗');
    }
  }

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-sand/60 bg-white/80 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.3em] text-dusk/60">Members</p>
            <h3 className="text-2xl font-semibold">會員資料</h3>
            <p className="text-sm text-dusk/70">管理會員的基本資料與聯繫資訊。</p>
          </div>
          <button
            className="inline-flex items-center justify-center rounded-full bg-moss px-4 py-2 text-sm font-semibold text-white shadow hover:bg-moss/90"
            onClick={openCreateModal}
          >
            + 新增會員
          </button>
        </div>

        <div className="mt-4 overflow-x-auto">
          {members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-sand/60 bg-linen/60 p-6 text-center text-sm text-dusk/70">
              尚未建立會員資料。點擊「新增會員」開始建立。
            </div>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-linen text-left">
                <tr>
                  <th className="px-3 py-2">會員 ID</th>
                  <th className="px-3 py-2">姓名</th>
                  <th className="px-3 py-2">生日</th>
                  <th className="px-3 py-2">入會日期</th>
                  <th className="px-3 py-2">電話</th>
                  <th className="px-3 py-2">備註</th>
                  <th className="px-3 py-2">操作</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id} className="border-b border-sand/30">
                    <td className="px-3 py-2 font-mono text-xs uppercase tracking-wide">
                      {member.member_code}
                    </td>
                    <td className="px-3 py-2 font-medium">{member.name}</td>
                    <td className="px-3 py-2">{formatDate(member.birthday)}</td>
                    <td className="px-3 py-2">{formatDate(member.joined_date)}</td>
                    <td className="px-3 py-2">{member.phone || '-'}</td>
                    <td className="px-3 py-2">{member.note || '-'}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-3 text-sm">
                        <button
                          className="text-moss hover:underline"
                          onClick={() => openEditModal(member)}
                        >
                          編輯
                        </button>
                        <button
                          className="text-clay hover:underline"
                          onClick={() => handleDelete(member.id)}
                        >
                          刪除
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
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
                <p className="text-xs uppercase tracking-[0.3em] text-dusk/60">{modalTitle}</p>
                <h4 className="text-xl font-semibold">
                  {modalMode === 'edit' ? '維護會員基本資料' : '建立新會員'}
                </h4>
              </div>
              <button
                className="text-sm text-dusk/70 hover:text-dusk"
                onClick={() => (!loading ? closeModal() : null)}
                aria-label="Close modal"
              >
                Close
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
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  required
                  disabled={loading}
                />
              </label>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <label className="flex flex-col text-sm font-medium text-dusk/80">
                  生日
                  <DatePickerField
                    className="mt-1 w-full"
                    value={form.birthday || ''}
                    onChange={(value) => setForm((prev) => ({ ...prev, birthday: value }))}
                    disabled={loading}
                  />
                </label>
                <label className="flex flex-col text-sm font-medium text-dusk/80">
                  入會日期
                  <DatePickerField
                    className="mt-1 w-full"
                    value={form.joined_date || ''}
                    onChange={(value) => setForm((prev) => ({ ...prev, joined_date: value }))}
                    disabled={loading}
                  />
                </label>
              </div>

              <label className="flex flex-col text-sm font-medium text-dusk/80">
                電話
                <input
                  type="tel"
                  className="mt-1 rounded-xl border border-sand/60 px-3 py-2"
                  value={form.phone || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  disabled={loading}
                />
              </label>

              <label className="flex flex-col text-sm font-medium text-dusk/80">
                備註
                <textarea
                  className="mt-1 rounded-xl border border-sand/60 px-3 py-2"
                  rows={3}
                  value={form.note || ''}
                  onChange={(event) => setForm((prev) => ({ ...prev, note: event.target.value }))}
                  disabled={loading}
                />
              </label>

              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  className="rounded-full px-4 py-2 text-sm font-semibold text-dusk/80 hover:bg-linen"
                  onClick={closeModal}
                  disabled={loading}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="rounded-full bg-dusk px-4 py-2 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
                  disabled={loading}
                >
                  {modalMode === 'edit' ? '儲存變更' : '建立會員'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
