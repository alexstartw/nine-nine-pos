'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';
import { useEffect, useMemo, useRef, useState } from 'react';

const links = [
  { href: '/analytics/sales', label: '銷售分析' },
  { href: '/products', label: '商品' },
  { href: '/vendors', label: '廠商' },
  { href: '/barcodes', label: '條碼' },
  { href: '/stock', label: '入庫紀錄' },
  { href: '/members', label: '會員' },
  { href: '/reservations', label: '預訂/留貨' },
  { href: '/orders', label: '訂單' },
  { href: '/pos', label: 'POS' }
];

export function Header() {
  const pathname = usePathname();
  const navRef = useRef<HTMLDivElement | null>(null);
  const [indicatorStyle, setIndicatorStyle] = useState<React.CSSProperties>({});

  const activeIndex = useMemo(
    () => links.findIndex((link) => pathname?.startsWith(link.href)),
    [pathname]
  );

  useEffect(() => {
    if (!navRef.current) return;
    if (activeIndex < 0) {
      setIndicatorStyle({ width: 0 });
      return;
    }
    const pills = navRef.current.querySelectorAll<HTMLAnchorElement>('a.nav-pill');
    const target = pills[activeIndex];
    if (!target) return;
    const offsetLeft = target.offsetLeft;
    const width = target.offsetWidth;
    setIndicatorStyle({
      transform: `translateX(${offsetLeft}px)`,
      width
    });
  }, [activeIndex]);

  return (
    <header className="bg-sand text-dusk shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">Modular Retail Suite</p>
          <h1 className="text-2xl font-semibold tracking-wide">about-nine²</h1>
        </div>
        <nav
          ref={navRef}
          className="relative flex gap-2 overflow-x-auto rounded-full bg-white/60 p-1 text-sm font-medium shadow-inner"
        >
          <span
            className="nav-pill__indicator"
            style={indicatorStyle}
            aria-hidden="true"
          />
          {links.map((link) => {
            const isActive = pathname?.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={clsx(
                  'nav-pill',
                  isActive && 'nav-pill--active'
                )}
              >
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
