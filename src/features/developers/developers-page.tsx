"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Check, Copy } from "lucide-react";
import { PageContainer } from "@/components/ui/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { LEGAL_CONTACT_EMAIL } from "@/features/legal/legal-content";
import { useTranslation } from "@/lib/i18n/language-provider";
import { developerEndpoints, developerSnippets } from "@/lib/developers";
import { copyTextToClipboard } from "@/lib/utils";

/** A copyable mono block. The copy button is the only control; the text stays selectable. */
function CodeBlock({ text, label }: { text: string; label: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (await copyTextToClipboard(text)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    }
  }

  return (
    <div className="relative rounded-lg border border-border-soft bg-surface-soft">
      <pre className="prompt-text overflow-x-auto whitespace-pre-wrap break-all px-3 py-3 pr-12 text-small text-text">{text}</pre>
      <button
        type="button"
        onClick={copy}
        aria-label={`${t("dev.copy")}: ${label}`}
        data-dev-copy=""
        className="absolute right-1.5 top-1.5 flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-surface hover:text-text"
      >
        {copied ? <Check size={16} className="text-success" /> : <Copy size={16} />}
        <span className="sr-only" aria-live="polite">
          {copied ? t("dev.copied") : ""}
        </span>
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-h2 text-text">{title}</h2>
      {children}
    </section>
  );
}

function Step({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="space-y-2">
      <h3 className="text-h3 text-text">{title}</h3>
      {body && <p className="text-body leading-relaxed text-text-secondary">{body}</p>}
      {children}
    </div>
  );
}

/**
 * Herkese açık "Geliştiriciler" sayfası (docs/history/301-*): MCP bağlayıcısı ve salt-okunur HTTP API'sinin nasıl kullanılacağı.
 * Adresler `NEXT_PUBLIC_SUPABASE_URL`'den türetilir (`lib/developers.ts`); oturum gerekmez.
 */
export function DevelopersPage() {
  const { t } = useTranslation();
  usePageTitle(t("dev.title"));
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const snippets = endpoints ? developerSnippets(endpoints) : null;

  return (
    <PageContainer className="mx-auto max-w-3xl space-y-10">
      <header className="space-y-3">
        <h1 className="font-display text-h1 text-text">{t("dev.title")}</h1>
        <p className="text-body leading-relaxed text-text-secondary">{t("dev.intro")}</p>
      </header>

      <Section title={t("dev.mcpTitle")}>
        <p className="text-body leading-relaxed text-text-secondary">{t("dev.mcpLead")}</p>
        {endpoints && snippets ? (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-label text-text">{t("dev.mcpUrlLabel")}</p>
              <CodeBlock text={endpoints.mcpUrl} label={t("dev.mcpUrlLabel")} />
            </div>
            <Step title={t("dev.stepAppTitle")} body={t("dev.stepAppBody")} />
            <Step title={t("dev.stepCodeTitle")}>
              <CodeBlock text={snippets.claudeCode} label={t("dev.stepCodeTitle")} />
            </Step>
            <Step title={t("dev.stepOtherTitle")} body={t("dev.stepOtherBody")}>
              <CodeBlock text={snippets.cursorJson} label={t("dev.stepOtherTitle")} />
            </Step>
            <Step title={t("dev.stepLocalTitle")} body={t("dev.stepLocalBody")}>
              <CodeBlock text={snippets.localNpx} label={t("dev.stepLocalTitle")} />
            </Step>
          </div>
        ) : (
          <p className="text-body text-text-muted">{t("dev.unavailable")}</p>
        )}

        <Step title={t("dev.tryTitle")} body={t("dev.tryBody")} />
        <ul className="list-disc space-y-1.5 pl-5 text-body leading-relaxed text-text-secondary marker:text-text-muted">
          <li>
            <code className="prompt-text text-small">search_prompts</code> — {t("dev.toolSearch")}
          </li>
          <li>
            <code className="prompt-text text-small">popular_prompts</code> — {t("dev.toolPopular")}
          </li>
          <li>
            <code className="prompt-text text-small">get_prompt</code> — {t("dev.toolGet")}
          </li>
          <li>
            <code className="prompt-text text-small">fill_prompt</code> — {t("dev.toolFill")}
          </li>
        </ul>
      </Section>

      <Section title={t("dev.apiTitle")}>
        <p className="text-body leading-relaxed text-text-secondary">{t("dev.apiLead")}</p>
        {endpoints && snippets && (
          <div className="space-y-6">
            <div className="space-y-2">
              <p className="text-label text-text">{t("dev.apiBaseLabel")}</p>
              <CodeBlock text={endpoints.apiBase} label={t("dev.apiBaseLabel")} />
            </div>
            <Step title={t("dev.apiSearch")}>
              <CodeBlock text={snippets.curlSearch} label={t("dev.apiSearch")} />
            </Step>
            <Step title={t("dev.apiGet")}>
              <CodeBlock text={snippets.curlGet} label={t("dev.apiGet")} />
            </Step>
            <Step title={t("dev.apiFill")}>
              <CodeBlock text={snippets.curlFill} label={t("dev.apiFill")} />
            </Step>
            <Step title={t("dev.apiJs")}>
              <CodeBlock text={snippets.fetchJs} label={t("dev.apiJs")} />
            </Step>
            <p className="text-body text-text-secondary">
              {t("dev.openApi")}{" "}
              <a
                href={endpoints.openApiUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="break-all font-medium text-primary underline underline-offset-2 hover:no-underline"
              >
                openapi.json
              </a>
            </p>
          </div>
        )}
      </Section>

      <Section title={t("dev.rulesTitle")}>
        <ul className="list-disc space-y-2 pl-5 text-body leading-relaxed text-text-secondary marker:text-text-muted">
          <li>{t("dev.ruleReadOnly")}</li>
          <li>{t("dev.rulePublicOnly")}</li>
          <li>{t("dev.ruleCredit")}</li>
          <li>{t("dev.ruleUntrusted")}</li>
          <li>{t("dev.ruleFairUse")}</li>
        </ul>
        <p className="text-body text-text-secondary">
          {t("dev.rulesTerms")}{" "}
          <Link href="/terms" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
            {t("legal.termsTitle")}
          </Link>
          . {t("dev.contact")}{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </Section>
    </PageContainer>
  );
}
