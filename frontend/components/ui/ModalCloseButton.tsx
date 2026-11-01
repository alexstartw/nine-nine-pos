"use client";

interface ModalCloseButtonProps {
  onClick: () => void;
  disabled?: boolean;
}

/** Icon-only close button used in the top-right corner of every dialog. */
export function ModalCloseButton({ onClick, disabled }: ModalCloseButtonProps) {
  return (
    <button
      type="button"
      aria-label="關閉"
      onClick={onClick}
      disabled={disabled}
      className="-mr-2 -mt-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-dusk/60 transition-colors hover:bg-linen hover:text-dusk disabled:opacity-40"
    >
      <svg
        aria-hidden="true"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}
