import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Каталог предметов",
    template: "%s · Stalzone",
  },
  description: "Каталог предметов Stalzone",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <header className="border-b border-line bg-surface">
          <div className="flex h-16 items-center gap-8 px-6 lg:px-10">
            <Link href="/" className="text-base font-semibold tracking-tight">
              Stalzone
            </Link>
            <nav className="flex items-center gap-6 text-sm text-muted">
              <Link href="/" className="transition-colors hover:text-accent">
                Каталог
              </Link>
            </nav>
          </div>
        </header>

        <main className="flex-1 px-6 py-8 lg:px-10">{children}</main>

        <footer className="border-t border-line bg-surface">
          <div className="grid gap-8 px-6 py-10 sm:grid-cols-3 lg:px-10">
            <div className="flex flex-col gap-2">
              <span className="text-sm font-semibold">Stalzone</span>
              <p className="max-w-xs text-sm text-muted">
                Каталог предметов: характеристики, история продаж и аукцион.
              </p>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide text-faint">
                Навигация
              </span>
              <Link
                href="/"
                className="text-sm text-muted transition-colors hover:text-accent"
              >
                Каталог
              </Link>
            </div>

            <div className="flex flex-col gap-2">
              <span className="text-xs uppercase tracking-wide text-faint">
                Данные
              </span>
              <span className="text-sm text-muted">stalzone-database</span>
            </div>
          </div>

          <div className="border-t border-line px-6 py-4 text-xs text-faint lg:px-10">
            © 2026 zone-app
          </div>
        </footer>
      </body>
    </html>
  );
}
