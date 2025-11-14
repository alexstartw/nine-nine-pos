'use client';

interface PaginationControlsProps {
  page: number;
  size: number;
  total: number;
  onPageChange: (page: number) => void;
}

export function PaginationControls({ page, size, total, onPageChange }: PaginationControlsProps) {
  const totalPages = Math.max(1, Math.ceil(total / size));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * size + 1;
  const end = total === 0 ? 0 : Math.min(total, safePage * size);

  function handleChange(next: number) {
    const clamped = Math.max(1, Math.min(next, totalPages));
    if (clamped === safePage) return;
    onPageChange(clamped);
  }

  return (
    <div className="mt-4 flex flex-col gap-3 text-sm text-dusk/70 md:flex-row md:items-center md:justify-between">
      <p>
        第 {safePage} / {totalPages} 頁 · 共 {total} 筆
        {total > 0 && (
          <>
            {' '}
            · 顯示 {start}-{end} 筆
          </>
        )}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded-full border border-sand/60 px-3 py-1 text-sm text-dusk disabled:opacity-40"
          onClick={() => handleChange(1)}
          disabled={safePage === 1}
        >
          第一頁
        </button>
        <button
          type="button"
          className="rounded-full border border-sand/60 px-3 py-1 text-sm text-dusk disabled:opacity-40"
          onClick={() => handleChange(safePage - 1)}
          disabled={safePage === 1}
        >
          上一頁
        </button>
        <button
          type="button"
          className="rounded-full border border-sand/60 px-3 py-1 text-sm text-dusk disabled:opacity-40"
          onClick={() => handleChange(safePage + 1)}
          disabled={safePage === totalPages || total === 0}
        >
          下一頁
        </button>
        <button
          type="button"
          className="rounded-full border border-sand/60 px-3 py-1 text-sm text-dusk disabled:opacity-40"
          onClick={() => handleChange(totalPages)}
          disabled={safePage === totalPages || total === 0}
        >
          最後一頁
        </button>
      </div>
    </div>
  );
}
