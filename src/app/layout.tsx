import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Instrument_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { LanguageProvider, languageInitScript } from "@/lib/i18n/language-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "latin-ext"],
});

// Headings only — a slightly tighter, more characterful sans for Promptly's
// editorial voice (see globals.css `--font-display`).
const display = Instrument_Sans({
  variable: "--font-display-face",
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
});

// The literal prompt text (`prompt-text` utility) — the thing users copy.
const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Promptly",
  description:
    "AI promptlarını paylaşan, keşfeden ve yapılandırılmış olarak oluşturan topluluk platformu.",
};

// viewport-fit=cover is required for env(safe-area-inset-*) to resolve to
// non-zero values on notched iOS devices (fixed bottom nav, see MobileNav).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="tr" className={`${inter.variable} ${display.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-text">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>{children}</AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
