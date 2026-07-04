"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { useEffect, useState } from "react";
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
  GearSix,
  Sun,
  Moon,
  HardDrive,
} from "@phosphor-icons/react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import type { FontSize, Theme } from "@/contexts/SettingsContext";
import { apiClient } from "@/lib/api";

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
  const { theme, fontSize, setTheme, setFontSize } = useSettings();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");

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
    router.replace("/login");
  }

  async function handleBackup() {
    setBackupStatus("loading");
    try {
      await apiClient.post("/api/admin/backup");
      setBackupStatus("ok");
      setTimeout(() => setBackupStatus("idle"), 3000);
    } catch {
      setBackupStatus("error");
      setTimeout(() => setBackupStatus("idle"), 3000);
    }
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

  // Settings panel position: right of sidebar (adapts to collapsed/breakpoint)
  const settingsPanelClass = clsx(
    "fixed z-50 w-64 rounded-2xl border border-white/10 bg-[#2e2820] p-5 shadow-2xl",
    isMobile
      ? "left-4 right-4 bottom-24 w-auto"
      : isTablet || (isDesktop && isCollapsed)
        ? "left-[72px] bottom-24"
        : "left-[248px] bottom-24",
  );

  return (
    <>
      {/* 遮罩（平板 / 手機 sidebar overlay） */}
      {showOverlay && (
        <div
          className="fixed inset-0 z-30 bg-dusk/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Settings 背景遮罩 — 點擊關閉 */}
      {settingsOpen && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setSettingsOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Settings 彈出視窗 */}
      {settingsOpen && (
        <div className={settingsPanelClass}>
          {/* Theme */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-linen/40">
            主題
          </p>
          <div className="mb-5 flex gap-2">
            {(["light", "dark"] as Theme[]).map((t) => (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={clsx(
                  "flex flex-1 items-center justify-center gap-1.5 rounded-xl py-2.5 text-xs transition-colors",
                  theme === t
                    ? "bg-white/15 text-linen"
                    : "text-linen/50 hover:bg-white/10 hover:text-linen",
                )}
              >
                {t === "light" ? (
                  <Sun weight="thin" size={15} />
                ) : (
                  <Moon weight="thin" size={15} />
                )}
                {t === "light" ? "亮色" : "暗色"}
              </button>
            ))}
          </div>

          {/* Font size */}
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-linen/40">
            字體大小
          </p>
          <div className="flex gap-2">
            {(["sm", "md", "lg"] as FontSize[]).map((s) => (
              <button
                key={s}
                onClick={() => setFontSize(s)}
                className={clsx(
                  "flex flex-1 items-center justify-center rounded-xl py-2.5 transition-colors",
                  fontSize === s
                    ? "bg-white/15 text-linen"
                    : "text-linen/50 hover:bg-white/10 hover:text-linen",
                  s === "sm" ? "text-xs" : s === "md" ? "text-sm" : "text-base",
                )}
              >
                {s === "sm" ? "A−" : s === "md" ? "A" : "A+"}
              </button>
            ))}
          </div>

          {/* Backup — admin only */}
          {user?.role === "admin" && (
            <>
              <div className="my-4 border-t border-white/10" />
              <button
                onClick={handleBackup}
                disabled={backupStatus === "loading"}
                className={clsx(
                  "flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-xs transition-colors",
                  backupStatus === "ok"
                    ? "bg-green-600/20 text-green-300"
                    : backupStatus === "error"
                      ? "bg-red-600/20 text-red-300"
                      : "text-linen/50 hover:bg-white/10 hover:text-linen",
                  backupStatus === "loading" && "opacity-50 cursor-not-allowed",
                )}
              >
                <HardDrive weight="thin" size={15} className="shrink-0" />
                {backupStatus === "loading"
                  ? "備份中..."
                  : backupStatus === "ok"
                    ? "備份完成 ✓"
                    : backupStatus === "error"
                      ? "備份失敗"
                      : "備份資料庫"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed left-0 top-0 z-40 flex h-screen flex-col",
          "bg-[#3a322a] text-linen",
          "transition-[width,transform] duration-300 ease-in-out will-change-[width,transform]",
          sidebarWidth,
          mobileTranslate,
          showOverlay && "shadow-2xl",
        )}
      >
        {/* ── Brand ── */}
        <div className="relative flex h-[64px] shrink-0 items-center overflow-hidden px-4">
          <span
            className={clsx(
              "whitespace-nowrap text-base font-semibold tracking-wide text-linen",
              "transition-[opacity,transform] duration-200 ease-in-out",
              showLabels
                ? "translate-x-0 opacity-100 delay-150"
                : "pointer-events-none -translate-x-1 opacity-0 delay-0",
            )}
          >
            About&#8209;Nine²
          </span>

          {/* 桌機 collapse toggle */}
          {isDesktop && (
            <button
              onClick={onToggleCollapse}
              className={clsx(
                "absolute right-2 top-1/2 -translate-y-1/2",
                "flex h-8 w-8 items-center justify-center rounded-full",
                "text-linen/50 transition-colors duration-150 hover:bg-white/10 hover:text-linen",
              )}
              title={isCollapsed ? "展開選單" : "收合選單"}
              aria-label={isCollapsed ? "展開選單" : "收合選單"}
            >
              <CaretLeft
                weight="thin"
                size={18}
                className={clsx(
                  "transition-transform duration-300 ease-in-out",
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
                {/* Group label + divider */}
                {group.group && (
                  <div className="relative h-8 overflow-hidden">
                    <p
                      className={clsx(
                        "absolute inset-x-0 px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-linen/40",
                        "transition-[opacity] duration-150 ease-in-out",
                        showLabels
                          ? "opacity-100 delay-150"
                          : "opacity-0 delay-0",
                      )}
                    >
                      {group.group}
                    </p>
                    <div
                      className={clsx(
                        "absolute inset-x-3 top-1/2 border-t border-white/10",
                        "transition-opacity duration-150 ease-in-out",
                        showLabels
                          ? "opacity-0 delay-0"
                          : "opacity-100 delay-150",
                      )}
                    />
                  </div>
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
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-[55%] w-[3px] -translate-y-1/2 rounded-r-full bg-linen" />
                      )}
                      <Icon weight="thin" size={20} className="shrink-0" />
                      <span
                        className={clsx(
                          "truncate text-sm transition-[opacity,transform] duration-150 ease-in-out",
                          showLabels
                            ? "translate-x-0 opacity-100 delay-150"
                            : "pointer-events-none -translate-x-1 opacity-0 delay-0",
                        )}
                      >
                        {label}
                      </span>
                    </Link>
                  );
                })}
              </div>
            ))}
        </nav>

        {/* ── Settings gear button ── */}
        <button
          onClick={() => setSettingsOpen((v) => !v)}
          className={clsx(
            "flex w-full min-h-[40px] shrink-0 items-center gap-3 px-4",
            "text-linen/40 transition-colors hover:text-linen/70",
            settingsOpen && "text-linen/70",
            !showLabels && "justify-center",
          )}
          title="外觀設定"
        >
          <GearSix
            weight="thin"
            size={18}
            className={clsx(
              "shrink-0 transition-transform duration-300",
              settingsOpen && "rotate-90",
            )}
          />
          <span
            className={clsx(
              "text-xs transition-[opacity] duration-150 ease-in-out",
              showLabels
                ? "opacity-100 delay-150"
                : "w-0 overflow-hidden opacity-0 delay-0",
            )}
          >
            外觀設定
          </span>
        </button>

        {/* ── User 區 ── */}
        <div className="shrink-0 border-t border-white/10 pb-4 pt-3">
          {isLoaded && (
            <>
              {user ? (
                <div
                  className={clsx(
                    "flex flex-col gap-2 px-4",
                    !showLabels && "items-center",
                  )}
                >
                  <div
                    className={clsx(
                      "flex items-center gap-2 overflow-hidden text-xs",
                      "transition-[opacity,max-height] duration-150 ease-in-out",
                      showLabels
                        ? "max-h-8 opacity-100 delay-150"
                        : "max-h-0 opacity-0 delay-0",
                    )}
                  >
                    <span className="truncate font-medium text-linen/90">
                      {user.username}
                    </span>
                    <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-linen/60">
                      {user.role === "admin" ? "管理員" : "工讀生"}
                    </span>
                  </div>
                  <button
                    onClick={handleLogout}
                    className={clsx(
                      "flex min-h-[40px] items-center justify-center gap-2 rounded-xl",
                      "border border-white/15 text-xs text-linen/60",
                      "transition-[colors,width] duration-300 hover:bg-white/10 hover:text-linen active:scale-[0.97]",
                      showLabels ? "w-full px-3" : "w-[40px]",
                    )}
                    title="登出"
                  >
                    <SignOut weight="thin" size={16} className="shrink-0" />
                    <span
                      className={clsx(
                        "transition-[opacity] duration-150 ease-in-out",
                        showLabels
                          ? "opacity-100 delay-150"
                          : "w-0 overflow-hidden opacity-0 delay-0",
                      )}
                    >
                      登出
                    </span>
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
                      "transition-[colors,width] duration-300 hover:bg-white/10 hover:text-linen",
                      showLabels ? "w-full px-3" : "w-[40px]",
                    )}
                    title="登入"
                  >
                    <SignIn weight="thin" size={16} className="shrink-0" />
                    <span
                      className={clsx(
                        "transition-[opacity] duration-150 ease-in-out",
                        showLabels
                          ? "opacity-100 delay-150"
                          : "w-0 overflow-hidden opacity-0 delay-0",
                      )}
                    >
                      登入
                    </span>
                  </Link>
                </div>
              )}
            </>
          )}

          <p
            className={clsx(
              "mt-3 px-4 text-[10px] text-linen/25",
              "transition-opacity duration-150 ease-in-out",
              showLabels ? "opacity-100 delay-150" : "opacity-0 delay-0",
            )}
          >
            v{process.env.NEXT_PUBLIC_APP_VERSION ?? "2.6"}
          </p>
        </div>
      </aside>
    </>
  );
}
