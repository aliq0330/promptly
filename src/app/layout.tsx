import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Bricolage_Grotesque, DM_Sans, JetBrains_Mono } from "next/font/google";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { LanguageProvider, languageInitScript } from "@/lib/i18n/language-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import { AuthPromptProvider } from "@/features/auth/auth-prompt-provider";
import { PreferencesSync } from "@/features/auth/preferences-sync";
import { PageTitle } from "@/components/layout/page-title";
import { TaxonomyHydrator } from "@/features/content/taxonomy-hydrator";
import "./globals.css";

// Meydan (docs/history/190-*): a friendly, legible sans for UI and body text.
const body = DM_Sans({
  variable: "--font-body-face",
  subsets: ["latin", "latin-ext"],
  axes: ["opsz"],
});

// Headings, page titles and the wordmark (globals.css `--font-display`):
// a characterful grotesque that gives the social feed its voice.
const display = Bricolage_Grotesque({
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
  // Installable web app (src/app/manifest.ts). No service worker: nothing is cached offline.
  applicationName: "Promptly",
  appleWebApp: { capable: true, title: "Promptly", statusBarStyle: "default" },
  // basePath is not applied to metadata icon URLs.
  icons: { apple: [{ url: "/promptly/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }] },
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
    <html lang="tr" className={`${body.variable} ${display.variable} ${mono.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full flex flex-col bg-background text-text">
        {/* Run at parse time, before first paint (no light/dark, palette or language flash). They sit in <body>, not in a
            hand-written <head>: inline scripts in <head> made React #418-recover the whole document on repeat
            visits (docs/history/192-*). */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <script dangerouslySetInnerHTML={{ __html: languageInitScript }} />
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
