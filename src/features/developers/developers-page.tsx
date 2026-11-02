"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CodeBlock } from "@/components/ui/code-block";
import { PageContainer } from "@/components/ui/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { ConnectWizard } from "@/features/developers/connect-wizard";
import { SectionPager, scrollToSection, type PagerSection } from "@/features/developers/section-pager";
import { LEGAL_CONTACT_EMAIL } from "@/features/legal/legal-content";
import { useTranslation } from "@/lib/i18n/language-provider";
import { developerEndpoints, developerSnippets } from "@/lib/developers";
import { PUBLIC_API_RATE_LIMIT } from "@/lib/public-api/rate-limit";

/** Sayfadaki bir bölüm: "BÖLÜM 3 / 6" üst yazısı + büyük başlık. `id` sabit bölüm şeridinin (SectionPager) kaydırma hedefidir. */
function Section({ id, n, total, title, children }: { id: string; n: number; total: number; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <section id={id} data-dev-section={id} aria-labelledby={`${id}-title`} className="scroll-mt-24 space-y-4">
      <div className="space-y-1">
        <p className="text-caption font-bold uppercase tracking-wider text-primary">{t("devSec.eyebrow", { n, total })}</p>
        <h2 id={`${id}-title`} className="text-h2 text-text">
          {title}
        </h2>
      </div>
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

/** "Başlangıç" bölümündeki yol kartı: dokununca ilgili bölüme kaydırır. */
function StartCard({ target, title, desc }: { target: string; title: string; desc: string }) {
  return (
    <button
      type="button"
      onClick={() => scrollToSection(target)}
      data-dev-start={target}
      className="group flex w-full items-center gap-3 rounded-xl border border-border-soft bg-surface p-4 text-left shadow-card transition-colors duration-200 ease-soft hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-body font-semibold text-text">{title}</span>
        <span className="block text-small leading-relaxed text-text-secondary">{desc}</span>
      </span>
      <ArrowRight size={18} className="shrink-0 text-text-muted transition-transform duration-200 ease-soft group-hover:translate-x-0.5" aria-hidden />
    </button>
  );
}

/**
 * Herkese açık "Geliştiriciler" sayfası (docs/history/301-*, 319-*): altı bölüm — Başlangıç · Claude'a bağla · Hesabınla bağla · HTTP API · Kod editörleri · Bilmen
 * gerekenler. Üstte içindekiler yok; ekranın sağ altındaki sabit önceki/sonraki şeridi (`SectionPager`) bölümler arasında gezdirir. "Hesabınla bağla" Ayarlar →
 * Geliştirici ile AYNI sihirbazı kullanır (`ConnectWizard`). Adresler `NEXT_PUBLIC_SUPABASE_URL`'den türetilir (`lib/developers.ts`); oturum gerekmez.
 */
export function DevelopersPage() {
  const { t } = useTranslation();
  usePageTitle(t("dev.title"));
  const endpoints = developerEndpoints(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const snippets = endpoints ? developerSnippets(endpoints) : null;
  const hasLinks = Boolean(endpoints && snippets);

  const sections: PagerSection[] = [
    { id: "dev-start", label: t("devSec.start") },
    { id: "dev-mcp", label: t("devSec.mcp") },
    ...(hasLinks ? [{ id: "dev-account", label: t("devSec.account") }] : []),
    { id: "dev-api", label: t("devSec.api") },
    ...(hasLinks ? [{ id: "dev-editors", label: t("devSec.editors") }] : []),
    { id: "dev-rules", label: t("devSec.rules") },
  ];
  const total = sections.length;
  const num = (id: string) => sections.findIndex((section) => section.id === id) + 1;

  return (
    <PageContainer className="mx-auto max-w-3xl space-y-12 pb-28">
      <header className="space-y-3">
        <h1 className="font-display text-h1 text-text">{t("dev.title")}</h1>
        <p className="text-body leading-relaxed text-text-secondary">{t("dev.intro")}</p>
      </header>

      <Section id="dev-start" n={num("dev-start")} total={total} title={t("devStart.title")}>
        <div className="space-y-2.5">
          <StartCard target="dev-mcp" title={t("devStart.read.title")} desc={t("devStart.read.desc")} />
          {hasLinks && <StartCard target="dev-account" title={t("devStart.account.title")} desc={t("devStart.account.desc")} />}
          <StartCard target="dev-api" title={t("devStart.code.title")} desc={t("devStart.code.desc")} />
        </div>
      </Section>

      <Section id="dev-mcp" n={num("dev-mcp")} total={total} title={t("dev.mcpTitle")}>
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
            <Step title={t("dev.stepChatgptTitle")} body={t("dev.stepChatgptBody")} />
            <Step title={t("dev.stepLocalTitle")} body={t("dev.stepLocalBody")}>
              <CodeBlock text={snippets.localNpx} label={t("dev.stepLocalTitle")} />
            </Step>
            <Step title={t("dev.stepDesktopTitle")} body={t("dev.stepDesktopBody")}>
              <CodeBlock text={snippets.claudeDesktopJson} label={t("dev.stepDesktopTitle")} />
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

      {endpoints && snippets && (
        <Section id="dev-account" n={num("dev-account")} total={total} title={t("devAccount.title")}>
          <p className="text-body leading-relaxed text-text-secondary">{t("devAccount.lead")}</p>
          <ConnectWizard mcpMeUrl={endpoints.mcpMeUrl} keysHref="/settings/developer" headingLevel="h3" />

          <div className="space-y-6 border-t border-border-soft pt-6" data-dev-me="">
            <div className="space-y-2">
              <h3 className="text-h3 text-text">{t("devAccount.codeTitle")}</h3>
              <p className="text-body leading-relaxed text-text-secondary">{t("dev.meLead")}</p>
              <p>
                <Link href="/settings/developer" className="font-medium text-primary underline underline-offset-2 hover:no-underline">
                  {t("dev.meKeyLink")}
                </Link>
              </p>
            </div>
            <Step title={t("dev.meWho")}>
              <CodeBlock text={snippets.curlMe} label={t("dev.meWho")} />
            </Step>
            <Step title={t("dev.meList")}>
              <CodeBlock text={snippets.curlMeList} label={t("dev.meList")} />
            </Step>
            <Step title={t("dev.meListOther")}>
              <CodeBlock text={snippets.curlMeListOther} label={t("dev.meListOther")} />
            </Step>
            <Step title={t("dev.meSave")} body={t("dev.meSaveBody")}>
              <CodeBlock text={snippets.curlMeSave} label={t("dev.meSave")} />
            </Step>
            <Step title={t("dev.meUpdate")} body={t("dev.meUpdateBody")}>
              <CodeBlock text={snippets.curlMeUpdate} label={t("dev.meUpdate")} />
            </Step>
            <Step title={t("dev.meMcp")} body={t("dev.meMcpBody")}>
              <CodeBlock text={endpoints.mcpMeUrl} label={t("dev.meMcpAddress")} />
              <CodeBlock text={snippets.claudeCodeMe} label="Claude Code (key)" />
              <p className="text-small text-text-muted">{t("dev.meMcpCursor")}</p>
              <CodeBlock text={snippets.cursorMeJson} label={t("dev.meMcpCursor")} />
              <p className="text-body leading-relaxed text-text-secondary">{t("dev.meMcpNoHeader")}</p>
            </Step>
            <h3 className="text-h3 text-text">{t("dev.meRules")}</h3>
            <ul className="list-disc space-y-2 pl-5 text-body leading-relaxed text-text-secondary marker:text-text-muted">
              <li>{t("dev.meRuleSecret")}</li>
              <li>{t("dev.meRuleScope")}</li>
              <li>{t("dev.meRuleLimits")}</li>
              <li>{t("dev.meRulePrivate")}</li>
            </ul>
          </div>
        </Section>
      )}

      <Section id="dev-api" n={num("dev-api")} total={total} title={t("dev.apiTitle")}>
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
            <Step title="Python">
              <CodeBlock text={snippets.pythonRequests} label="Python" />
            </Step>
            <Step title={t("dev.apiNoCodeTitle")} body={t("dev.apiNoCodeBody")} />
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

      {endpoints && snippets && (
        <Section id="dev-editors" n={num("dev-editors")} total={total} title={t("dev.clientsTitle")}>
          <p className="text-body leading-relaxed text-text-secondary">{t("dev.clientsNote")}</p>
          <div className="space-y-6" data-dev-clients="">
            <Step title="Cursor" body={t("dev.stepCursorBody")}>
              <CodeBlock text={snippets.cursorJson} label="Cursor" />
            </Step>
            <Step title="VS Code" body={t("dev.stepVscodeBody")}>
              <CodeBlock text={snippets.vscodeJson} label="VS Code" />
            </Step>
            <Step title="Windsurf" body={t("dev.stepWindsurfBody")}>
              <CodeBlock text={snippets.windsurfJson} label="Windsurf" />
            </Step>
            <Step title="Gemini CLI" body={t("dev.stepGeminiBody")}>
              <CodeBlock text={snippets.geminiCli} label="Gemini CLI" />
            </Step>
            <Step title="Codex CLI" body={t("dev.stepCodexBody")}>
              <CodeBlock text={snippets.codexToml} label="Codex CLI" />
            </Step>
          </div>
        </Section>
      )}

      <Section id="dev-rules" n={num("dev-rules")} total={total} title={t("dev.rulesTitle")}>
        <ul className="list-disc space-y-2 pl-5 text-body leading-relaxed text-text-secondary marker:text-text-muted">
          <li>{t("dev.ruleReadOnly")}</li>
          <li>{t("dev.rulePublicOnly")}</li>
          <li>{t("dev.ruleCredit")}</li>
          <li>{t("dev.ruleUntrusted")}</li>
          <li>{t("dev.ruleFairUse", { limit: PUBLIC_API_RATE_LIMIT.limit })}</li>
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

      <SectionPager sections={sections} />
    </PageContainer>
  );
}
