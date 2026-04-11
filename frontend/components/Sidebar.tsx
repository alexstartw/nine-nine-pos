'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import clsx from 'clsx';
import { useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// ── Navigation data ──────────────────────────────────────────────────────────

interface NavLink {
  href: string;
  label: string;
  icon: string;
}

interface NavGroup {
  group: string;
  links: NavLink[];
}

const adminNav: NavGroup[] = [
  {
    group: '銷售',
    links: [
      { href: '/analytics/sales', label: '銷售分析', icon: '📊' },
      { href: '/pos',             label: 'POS',      icon: '🏪' },
      { href: '/orders',          label: '訂單',      icon: '📦' },
    ],
  },
  {
    group: '會員',
    links: [
      { href: '/members',      label: '會員',    icon: '👤' },
      { href: '/reservations', label: '預訂/留貨', icon: '📋' },
    ],
  },
  {
    group: '商品',
    links: [
      { href: '/products', label: '商品',   icon: '🏷️' },
      { href: '/barcodes', label: '條碼',   icon: '🔖' },
      { href: '/vendors',  label: '廠商',   icon: '🏭' },
      { href: '/stock',    label: '入庫紀錄', icon: '📥' },
    ],
  },
];

const staffNav: NavGroup[] = [
  {
    group: '',
    links: [
      { href: '/pos',      label: 'POS', icon: '🏪' },
      { href: '/members',  label: '會員', icon: '👤' },
      { href: '/products', label: '商品', icon: '🏷️' },
    ],
  },
];

// ── Props ─────────────────────────────────────────────────────────────────────

interface SidebarProps {
  /** 桌機：true = icon-only (64px)，false = 展開 (240px) */
  isCollapsed: boolean;
  /** 平板 / 手機：overlay 是否可見 */
  isOpen: boolean;
  /** 目前 breakpoint */
  breakpoint: 'desktop' | 'tablet' | 'mobile';
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

  const isDesktop = breakpoint === 'desktop';
  const isTablet  = breakpoint === 'tablet';
  const isMobile  = breakpoint === 'mobile';

  const navGroups = user?.role === 'admin' ? adminNav : staffNav;

  // 路由變動時自動關閉 overlay（平板 / 手機）
  useEffect(() => {
    if (!isDesktop) onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  function handleLogout() {
    logout();
    router.replace('/pos');
  }

  // ── Sidebar 本體寬度 ─────────────────────────────────────────────────────
  // 桌機：依 isCollapsed 決定
  // 平板：64px 常駐底層，overlay 240px 展開於上層
  // 手機：固定 240px，預設 translateX(-100%)
  const sidebarWidth =
    isDesktop
      ? isCollapsed ? 'w-[64px]' : 'w-[240px]'
      : isTablet
        ? isOpen ? 'w-[240px]' : 'w-[64px]'
        : 'w-[240px]'; // mobile: drawer full width feel

  // 手機：translateX 控制顯示/隱藏
  const mobileTranslate =
    isMobile
      ? isOpen ? 'translate-x-0' : '-translate-x-full'
      : '';

  // 平板：isOpen 時疊加 overlay，z-index 提升
  const tabletOverlay = isTablet && isOpen;

  const showLabels =
    isDesktop ? !isCollapsed : isOpen;

  return (
    <>
      {/* ── 遮罩（平板 overlay 展開 / 手機 drawer 展開） ── */}
      {(tabletOverlay || (isMobile && isOpen)) && (
        <div
          className="fixed inset-0 z-30 bg-dusk/40 backdrop-blur-[2px]"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar 本體 ── */}
      <aside
        className={clsx(
          'fixed left-0 top-0 z-40 flex h-screen flex-col',
          'bg-[#3a322a] text-linen',
          'transition-[width,transform] duration-[250ms] ease-in-out',
          sidebarWidth,
          mobileTranslate,
          // 平板 overlay 展開時加 drop shadow
          tabletOverlay && 'shadow-2xl',
        )}
      >
        {/* ── Brand ── */}
        <div className="relative flex h-[64px] shrink-0 items-center overflow-hidden px-4">
          <span
            className={clsx(
              'whitespace-nowrap font-semibold tracking-wide transition-opacity duration-200',
              showLabels ? 'opacity-100 text-base' : 'opacity-0 w-0',
            )}
          >
            about&#8209;nine²
          </span>
          {!showLabels && (
            <span className="text-sm font-bold tracking-tight text-linen/80">a9²</span>
          )}

          {/* 桌機 collapse toggle */}
          {isDesktop && (
            <button
              onClick={onToggleCollapse}
              className={clsx(
                'absolute right-2 top-1/2 -translate-y-1/2',
                'flex h-[32px] w-[32px] items-center justify-center rounded-full',
                'text-linen/60 transition hover:bg-white/10 hover:text-linen',
              )}
              title={isCollapsed ? '展開選單' : '收合選單'}
              aria-label={isCollapsed ? '展開選單' : '收合選單'}
            >
              <svg
                className={clsx('h-4 w-4 transition-transform duration-250', isCollapsed && 'rotate-180')}
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* ── Nav ── */}
        <nav className="flex-1 overflow-y-auto overflow-x-hidden py-2">
          {isLoaded && navGroups.map((group) => (
            <div key={group.group} className="mb-1">
              {/* Group label（展開時才顯示） */}
              {group.group && showLabels && (
                <p className="mb-1 mt-3 px-4 text-[10px] font-semibold uppercase tracking-[0.2em] text-linen/40">
                  {group.group}
                </p>
              )}
              {/* Group divider（收合時） */}
              {group.group && !showLabels && (
                <div className="my-2 mx-3 border-t border-white/10" />
              )}

              {group.links.map((link) => {
                const isActive = pathname?.startsWith(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={clsx(
                      'relative flex min-h-[44px] items-center gap-3 px-4 py-2.5',
                      'text-sm font-medium transition-colors duration-150',
                      isActive
                        ? 'bg-white/10 text-linen'
                        : 'text-linen/70 hover:bg-white/5 hover:text-linen',
                    )}
                    title={!showLabels ? link.label : undefined}
                  >
                    {/* Active indicator */}
                    {isActive && (
                      <span className="absolute left-0 top-1/2 h-[60%] w-[3px] -translate-y-1/2 rounded-r-full bg-linen" />
                    )}
                    <span className="shrink-0 text-base leading-none">{link.icon}</span>
                    {showLabels && (
                      <span className="truncate">{link.label}</span>
                    )}
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
              {user?.role === 'admin' ? (
                <div className={clsx('flex flex-col gap-2 px-4', !showLabels && 'items-center')}>
                  {showLabels && (
                    <div className="flex items-center gap-2 text-xs">
                      <span className="truncate font-medium text-linen/90">{user.username}</span>
                      <span className="shrink-0 rounded-full bg-white/15 px-2 py-0.5 text-linen/70">
                        管理員
                      </span>
                    </div>
                  )}
                  <button
                    onClick={handleLogout}
                    className={clsx(
                      'flex min-h-[40px] items-center justify-center gap-2 rounded-xl',
                      'border border-white/20 text-xs text-linen/70',
                      'transition hover:bg-white/10 hover:text-linen active:scale-[0.98]',
                      showLabels ? 'w-full px-3' : 'w-[40px]',
                    )}
                    title="登出"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h6a2 2 0 012 2v1" />
                    </svg>
                    {showLabels && <span>登出</span>}
                  </button>
                </div>
              ) : (
                <div className={clsx('px-4', !showLabels && 'flex justify-center')}>
                  <Link
                    href="/login"
                    className={clsx(
                      'flex min-h-[40px] items-center justify-center gap-2 rounded-xl',
                      'border border-white/20 text-xs text-linen/70',
                      'transition hover:bg-white/10 hover:text-linen',
                      showLabels ? 'w-full px-3' : 'w-[40px]',
                    )}
                    title="管理員登入"
                  >
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h7a2 2 0 012 2v1" />
                    </svg>
                    {showLabels && <span>管理員登入</span>}
                  </Link>
                </div>
              )}
            </>
          )}

          {/* 版本號 */}
          {showLabels && (
            <p className="mt-3 px-4 text-[10px] text-linen/30">
              v{process.env.NEXT_PUBLIC_APP_VERSION ?? '2.0'}
            </p>
          )}
        </div>
      </aside>
    </>
  );
}
