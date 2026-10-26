"use client";

import { useState } from "react";
import Link from "next/link";
import { Bookmark, ChevronRight, CircleFadingPlus, Send, Shapes, Share2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { STATUS_LABELS, STATUS_VARIANTS } from "@/features/requests/request-card";
import { taxonomyPathLabel } from "@/lib/content-taxonomy";
import type { Language } from "@/lib/i18n/translations";
import { contentActionClassName } from "@/features/content/action-styles";
import { placeholderArt } from "@/lib/placeholder-image";
import { RESULT_MEDIA_TYPE_LABELS } from "@/lib/prompt-result-media";
import { presetHref, promptHref, requestHref, resultHref, workflowHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { CONTENT_TYPE_META } from "./content-type-meta";
import { shareOrCopyLink } from "./share-button";
import type { Preset, Prompt, PromptRequest, PromptResult, StoryLinkedType, Workflow } from "@/types";
import { StorageBackground } from "@/components/ui/storage-media";
import { QuoteSection } from "@/features/quotes/quote-section";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";
import { AddToSpaceModal, type AddToSpaceTarget } from "@/features/spaces/add-to-space-modal";
import { SpaceShareSettings } from "@/features/spaces/space-modals";
import { SPACE_KIND_LABEL, spaceHref } from "@/lib/spaces";
import type { Space } from "@/lib/supabase/spaces";
import type { CommunityPostType } from "@/lib/supabase/communities";
import { summarizeContent } from "@/features/communities/content-summary";
import { quoteHref } from "@/lib/quotes";
import type { Quote } from "@/lib/supabase/quotes";

export type ShareModalTarget =
  | { contentType: "prompt"; prompt: Prompt }
  | { contentType: "request"; request: PromptRequest }
  | { contentType: "workflow"; workflow: Workflow }
  | { contentType: "preset"; preset: Preset }
  | { contentType: "prompt_result"; result: PromptResult }
  /** Bir topluluk gönderisi (başvuru): önizleme çağıran tarafından hazırlanır; bağlantı gönderinin kendi sayfasıdır. */
  | { contentType: "community_post"; postId: string; title: string; description: string; thumbnailUrl: string | null; badgeLabel: string; href: string }
  /**
   * Bir Space (docs/history/215-*). Sahibi aynı pencerede "Kim görsün?" + "Akışta gönderi olarak paylaş" ayarlarını da görür
   * (`SpaceShareSettings`); `art` önizleme kolajının ilk görseli için, `onChanged` sayfanın Space durumunu güncel tutar.
   */
  | { contentType: "space"; space: Space; art?: string[]; onChanged?: (space: Space) => void }
  /** Bir içeriğin ALINTISI (docs/history/217-*): bağlantı alıntının kendi sayfasıdır. */
  | { contentType: "quote"; quote: Quote };

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
  /**
   * `true` = bağlantı olduğu gibi paylaşılır (herkese açık içeriğin statik paylaşım sayfasına çevrilmez). Topluluğa özgü içerik ve
   * topluluk gönderisi özel saklanır: paylaşım sayfası yoktur ve bağlantıyı yalnız topluluğu okuyabilenler açabilir.
   */
  directLink: boolean;
  /**
   * Hikâyede paylaş (docs/history/198-*): yalnız yayında + herkese açık + topluluğa ait olmayan içerik (sunucu yeniden denetler);
   * değer `/stories/create?link=` biçimidir. `null` = bu içerik hikâyeye bağlanamaz.
   */
  storyLink: string | null;
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
      directLink: !!prompt.communityId,
      storyLink: storyLinkFor("prompt", prompt.id, prompt.status === "published" && prompt.visibility === "public" && !prompt.communityId),
    };
  }
  if (target.contentType === "workflow") {
    const workflow = target.workflow;
    return {
      id: workflow.id,
      title: workflow.title,
      description: workflow.description,
      thumbnailUrl: workflow.coverUrl,
      badgeLabel: t("workflow.singular"),
      badgeVariant: "neutral",
      href: workflowHref(workflow),
      messageParam: `shareWorkflowId=${workflow.id}`,
      directLink: !!workflow.communityId,
      storyLink: storyLinkFor("workflow", workflow.id, workflow.status === "published" && workflow.visibility === "public" && !workflow.communityId),
    };
  }
  if (target.contentType === "preset") {
    const preset = target.preset;
    return {
      id: preset.id,
      title: preset.title,
      description: preset.description,
      thumbnailUrl: preset.coverUrl,
      badgeLabel: `${t("preset.singular")} · ${taxonomyPathLabel(preset, language, true)}`,
      badgeVariant: "neutral",
      href: presetHref(preset),
      messageParam: `sharePresetId=${preset.id}`,
      directLink: !!preset.communityId,
      storyLink: storyLinkFor("preset", preset.id, preset.status === "published" && preset.visibility === "public" && !preset.communityId),
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
      directLink: !!request.communityId,
      storyLink: storyLinkFor("request", request.id, !request.isDraft && (request.visibility ?? "public") === "public" && !request.communityId),
    };
  }
  if (target.contentType === "space") {
    const space = target.space;
    return {
      id: space.id,
      title: space.title,
      description: space.description,
      thumbnailUrl: space.coverUrl ?? target.art?.[0] ?? null,
      badgeLabel: `Space · ${t(SPACE_KIND_LABEL[space.kind])}`,
      badgeVariant: "neutral",
      href: spaceHref(space.id),
      messageParam: null,
      // Space'in statik paylaşım sayfası yok; bağlantı Space'in kendi adresidir.
      directLink: true,
      storyLink: null,
    };
  }
  if (target.contentType === "quote") {
    const quote = target.quote;
    const summary = quote.content ? summarizeContent(quote.content) : null;
    return {
      id: quote.id,
      title: summary?.title ?? t("quotes.badge"),
      description: quote.note ?? summary?.description ?? "",
      thumbnailUrl: summary?.media[0]?.url ?? null,
      badgeLabel: summary ? `${t("quotes.badge")} · ${t(summary.typeLabelKey)}` : t("quotes.badge"),
      badgeVariant: "neutral",
      href: quoteHref(quote.id),
      messageParam: null,
      directLink: true,
      storyLink: null,
    };
  }
  if (target.contentType === "community_post") {
    return {
      id: target.postId,
      title: target.title,
      description: target.description,
      thumbnailUrl: target.thumbnailUrl,
      badgeLabel: target.badgeLabel,
      badgeVariant: "neutral",
      href: target.href,
      messageParam: `sharePostId=${target.postId}`,
      directLink: true,
      storyLink: null,
    };
  }
  const result = target.result;
  const originTitle = result.originalPrompt?.title ?? "";
  return {
    id: result.id,
    title: originTitle ? `${result.creator.displayName} — ${originTitle}` : result.creator.displayName,
    description: result.mediaType === "text" || result.mediaType === "other" ? result.textContent ?? "" : "",
    thumbnailUrl: result.thumbnailUrl,
    badgeLabel: t(RESULT_MEDIA_TYPE_LABELS[result.mediaType]),
    badgeVariant: "neutral",
    href: resultHref(result),
    messageParam: null,
    directLink: false,
    storyLink: null,
  };
}

/**
 * "Alıntıla" hedefi (akışta + topluluklarda; eskiden "Topluluklarda duyur"): yalnız topluluğa ait OLMAYAN içerik; herkese açık + yayında değilse satır nedeniyle kapalı durur
 * (topluluk paylaşımı hiçbir içeriği otomatik açmaz). Sonuç ve topluluk gönderisi duyurulamaz.
 */
function announceTarget(target: ShareModalTarget, space: Space | null): { type: CommunityPostType; id: string; blockedKey: TranslationKey | null } | null {
  if (target.contentType === "prompt") {
    const x = target.prompt;
    if (x.communityId) return null;
    return { type: "prompt", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "request") {
    const x = target.request;
    if (x.communityId) return null;
    return { type: "request", id: x.id, blockedKey: !x.isDraft && (x.visibility ?? "public") === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "workflow") {
    const x = target.workflow;
    if (x.communityId) return null;
    return { type: "workflow", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "preset") {
    const x = target.preset;
    if (x.communityId) return null;
    return { type: "preset", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "space" && space) {
    return { type: "space", id: space.id, blockedKey: space.visibility === "public" && !space.archivedAt ? null : "share.announce.spaceNotPublic" };
  }
  return null;
}

/** "Kendin için" hedefleri: Space'e ekle (topluluğa ait içerik eklenemez) ve koleksiyona kaydet (istek kaydedilemez). */
function selfTargets(target: ShareModalTarget): { space: AddToSpaceTarget | null; save: { promptId?: string; workflowId?: string; presetId?: string } | null } {
  if (target.contentType === "prompt") {
    const x = target.prompt;
    return { space: x.communityId ? null : { type: "prompt", id: x.id }, save: { promptId: x.id } };
  }
  if (target.contentType === "request") {
    const x = target.request;
    return { space: x.communityId ? null : { type: "request", id: x.id }, save: null };
  }
  if (target.contentType === "workflow") {
    const x = target.workflow;
    return { space: x.communityId ? null : { type: "workflow", id: x.id }, save: { workflowId: x.id } };
  }
  if (target.contentType === "preset") {
    const x = target.preset;
    return { space: x.communityId ? null : { type: "preset", id: x.id }, save: { presetId: x.id } };
  }
  return { space: null, save: null };
}

function storyLinkFor(type: StoryLinkedType, id: string, eligible: boolean): string | null {
  return eligible ? `/stories/create?link=${type}:${id}` : null;
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
  // Space: sahibin aynı pencerede yaptığı görünürlük / akış değişiklikleri duyuru uygunluğunu anında değiştirir.
  const [space, setSpace] = useState<Space | null>(target.contentType === "space" ? target.space : null);
  const [self, setSelf] = useState<"space" | "save" | null>(null);
  const preview = getSharePreview(target.contentType === "space" && space ? { ...target, space } : target, t, language);
  const announce = user ? announceTarget(target, space) : null;
  const selfOptions = user ? selfTargets(target) : { space: null, save: null };
  const ownsSpace = target.contentType === "space" && space !== null && user?.id === space.ownerId && !space.archivedAt;

  // "Kendin için" bir pencere açar; Paylaş penceresinin yerini alır (üst üste iki pencere olmaz).
  if (self === "space" && selfOptions.space) return <AddToSpaceModal target={selfOptions.space} onClose={onClose} />;
  if (self === "save" && selfOptions.save) return <SaveToCollectionModal {...selfOptions.save} onClose={onClose} />;

  async function handleNativeShare() {
    const result = await shareOrCopyLink(preview.href, preview.title, { direct: preview.directLink });
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
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg"
        onClick={(event) => event.stopPropagation()}
        data-share-modal={target.contentType}
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
          <StorageBackground
            as="span"
            url={preview.thumbnailUrl}
            fallback={placeholderArt(preview.id, 96, 96)}
            className="h-12 w-12 shrink-0 rounded-md bg-cover bg-center"
          />
          <span className="min-w-0 flex-1 space-y-0.5">
            <Badge variant={preview.badgeVariant}>{preview.badgeLabel}</Badge>
            <span className="block truncate text-sm font-semibold text-text">{preview.title}</span>
            {preview.description && (
              <span className="line-clamp-1 block text-xs text-text-muted">{preview.description}</span>
            )}
          </span>
        </div>

        {ownsSpace && space && (
          <section className="mt-4 space-y-2" aria-label={t("share.spaceSettings")}>
            <h3 className="text-label font-semibold text-text">{t("share.spaceSettings")}</h3>
            <SpaceShareSettings
              space={space}
              onChanged={(next) => {
                setSpace(next);
                if (target.contentType === "space") target.onChanged?.(next);
              }}
            />
          </section>
        )}

        <div className="mt-4 space-y-2">
          {announce && <QuoteSection type={announce.type} contentId={announce.id} blockedReason={announce.blockedKey ? t(announce.blockedKey) : null} hideFeed={ownsSpace} />}
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
          {user && preview.storyLink && (
            <Link
              href={preview.storyLink}
              onClick={onClose}
              data-share-to-story
              className="flex items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent-surface/50"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary">
                <CircleFadingPlus size={18} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-text">{t("share.toStory")}</span>
                <span className="block text-xs text-text-muted">{t("share.toStoryHint")}</span>
              </span>
              <ChevronRight size={16} className="shrink-0 text-text-muted" />
            </Link>
          )}
          <button
            type="button"
            onClick={handleNativeShare}
            data-share-link=""
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

        {(selfOptions.space || selfOptions.save) && (
          <div className="mt-4 space-y-2">
            <p className="px-1 text-label font-semibold uppercase tracking-[0.08em] text-text-muted">{t("share.forYourself")}</p>
            {selfOptions.space && (
              <button type="button" onClick={() => setSelf("space")} data-share-add-to-space className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent-surface/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface text-text">
                  <Shapes size={18} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-text">{t("share.addToSpace")}</span>
                <ChevronRight size={16} className="shrink-0 text-text-muted" />
              </button>
            )}
            {selfOptions.save && (
              <button type="button" onClick={() => setSelf("save")} data-share-save className="flex w-full items-center gap-3 rounded-md border border-border p-3 text-left transition-colors hover:bg-accent-surface/50">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-surface text-text">
                  <Bookmark size={18} />
                </span>
                <span className="min-w-0 flex-1 text-sm font-semibold text-text">{t("share.saveToCollection")}</span>
                <ChevronRight size={16} className="shrink-0 text-text-muted" />
              </button>
            )}
          </div>
        )}
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
  size = 16,
  className,
}: {
  target: ShareModalTarget;
  /** Optional visible text next to the icon (matches ShareButton's own `label` prop, used on detail-page hero rows). */
  label?: string;
  /** Icon size (Odak's action rail uses a larger one, like its Like/Comment/Save). */
  size?: number;
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
        <Share2 size={size} strokeWidth={1.75} />
        {label && <span className="hidden sm:inline">{label}</span>}
      </button>
      {open && <ShareModal target={target} onClose={() => setOpen(false)} />}
    </>
  );
}
