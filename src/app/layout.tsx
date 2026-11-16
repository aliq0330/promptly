import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { ThemeProvider, themeInitScript } from "@/components/theme/theme-provider";
import { LanguageProvider, languageInitScript } from "@/lib/i18n/language-provider";
import { AuthProvider } from "@/features/auth/auth-provider";
import { AuthPromptProvider } from "@/features/auth/auth-prompt-provider";
import { PreferencesSync } from "@/features/auth/preferences-sync";
import { KeyboardState } from "@/components/layout/keyboard-state";
import { PageTitle } from "@/components/layout/page-title";
import { TaxonomyHydrator } from "@/features/content/taxonomy-hydrator";
import "./fonts.css";
import "./globals.css";

// Yazı tipleri kendi dosyalarımızdan gelir (`fonts.css`, docs/history/405-*): gövde DM Sans (Meydan, docs/history/190-*), başlıklar ve wordmark
// Bricolage Grotesque, prompt metni JetBrains Mono. Derleme Google Fonts'a gitmez.

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
    <html lang="tr" className="h-full antialiased" suppressHydrationWarning>
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
              <KeyboardState />
              <AuthPromptProvider>{children}</AuthPromptProvider>
            </AuthProvider>
          </LanguageProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
