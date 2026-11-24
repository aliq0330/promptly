"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons/arrow-right";
import { ArrowUp } from "@/components/icons/arrow-up";
import { Check } from "@/components/icons/check";
import { Button } from "@/components/ui/button";
import { CodeBlock } from "@/components/ui/code-block";
import { OptionGroup } from "@/components/ui/option-group";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONNECT_METHODS, CONNECT_STEPS, clampStep, filledSegments, stepState, type ConnectCode, type ConnectMethod } from "@/lib/connect-guide";
import { cn } from "@/lib/utils";

/**
 * "Yapay zekâ aracına bağla" sihirbazı (docs/history/319-*; kullanıcı mockup B'yi seçti): önce yol (izin vererek / anahtarla), sonra her seferinde TEK adım —
 * ilerleme çubuğu, büyük başlık, kopyalanacak değer ve "ekranda şunu göreceksin" küçük resmi; altında tüm adımların listesi (dokununca o adıma gider).
 * Ayarlar → Geliştirici ve /developers → Hesabınla bağla AYNI bileşeni kullanır; yeni bir bağlama rehberi yazarken `lib/connect-guide.ts` adımlarına ekle.
 * Adres `developerEndpoints()`'ten gelir (uydurma adres yok). Anahtar bu bileşende ASLA görünmez: yalnızca `Bearer pmt_…` kalıbı yazılır.
 */
export function ConnectWizard({ mcpMeUrl, keysHref, headingLevel = "h4" }: { mcpMeUrl: string; keysHref: string; headingLevel?: "h3" | "h4" }) {
  const { t } = useTranslation();
  const [method, setMethod] = useState<ConnectMethod>("oauth");
  const [stepIndex, setStepIndex] = useState(0);
  const Heading = headingLevel;

  const steps = CONNECT_STEPS[method];
  const index = clampStep(stepIndex, steps.length);
  const step = steps[index];
  const last = index === steps.length - 1;

  function chooseMethod(next: ConnectMethod) {
    if (next === method) return;
    setMethod(next);
    setStepIndex(0);
  }

  const codeValue: Record<ConnectCode, { text: string; label: string }> = {
    address: { text: mcpMeUrl, label: t("guide.address") },
    headerName: { text: "Authorization", label: "Authorization" },
    headerValue: { text: "Bearer pmt_…", label: "Bearer pmt_" },
  };
  const code = step.code ? codeValue[step.code] : null;

  return (
    <div className="space-y-4" data-dev-connect="" data-guide-method={method}>
      <OptionGroup<ConnectMethod>
        ariaLabel={t("guide.pick")}
        value={method}
        onChange={chooseMethod}
        options={CONNECT_METHODS.map((id) => ({
          key: id,
          label: t(`guide.method.${id}.title` as "guide.method.oauth.title"),
          description: t(`guide.method.${id}.desc` as "guide.method.oauth.desc"),
          badge: id === "oauth" ? <span className="rounded-full bg-secondary-soft px-2 py-0.5 text-caption font-semibold text-secondary">{t("guide.method.oauth.badge")}</span> : undefined,
          attrs: { "data-guide-method-tile": id },
        }))}
      />

      <div className="space-y-4 rounded-lg card-flat p-4 shadow-card sm:p-5" data-guide-card="">
        <div className="flex gap-1.5" aria-hidden>
          {steps.map((item, i) => (
            <span key={item.id} className={cn("h-1.5 flex-1 rounded-full", i < filledSegments(index, steps.length) ? "bg-primary" : "bg-border")} />
          ))}
        </div>
        <p className="text-caption font-semibold text-primary" data-guide-step="">
          {t("guide.stepOf", { n: index + 1, total: steps.length })}
        </p>
        <Heading className="break-words font-display text-h3 text-text">{t(step.title)}</Heading>
        <p className="text-body leading-relaxed text-text-secondary">{t(step.body)}</p>
        {step.keysLink &&
          (keysHref.startsWith("#") ? (
            <a href={keysHref} className="inline-flex min-h-9 items-center text-small font-semibold text-primary hover:underline">
              {t("guide.keysLink")}
            </a>
          ) : (
            <Link href={keysHref} className="inline-flex min-h-9 items-center text-small font-semibold text-primary hover:underline">
              {t("guide.keysLink")}
            </Link>
          ))}
        {code && <CodeBlock text={code.text} label={code.label} />}
        {step.warn && <p className="text-small font-medium text-warning">{t(step.warn)}</p>}
        {step.sketch && <ConnectorSketch />}

        <div className="flex gap-3 pt-1">
          <Button type="button" variant="outline" size="lg" className="px-5" disabled={index === 0} onClick={() => setStepIndex(index - 1)}>
            {t("guide.back")}
          </Button>
          {last ? (
            <Button type="button" size="lg" className="flex-1" onClick={() => setStepIndex(0)}>
              {t("guide.restart")}
            </Button>
          ) : (
            <Button type="button" size="lg" className="flex-1" onClick={() => setStepIndex(index + 1)}>
              {t("guide.next")}
              <ArrowRight size={16} aria-hidden />
            </Button>
          )}
        </div>
        {last && (
          <p role="status" className="rounded-lg bg-success-soft px-4 py-3 text-small leading-relaxed text-text">
            {t(method === "oauth" ? "guide.oauth.done" : "guide.key.done")}
          </p>
        )}
      </div>

      <ol aria-label={t("guide.allSteps")} className="divide-y divide-border-soft rounded-lg card-flat px-4">
        {steps.map((item, i) => {
          const state = stepState(i, index);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => setStepIndex(i)}
                aria-current={state === "current" ? "step" : undefined}
                data-guide-overview={state}
                className="flex min-h-11 w-full items-center gap-3 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-semibold",
                    state === "done" && "bg-success text-success-foreground",
                    state === "current" && "bg-primary text-primary-foreground",
                    state === "todo" && "border-2 border-border-strong text-text-muted",
                  )}
                >
                  {state === "done" ? <Check size={16} /> : i + 1}
                </span>
                <span className={cn("min-w-0 flex-1 break-words text-small", state === "todo" ? "text-text-secondary" : "font-medium text-text")}>{t(item.title)}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <p className="rounded-lg bg-surface-soft px-4 py-2.5 text-caption leading-relaxed text-text-secondary">
        {t(method === "oauth" ? "dev.meOauthLimits" : "devSettings.secretNote")}
      </p>
    </div>
  );
}

/** Aracın "özel bağlayıcı ekle" formunun ÖRNEK resmi: yalnızca adres kutusu vurgulu, gelişmiş alanlar boş. Gerçek bir form değildir (kontrol yok). */
function ConnectorSketch() {
  const { t } = useTranslation();
  return (
    <div className="space-y-2" data-guide-sketch="">
      <p className="text-caption font-semibold text-text-muted">{t("guide.sketch.label")}</p>
      <div aria-hidden className="space-y-3 rounded-lg bg-surface-soft p-4">
        <p className="text-small font-semibold text-text-secondary">{t("guide.sketch.title")}</p>
        <div className="space-y-1">
          <p className="text-caption text-text-muted">{t("guide.sketch.name")}</p>
          <div className="flex h-8 items-center rounded-md card-flat px-2.5 text-caption text-text-muted">Promptly</div>
        </div>
        <div className="space-y-1">
          <p className="text-caption text-text-muted">{t("guide.sketch.url")}</p>
          <div className="flex h-8 items-center rounded-md border-2 border-primary bg-surface px-2.5 text-caption font-semibold text-primary ring-4 ring-primary/15">
            {t("guide.sketch.paste")}
          </div>
          <p className="flex items-center justify-end gap-1 text-caption font-semibold text-primary">
            <ArrowUp size={16} />
            {t("guide.sketch.onlyThis")}
          </p>
        </div>
        <div className="space-y-1 opacity-70">
          <p className="text-caption text-text-muted">{t("guide.sketch.advanced")}</p>
          <div className="flex h-8 items-center rounded-md bg-border-soft px-2.5 text-caption text-text-muted">{t("guide.sketch.empty")}</div>
        </div>
      </div>
    </div>
  );
}
