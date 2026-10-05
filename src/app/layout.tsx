import type { Metadata } from "next";
import { Providers } from "@/components/providers";
import { AppShell } from "@/components/app-shell";
import { getEnv } from "@/server/env";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Thesis | AI-assisted equity research", template: "%s | Thesis" },
  description:
    "A personal research workspace for consistent, evidence-led stock decisions. Powered by Jev / TypeSafe AI.",
};
export const dynamic = "force-dynamic";
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <a
          href="#main-content"
          className="sr-only z-50 rounded bg-primary p-3 text-primary-foreground focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          Skip to content
        </a>
        <Providers>
          <AppShell demo={getEnv().DEMO_MODE}>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
