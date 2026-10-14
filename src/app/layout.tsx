import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter, Instrument_Sans, JetBrains_Mono, Newsreader } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { LanguageProvider, languageInitScript } from "@/lib/i18n/language-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import { AuthPromptProvider } from "@/features/auth/auth-prompt-provider";
import { PreferencesSync } from "@/features/auth/preferences-sync";
import { PageTitle } from "@/components/layout/page-title";
import { TaxonomyHydrator } from "@/features/content/taxonomy-hydrator";
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

// Editorial serif for page-level titles (globals.css `--font-serif`,
// applied to text-display / text-h1 / text-h2). Variable font with the
// optical-size axis, so it stays crisp from section titles to the hero.
const serif = Newsreader({
  variable: "--font-serif-face",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

// The literal prompt text (`prompt-text` utility) — the thing users copy.
const mono = JetBrains_Mono({
  variable: "--font-mono-face",
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
});

const SITE_URL = "https://aliq0330.github.io/promptly";
const SITE_DESCRIPTION =
  "AI promptlarını paylaşan, keşfeden ve yapılandırılmış olarak oluşturan topluluk platformu.";

// Static export: one site-wide card. Detail pages are client-rendered `?id=`
// routes and share this card; public content instead gets its own build-time
// static share page (`/share/<kind>/<key>/`, see src/app/share) with its own
// title/description — that is the link the "Paylaş" actions hand out.
export const metadata: Metadata = {
  metadataBase: new URL(`${SITE_URL}/`),
  title: "Promptly",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "Promptly",
    title: "Promptly",
    description: SITE_DESCRIPTION,
    url: `${SITE_URL}/`,
    images: [{ url: `${SITE_URL}/og.png`, width: 1200, height: 630, alt: "Promptly" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Promptly",
    description: SITE_DESCRIPTION,
    images: [`${SITE_URL}/og.png`],
  },
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
    <html lang="tr" className={`${inter.variable} ${display.variable} ${mono.variable} ${serif.variable} h-full antialiased`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageInitScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-background text-text">
        <ThemeProvider>
          <LanguageProvider>
            <AuthProvider>
              <PreferencesSync />
              <TaxonomyHydrator />
              <PageTitle />
              <AuthPromptProvider>{children}</AuthPromptProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
