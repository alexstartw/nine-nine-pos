import { Header } from "@/components/Header";

export default function RoutesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 px-6 py-8">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
      <footer className="bg-dusk text-linen text-sm py-4 text-center">
        Powered by about-nine² • POS &amp; Inventory Suite
        <span className="ml-2 text-xs text-linen/80">
          v{process.env.NEXT_PUBLIC_APP_VERSION ?? "2.0"}
        </span>
      </footer>
    </div>
  );
}
