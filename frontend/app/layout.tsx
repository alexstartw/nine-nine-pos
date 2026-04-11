import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Header } from "@/components/Header";
import { AuthProvider } from "@/contexts/AuthContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "about-nine² POS",
  description: "Modular POS & inventory platform for about-nine²",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-linen text-dusk min-h-screen`}>
        <AuthProvider>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1 px-6 py-8">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
            <footer className="bg-dusk text-linen text-sm py-4 text-center">
              Powered by about-nine² • POS & Inventory Suite
              <span className="ml-2 text-xs text-linen/80">
                v{process.env.NEXT_PUBLIC_APP_VERSION ?? "1.4"}
              </span>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
