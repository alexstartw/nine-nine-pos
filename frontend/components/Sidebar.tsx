"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useEffect } from "react";
import {
  CaretLeft,
  ChartLineUp,
  Storefront,
  Package,
  Users,
  UsersThree,
  CalendarBlank,
  Tag,
  Barcode,
  Buildings,
  Tray,
  SignOut,
  SignIn,
  List,
} from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";

// ── Navigation data ──────────────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  Icon: React.ElementType;
}

interface NavGroup {
  group: string;
  links: NavLink[];
}

const adminNav: NavGroup[] = [
  {
    group: "銷售",
    links: [
      { href: "/analytics/sales", label: "銷售分析", Icon: ChartLineUp },
      { href: "/pos", label: "POS", Icon: Storefront },
      { href: "/orders", label: "訂單", Icon: Package },
    ],
  },
  {
    group: "會員",
    links: [
      { href: "/members", label: "會員", Icon: Users },
      { href: "/reservations", label: "預訂/留貨", Icon: CalendarBlank },
    ],
  },
  {
    group: "商品",
    links: [
      { href: "/products", label: "商品", Icon: Tag },
      { href: "/barcodes", label: "條碼", Icon: Barcode },
      { href: "/vendors", label: "廠商", Icon: Buildings },
      { href: "/stock", label: "入庫紀錄", Icon: Tray },
    ],
  },
  {
    group: "系統",
    links: [{ href: "/users", label: "帳號管理", Icon: UsersThree }],
  },
];

const staffNav: NavGroup[] = [
  {
    group: "",
    links: [
      { href: "/pos", label: "POS", Icon: Storefront },
      { href: "/members", label: "會員", Icon: Users },
      { href: "/products", label: "商品", Icon: Tag },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  isCollapsed: boolean;
  isOpen: boolean;
  breakpoint: "desktop" | "tablet" | "mobile";
  onToggleCollapse: () => void;
  onClose: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function Sidebar({
  isCollapsed,
  isOpen,
  breakpoint,
  onToggleCollapse,
  onClose,
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, isLoaded } = useAuth();

  const isDesktop = breakpoint === "desktop";
  const isTablet = breakpoint === "tablet";
  const isMobile = breakpoint === "mobile";

  const navGroups = user?.role === "admin" ? adminNav : staffNav;
  const showLabels = isDesktop ? !isCollapsed : isOpen;

  // 路由變動時自動關閉 overlay（平板 / 手機）
  useEffect(() => {
    if (!isDesktop) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function handleLogout() {
    logout();
    router.replace("/pos");
  }

  // ── 寬度 & 位移 ───────────────────────────────────────────────────────────
  const sidebarWidth = isDesktop
    ? isCollapsed
      ? "w-[64px]"
      : "w-[240px]"
    : isTablet
      ? isOpen
        ? "w-[240px]"
        : "w-[64px]"
      : "w-[240px]";

  const mobileTranslate = isMobile
    ? isOpen
      ? "translate-x-0"
      : "-translate-x-full"
    : "";
  const showOverlay = (isTablet && isOpen) || (isMobile && isOpen);

  return (
    <>
      {/* 遮罩 */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-30 bg-dusk/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed left-0 top-0 z-40 flex h-screen flex-col",
          "bg-[#3a322a] text-linen",
          "transition-[width,transform] duration-[250ms] ease-in-out",
          sidebarWidth,
          mobileTranslate,
          showOverlay && "shadow-2xl",
        )}
      >
        {/* ── Brand ── */}
        <div className="relative flex h-[64px] shrink-0 items-center overflow-hidden px-4">
          {showLabels && (
            <span className="whitespace-nowrap text-base font-semibold tracking-wide text-linen transition-opacity duration-200">
              About&#8209;Nine²
            </span>
          )}

          {/* 桌機 collapse toggle */}
          {isDesktop && (
            <button
              onClick={onToggleCollapse}
              className={clsx(
                "absolute right-2 top-1/2 -translate-y-1/2",
                "flex h-8 w-8 items-center justify-center rounded-full",
                "text-linen/50 transition hover:bg-white/10 hover:text-linen",
              )}
              title={isCollapsed ? "展開選單" : "收合選單"}
              aria-label={isCollapsed ? "展開選單" : "收合選單"}
            >
              <CaretLeft
                weight="thin"
                size={18}
                className={clsx(
                  "transition-transform duration-[250ms]",
                  isCollapsed && "rotate-180",
                )}
              />
            </button>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {isLoaded &&
            navGroups.map((group) => (
              <div key={group.group || "staff"} className="mb-1">
                {/* Group label */}
                {group.group && showLabels && (
                  <p className="mb-1 mt-3 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-linen/40">
                    {group.group}
                  </p>
                )}
                {/* Group divider（icon-only 模式） */}
                {group.group && !showLabels && (
                  <div className="mx-3 my-2 border-t border-white/10" />
                )}

                {group.links.map(({ href, label, Icon }) => {
                  const isActive = !!pathname?.startsWith(href);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={clsx(
                        "relative flex min-h-[44px] items-center gap-3 px-4 py-2.5",
                        "text-sm font-medium transition-colors duration-150",
                        isActive
                          ? "bg-white/10 text-linen"
                          : "text-linen/65 hover:bg-white/6 hover:text-linen",
                      )}
                      title={!showLabels ? label : undefined}
                    >
                      {/* Active indicator */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-[55%] w-[3px] -translate-y-1/2 rounded-r-full bg-linen" />
                      )}
                      <Icon weight="thin" size={20} className="shrink-0" />
                      {showLabels && <span className="truncate">{label}</span>}
                    </Link>
                  );
                })}
              </div>
            ))}
        </nav>

        {/* ── User 區 ── */}
        <div className="shrink-0 border-t border-white/10 pb-4 pt-3">
          {isLoaded && (
            <>
              {user?.role === "admin" ? (
                <div
                  className={clsx(
                    "flex flex-col gap-2 px-4",
                    !showLabels && "items-center",
                  )}
                >
                  {showLabels && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="truncate font-medium text-linen/90">
                        {user.username}
                      </span>
                      <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-linen/60">
                        管理員
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className={clsx(
                      "flex min-h-[40px] items-center justify-center gap-2 rounded-xl",
                      "border border-white/15 text-xs text-linen/60",
                      "transition hover:bg-white/10 hover:text-linen active:scale-[0.97]",
                      showLabels ? "w-full px-3" : "w-[40px]",
                    )}
                    title="登出"
                  >
                    <SignOut weight="thin" size={16} className="shrink-0" />
                    {showLabels && <span>登出</span>}
                  </button>
                </div>
              ) : (
                <div
                  className={clsx("px-4", !showLabels && "flex justify-center")}
                >
                  <Link
                    href="/login"
                    className={clsx(
                      "flex min-h-[40px] items-center justify-center gap-2 rounded-xl",
                      "border border-white/15 text-xs text-linen/60",
                      "transition hover:bg-white/10 hover:text-linen",
                      showLabels ? "w-full px-3" : "w-[40px]",
                    )}
                    title="管理員登入"
                  >
                    <SignIn weight="thin" size={16} className="shrink-0" />
                    {showLabels && <span>管理員登入</span>}
                  </Link>
                </div>
              )}
            </>
          )}

          {showLabels && (
            <p className="mt-3 px-4 text-[10px] text-linen/25">
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0"}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
