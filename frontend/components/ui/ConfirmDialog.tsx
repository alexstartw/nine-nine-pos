"use client";

import clsx from "clsx";
import { ReactNode, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface ConfirmDialogProps {
  title: string;
  /** What happens, in plain language — including what cannot be undone. */
  description?: ReactNode;
  /** The specific thing being acted on: a name, an order number, an amount. */
  details?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive. Focus always starts on cancel. */
  destructive?: boolean;
  /** Blocks both buttons while the action is in flight. */
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The one confirmation shell. Replaces window.confirm, which cannot say which
 * record it is about, cannot be styled, and on a kiosk looks like the browser
 * has broken. Focus starts on cancel, Esc backs out, Tab stays inside, and
 * focus returns to whatever opened it.
 */
export function ConfirmDialog({
  title,
  description,
  details,
  confirmLabel = "確定",
  cancelLabel = "取消",
  destructive = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  // Land on cancel, never on the button that destroys something.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => {
      // The opener is often gone by now — the row was deleted, the order was
      // cancelled, the checkout button went disabled. Focusing a detached node
      // silently drops focus to <body>, which strands keyboard and kiosk use,
      // so fall back to the page's main region.
      if (previous?.isConnected) {
        previous.focus();
        return;
      }
      const main = document.querySelector("main");
      if (main) {
        main.tabIndex = -1;
        main.focus();
      }
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (busy) return;
        event.preventDefault();
        onCancel();
        return;
      }
      if (event.key === "Tab") {
        const nodes =
          dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
        // While busy both buttons are disabled, so nothing inside is
        // focusable. Without this, Tab would walk into the page behind.
        if (!nodes || nodes.length === 0) {
          event.preventDefault();
          dialogRef.current?.focus();
          return;
        }
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  // Disabling the focused cancel button hands focus back to <body>; keep it
  // inside the dialog so Tab and Esc still belong to the dialog.
  useEffect(() => {
    if (busy) dialogRef.current?.focus();
  }, [busy]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div
        className="absolute inset-0 bg-dusk/60 backdrop-blur-sm"
        onClick={() => !busy && onCancel()}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby={
          [
            details && "confirm-dialog-details",
            description && "confirm-dialog-description",
          ]
            .filter(Boolean)
            .join(" ") || undefined
        }
        tabIndex={-1}
        className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl outline-none"
      >
        <h2
          id="confirm-dialog-title"
          className="text-lg font-semibold text-dusk"
        >
          {title}
        </h2>
        {details && (
          <div
            id="confirm-dialog-details"
            className="mt-3 rounded-xl bg-linen/80 px-3 py-2 text-sm text-dusk"
          >
            {details}
          </div>
        )}
        {description && (
          <p
            id="confirm-dialog-description"
            className="mt-3 text-sm text-dusk/80"
          >
            {description}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-3">
          <button
            ref={cancelRef}
            type="button"
            className="min-h-[44px] rounded-xl border border-sand/60 px-4 text-sm font-medium text-dusk hover:bg-linen disabled:opacity-50"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className={clsx(
              "min-h-[44px] rounded-xl px-4 text-sm font-semibold text-white shadow disabled:opacity-60",
              destructive
                ? "bg-clay hover:bg-clay/90"
                : "bg-dusk hover:bg-dusk/90",
            )}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "處理中..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
