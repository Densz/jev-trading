"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import {
  ArrowUpRight,
  ChartNoAxesCombined,
  Clock3,
  Coins,
  FlaskConical,
  LayoutDashboard,
  Moon,
  ShieldCheck,
  Sun,
} from "lucide-react";
import { Button } from "./ui/button";
import { cn } from "@/lib/utils";

const links = [
  { href: "/", label: "Watchlist", icon: LayoutDashboard },
  { href: "/history", label: "Analysis history", icon: Clock3 },
  { href: "/usage", label: "API usage", icon: Coins },
];
export function AppShell({ children, demo }: { children: React.ReactNode; demo: boolean }) {
  const path = usePathname();
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-56 flex-col border-r border-border bg-sidebar lg:flex">
        <Link href="/" className="flex h-[76px] items-center gap-2.5 px-6">
          <span className="flex size-8 items-center justify-center rounded-lg bg-primary text-primary-foreground">
            <ChartNoAxesCombined className="size-5" />
          </span>
          <span className="text-xl font-semibold tracking-tight">
            thesis<span className="text-primary">.</span>
          </span>
        </Link>
        <div className="mx-4 mb-7 flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-3">
          <span className="flex size-7 items-center justify-center rounded-md bg-muted text-xs font-semibold">
            P
          </span>
          <div>
            <p className="text-xs font-medium">Personal workspace</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Equity research</p>
          </div>
        </div>
        <p className="px-6 text-[10px] font-semibold uppercase tracking-[.16em] text-muted-foreground">
          Research
        </p>
        <nav aria-label="Main navigation" className="mt-3 space-y-1 px-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              aria-current={path === href ? "page" : undefined}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] transition-colors",
                path === href
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="mt-auto p-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <ShieldCheck className="mb-2 size-5 text-primary" />
            <p className="text-xs font-medium">Your judgment comes first.</p>
            <p className="mt-2 text-[11px] leading-5 text-muted-foreground">
              Consistent evidence. Clear decisions. Every trade stays in your hands.
            </p>
            <Link href="/methodology" className="mt-3 flex items-center gap-1 text-xs text-primary">
              Our methodology
              <ArrowUpRight className="size-3" />
            </Link>
          </div>
          <p className="mt-5 text-center font-mono text-[10px] tracking-wider text-muted-foreground">
            POWERED BY JEV / TYPESAFE AI
          </p>
        </div>
      </aside>
      <div className="lg:ml-56">
        <header className="flex h-[76px] items-center justify-between border-b border-border px-5 sm:px-8">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="lg:hidden text-lg font-semibold text-foreground">
              thesis<span className="text-primary">.</span>
            </span>
            <span className="hidden sm:inline">Workspace</span>
            <span className="hidden sm:inline text-muted-foreground/40">/</span>
            <span className="hidden sm:inline text-foreground">
              {path.startsWith("/tickers")
                ? "Ticker research"
                : (links.find((l) => l.href === path)?.label ?? "Methodology")}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-2 rounded-full border border-border px-2.5 py-1 text-[11px] text-muted-foreground">
              <span className={cn("size-1.5 rounded-full", demo ? "bg-amber-400" : "bg-primary")} />
              {demo ? "Synthetic workspace" : "Personal research"}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Toggle color theme"
              onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
            >
              <Sun className="hidden dark:block" />
              <Moon className="dark:hidden" />
            </Button>
            <span className="hidden size-8 items-center justify-center rounded-full border border-border bg-muted text-xs sm:flex">
              P
            </span>
          </div>
        </header>
        <nav
          aria-label="Mobile navigation"
          className="flex gap-1 overflow-x-auto border-b border-border p-2 lg:hidden"
        >
          {links.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-2 text-xs",
                path === href ? "bg-primary/10 text-primary" : "text-muted-foreground",
              )}
            >
              {label}
            </Link>
          ))}
        </nav>
        {demo && (
          <div className="flex items-center justify-center gap-2 border-b border-amber-500/15 bg-amber-500/5 px-4 py-2 text-center text-[11px] text-amber-600 dark:text-amber-300">
            <FlaskConical className="size-3.5 shrink-0" />
            Demo mode: all prices, news, and recommendations are synthetic. No external APIs are
            called.
          </div>
        )}
        <main id="main-content" className="mx-auto max-w-[1680px] px-5 py-8 sm:px-8">
          {children}
        </main>
        <footer className="mx-5 flex flex-wrap items-center justify-between gap-3 border-t border-border py-5 text-[10px] leading-5 text-muted-foreground sm:mx-8">
          <p>
            This application provides AI-assisted analysis for informational purposes only. It does
            not constitute financial advice.
          </p>
          <span className="font-mono">HUMAN IN THE LOOP</span>
        </footer>
      </div>
    </div>
  );
}
