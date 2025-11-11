import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Header } from '@/components/Header';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'about-nine^2 POS',
  description: 'Modular POS & inventory platform for about-nine^2'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-linen text-dusk min-h-screen`}>
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 px-6 py-8">
            <div className="mx-auto w-full max-w-6xl">{children}</div>
          </main>
          <footer className="bg-dusk text-linen text-sm py-4 text-center">
            Powered by about-nine^2 • POS & Inventory Suite
          </footer>
        </div>
      </body>
    </html>
  );
}
