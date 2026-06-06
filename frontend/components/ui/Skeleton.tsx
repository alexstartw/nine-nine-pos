import clsx from "clsx";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={clsx(
        "animate-pulse rounded bg-[var(--border)] opacity-50",
        className,
      )}
    />
  );
}

export function SkeletonTableRows({
  rows = 8,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} className="border-b border-[var(--border-sub)]">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-3 py-3">
              <Skeleton
                className={clsx(
                  "h-4",
                  j === 0 ? "w-3/4" : j === cols - 1 ? "w-1/4" : "w-1/2",
                )}
              />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export function SkeletonStatCards({ count = 4 }: { count?: number }) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-[var(--border)] bg-[var(--bg-surface)] p-5"
        >
          <Skeleton className="mb-3 h-3 w-1/3" />
          <Skeleton className="h-7 w-2/3" />
        </div>
      ))}
    </>
  );
}
