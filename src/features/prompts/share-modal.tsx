"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Send, Share2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import type { Language } from "@/lib/i18n/translations";
import { contentActionClassName } from "@/features/content/action-styles";
import { placeholderArt } from "@/lib/placeholder-image";
import { RESULT_MEDIA_TYPE_LABELS } from "@/lib/prompt-result-media";
import { generatorHref, promptHref, requestHref, resultHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { shareOrCopyLink } from "./share-button";
import type { Generator, Prompt, PromptRequest, PromptResult } from "@/types";

export type ShareModalTarget =
  | { contentType: "prompt"; prompt: Prompt }
  | { contentType: "generator"; generator: Generator }
  | { contentType: "request"; request: PromptRequest }
  | { contentType: "prompt_result"; result: PromptResult };

interface SharePreview {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string | null;
  badgeLabel: string;
  badgeVariant: "neutral" | "success" | "danger";
  href: string;
  /**
   * The query string a `/messages?...` deep link needs to attach this
   * content to the next message sent (Bölüm 9.8's existing pattern —
   * `shareGeneratorId` is new but purely client-side, never written to the
   * database). `null` when this content type has no message-sharing
   * support at all (a Kullanıcı Sonucu — `messages` has no `shared_result_
   * id` column and adding one is out of this feature's scope, CLAUDE.md
   * §24's "gereksiz yeni sistemler oluşturma") — the modal simply hides
   * that option in that case rather than pointing at something that
   * doesn't work.
   */
  messageParam: string | null;
}

function getSharePreview(target: ShareModalTarget, t: (key: TranslationKey) => string, language: Language): SharePreview {
  if (target.contentType === "prompt") {
    const prompt = target.prompt;
    return {
      id: prompt.id,
      title: prompt.title,
      description: prompt.description,
      thumbnailUrl: prompt.media[0]?.url ?? null,
      badgeLabel: t(CONTENT_TYPE_META[prompt.contentType].labelKey),
      badgeVariant: "neutral",
      href: promptHref(prompt),
      messageParam: `sharePromptId=${prompt.id}`,
    };
  }
  if (target.contentType === "generator") {
    const generator = target.generator;
    return {
      id: generator.id,
      title: generator.title,
      description: generator.description,
      thumbnailUrl: generator.coverUrl,
      badgeLabel: `${t("generator.singular")} · ${taxonomyPathLabel(generator, language, true)}`,
      badgeVariant: "neutral",
      href: generatorHref(generator),
      messageParam: `shareGeneratorId=${generator.id}`,
    };
  }
  if (target.contentType === "request") {
    const request = target.request;
    return {
      id: request.id,
      title: request.title,
      description: request.description,
      thumbnailUrl: request.referenceImage?.url ?? null,
      badgeLabel: t(STATUS_LABELS[request.status]),
      badgeVariant: STATUS_VARIANTS[request.status],
      href: requestHref(request),
      messageParam: `shareRequestId=${request.id}`,
    };
  }
  const result = target.result;
  const originTitle = result.originalPrompt?.title ?? result.originalGenerator?.title ?? "";
  return {
    id: result.id,
    title: originTitle ? `${result.creator.displayName} — ${originTitle}` : result.creator.displayName,
    description: result.mediaType === "text" || result.mediaType === "other" ? result.textContent ?? "" : "",
    thumbnailUrl: result.thumbnailUrl,
    badgeLabel: t(RESULT_MEDIA_TYPE_LABELS[result.mediaType]),
    badgeVariant: "neutral",
    href: resultHref(result),
    messageParam: null,
  };
}

/**
 * The one "Paylaş" surface for a prompt, a generator, or a prompt request
 * (CLAUDE.md Bölüm 9.52 — Unified Share System). Replaces the old direct
 * "tap the share icon → native share sheet opens immediately" behavior:
 * now the icon opens this modal first, and the two big option cards decide
 * what actually happens — neither of which is a new system:
 *
 * - "Promptly'de mesaj olarak gönder" navigates to the EXACT same
 *   `/messages?sharePromptId=`/`shareRequestId=` flow `PostMenu`'s old
 *   "Mesajla gönder" menu item used to open (that menu item is gone —
 *   this is its one, unified replacement). A generator has no rich embed
 *   column in `messages` (only prompts/requests do, Bölüm 9.8) and this
 *   task's own rule is "no new messaging table/column/architecture", so a
 *   shared generator rides the exact same conversation-picker screen via a
 *   client-only `shareGeneratorId` query param that `LocalConversationView`
 *   resolves into a plain-text body (title + real link) at send time —
 *   still the same, unmodified `sendMessage()` call every other message in
 *   this app already goes through, just pre-composed differently.
 * - "Diğer uygulamalarla paylaş" calls `shareOrCopyLink` — the exact
 *   native-share/clipboard function `ShareButton` always used, extracted
 *   rather than rewritten.
 *
 * Modeled on `SaveToCollectionModal`'s shell (Modal wrapper, header + close
 * X, `rounded-lg border bg-surface p-5 shadow-lg` panel) rather than the
 * reference mockup's own colors — this project's own design tokens
 * (CLAUDE.md Bölüm 4/9.50), not a copy-paste of someone else's palette.
 */
export function ShareModal({ target, onClose }: { target: ShareModalTarget; onClose: () => void }) {
  const { user } = useAuth();
  const { t, language } = useTranslation();
  const [copied, setCopied] = useState(false);
  const preview = getSharePreview(target, t, language);

  async function handleNativeShare() {
    const result = await shareOrCopyLink(preview.href, preview.title);
    if (result === "copied") {
      setCopied(true);
      setTimeout(onClose, 1200);
    } else {
      onClose();
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="share-modal-title">
      <div
        className="w-full max-w-md rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <h2 id="share-modal-title" className="text-base font-semibold text-text">
            {t("common.share")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="rounded-md p-1 text-text-muted hover:bg-accent-surface hover:text-text"
          >
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 flex items-center gap-3 rounded-md border border-border-soft bg-surface-soft p-3">
          <span
            className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
            style={{ backgroundImage: `url("${preview.thumbnailUrl ?? placeholderArt(preview.id, 96, 96)}")` }}
          />
          <span className="min-w-0 flex-1 space-y-0.5">
            <Badge variant={preview.badgeVariant}>{preview.badgeLabel}</Badge>
            <span className="block truncate text-sm font-semibold text-text">{preview.title}</span>
            {preview.description && (
              <span className="line-clamp-1 block text-xs text-text-muted">{preview.description}</span>
            )}
          </span>
        </div>

        <div className="mt-4 space-y-2">
          {user && preview.messageParam && (
            <Link
              href={`/messages?${preview.messageParam}`}
              onClick={onClose}
              className="flex items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent-surface/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <Send size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">{t("share.sendAsMessage")}</span>
                <span className="block text-xs text-text-muted">{t("share.sendAsMessageHint")}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted" />
            </Link>
          )}
          <button
            type="button"
            onClick={handleNativeShare}
            className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent-surface/50"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface text-text">
              <Share2 size={18} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold text-text">
                {copied ? t("common.linkCopied") : t("share.shareElsewhere")}
              </span>
              <span className="block text-xs text-text-muted">{t("share.shareElsewhereHint")}</span>
            </span>
            <ChevronRight size={16} className="shrink-0 text-text-muted" />
          </button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * The physical "Paylaş" icon button — same icon/size/touch-target every
 * card/detail page already used for `ShareButton` — except its click opens
 * `ShareModal` instead of triggering native share directly.
 */
export function ShareTriggerButton({
  target,
  label,
  className,
}: {
  target: ShareModalTarget;
  /** Optional visible text next to the icon (matches ShareButton's own `label` prop, used on detail-page hero rows). */
  label?: string;
  className?: string;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
        aria-label={t("common.share")}
        title={t("common.share")}
        className={contentActionClassName(false, className)}
      >
        <Share2 size={16} strokeWidth={1.75} />
        {label && <span>{label}</span>}
      </button>
      {open && <ShareModal target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
