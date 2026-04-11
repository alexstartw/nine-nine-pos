"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { List } from "@phosphor-icons/react";
import { Sidebar } from "@/components/Sidebar";

type Breakpoint = "desktop" | "tablet" | "mobile";

function getBreakpoint(): Breakpoint {
  if (typeof window === "undefined") return "desktop";
  if (window.matchMedia("(min-width: 1024px)").matches) return "desktop";
  if (window.matchMedia("(min-width: 768px)").matches) return "tablet";
  return "mobile";
}

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [breakpoint, setBreakpoint] = useState<Breakpoint>("desktop");
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setMobileOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const isPosPage = pathname?.startsWith("/pos");

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    const bp = getBreakpoint();
    setBreakpoint(bp);
    if (bp === "desktop") {
      setIsCollapsed(isPosPage ? true : stored === "true");
    }
    setMounted(true);

    function handleResize() {
      const next = getBreakpoint();
      setBreakpoint(next);
      if (next !== "desktop") setMobileOpen(false);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // POS 頁面時自動收合（桌機）
  useEffect(() => {
    if (!mounted) return;
    if (breakpoint === "desktop" && isPosPage && !isCollapsed) {
      setIsCollapsed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, breakpoint, mounted]);

  function handleToggleCollapse() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  // desktop: collapsed=64px / expanded=240px
  // tablet:  64px icon-only strip always (overlay doesn't push content)
  // mobile:  0px (off-screen drawer)
  const mainMargin = !mounted
    ? "ml-[240px]"
    : breakpoint === "desktop"
      ? isCollapsed
        ? "ml-[64px]"
        : "ml-[240px]"
      : breakpoint === "tablet"
        ? "ml-[64px]"
        : "ml-0";

  return (
    <div className="min-h-screen">
      {/* Hamburger（平板 / 手機）— 浮在 sidebar icon strip 右側 */}
      {mounted && breakpoint !== "desktop" && !isMobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          className="fixed left-[68px] top-3 z-50 flex h-[44px] w-[44px] items-center justify-center rounded-xl bg-sand/90 text-dusk shadow-sm backdrop-blur-sm transition hover:bg-sand active:scale-95"
          aria-label="開啟選單"
        >
          <List weight="thin" size={22} />
        </button>
      )}

      <Sidebar
        isCollapsed={isCollapsed}
        isOpen={isMobileOpen}
        breakpoint={breakpoint}
        onToggleCollapse={handleToggleCollapse}
        onClose={() => setMobileOpen(false)}
      />

      <div
        className={`transition-[margin-left] duration-[250ms] ease-in-out ${mainMargin}`}
      >
        <main className="px-6 py-8">
          <div className="mx-auto w-full max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
