"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import { DatePickerField } from "@/components/DatePickerField";
import { ModalCloseButton } from "@/components/ui/ModalCloseButton";
import { apiClient, extractApiError, PosMemberInfo } from "@/lib/api";
import { formatPhone } from "@/lib/format";

interface QuickMemberModalProps {
  /** Phone typed in the lookup box, used to pre-fill the form. */
  initialPhone: string;
  onClose: () => void;
  /** Called with the new (or already existing) member, ready to attach to the order. */
  onSelect: (member: PosMemberInfo) => void;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const inputClass =
  "mt-1 min-h-[44px] w-full rounded-xl border border-sand/60 bg-white px-3 text-sm text-dusk";

/**
 * Create a member without leaving the POS. Phone is required here because
 * the POS finds members by phone; the new member is attached to the order
 * as soon as it is created.
 */
export function QuickMemberModal({ initialPhone, onClose, onSelect }: QuickMemberModalProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState(initialPhone.trim());
  const [birthday, setBirthday] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [existing, setExisting] = useState<PosMemberInfo | null>(null);
  const nameRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape" && !saving) onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, saving]);

  async function findByPhone(value: string): Promise<PosMemberInfo | null> {
    try {
      const { data } = await apiClient.get<PosMemberInfo>("/api/pos/members/by-phone", {
        params: { phone: value },
      });
      return data;
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.status === 404) return null;
      throw err;
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setError("請輸入姓名");
      return;
    }
    if (trimmedPhone.replace(/\D/g, "").length < 4) {
      setError("請輸入完整電話");
      return;
    }

    setSaving(true);
    setError(null);
    setExisting(null);
    try {
      // Avoid creating a second member for a phone that is already registered.
      const found = await findByPhone(trimmedPhone);
      if (found) {
        setExisting(found);
        return;
      }
      await apiClient.post("/api/members", {
        name: trimmedName,
        phone: trimmedPhone,
        birthday: birthday || null,
        joined_date: todayISO(),
        note: note.trim() || null,
      });
      const created = await findByPhone(trimmedPhone);
      if (!created) {
        setError("會員已建立，但帶入失敗，請用電話查詢一次");
        return;
      }
      onSelect(created);
    } catch (err) {
      setError(extractApiError(err, "建立會員失敗，請稍後再試"));
    } finally {
      setSaving(false);
    }
  }

  // Rendered into <body> so the sticky checkout panel's stacking context can't put it under the sidebar.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-dusk/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-member-title"
        className="relative z-10 w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-dusk/60">新增會員</p>
            <h4 id="quick-member-title" className="text-xl font-semibold text-dusk">
              建立會員並帶入這筆訂單
            </h4>
          </div>
          <ModalCloseButton onClick={onClose} disabled={saving} />
        </div>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit}>
          <label className="text-sm text-dusk/70">
            姓名 *
            <input
              ref={nameRef}
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={saving}
            />
          </label>
          <label className="text-sm text-dusk/70">
            電話 *
            <input
              type="tel"
              inputMode="tel"
              className={inputClass}
              placeholder="09xx-xxx-xxx"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setExisting(null);
              }}
              disabled={saving}
            />
          </label>
          <label className="text-sm text-dusk/70">
            生日（選填）
            <DatePickerField className="mt-1 w-full" value={birthday} onChange={setBirthday} disabled={saving} />
          </label>
          <label className="text-sm text-dusk/70">
            備註（選填）
            <textarea
              className="mt-1 min-h-[72px] w-full rounded-xl border border-sand/60 bg-white px-3 py-2 text-sm text-dusk"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={saving}
            />
          </label>
          <p className="text-xs text-dusk/60">入會日期自動設為今天。</p>

          {existing && (
            <div className="flex items-center justify-between gap-3 rounded-xl bg-linen px-3 py-2.5 text-sm">
              <p className="min-w-0 text-dusk">
                這支電話已經是會員：
                <span className="font-semibold">{existing.name}</span>
                <span className="text-dusk/60">（{existing.member_code} · {formatPhone(existing.phone)}）</span>
              </p>
              <button
                type="button"
                className="min-h-[36px] shrink-0 rounded-lg bg-dusk px-3 text-xs font-semibold text-white hover:bg-dusk/90"
                onClick={() => onSelect(existing)}
              >
                直接帶入
              </button>
            </div>
          )}
          {error && <p className="rounded-xl bg-clay/10 px-3 py-2 text-sm text-clay">{error}</p>}

          <div className="mt-2 flex gap-3">
            <button
              type="button"
              className="min-h-[44px] flex-1 rounded-xl border border-sand/60 px-4 text-sm text-dusk hover:bg-linen/80"
              onClick={onClose}
              disabled={saving}
            >
              取消
            </button>
            <button
              type="submit"
              className="min-h-[44px] flex-1 rounded-xl bg-dusk px-5 text-sm font-semibold text-white shadow hover:bg-dusk/90 disabled:opacity-60"
              disabled={saving}
            >
              {saving ? "建立中…" : "建立並帶入"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
