'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

const links = [
  { href: '/products', label: '商品' },
  { href: '/vendors', label: '廠商' },
  { href: '/barcodes', label: '條碼' },
  { href: '/stock', label: '入庫紀錄' },
  { href: '/members', label: '會員' },
  { href: '/pos', label: 'POS' }
];

export function Header() {
  const pathname = usePathname();

  return (
    <header className="bg-sand text-dusk shadow-sm">
      <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.2em] text-dusk/70">Modular Retail Suite</p>
          <h1 className="text-2xl font-semibold tracking-wide">about-nine²</h1>
        </div>
        <nav className="flex gap-3 text-sm font-medium">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={clsx(
                'rounded-full px-3 py-1 transition-colors hover:bg-dusk hover:text-linen',
                pathname?.startsWith(link.href)
                  ? 'bg-dusk text-linen'
                  : 'bg-white/70 text-dusk'
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
