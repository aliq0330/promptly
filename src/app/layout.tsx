import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Promptly",
  description:
    "AI görsel üretim promptlarını paylaşan, keşfeden ve remixleyen yaratıcı topluluk platformu.",
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
    <html lang="tr" className={`${inter.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-text">
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
