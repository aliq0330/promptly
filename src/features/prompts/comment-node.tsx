"use client";

import { ExitMotion } from "@/components/ui/exit-motion";
import { CommentReactions } from "@/features/reactions/comment-reactions";
import Link from "next/link";
import { ChevronDown } from "@/components/icons/chevron-down";
import { ChevronUp } from "@/components/icons/chevron-up";
import { Pin } from "@/components/icons/pin";
import { Reply } from "@/components/icons/reply";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn, formatRelativeTime, profileHref } from "@/lib/utils";
import { ReportButton } from "@/features/moderation/report-button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import type { PromptComment } from "@/types";
import { MentionText } from "@/features/mentions/mention-text";
import { MentionTextarea } from "@/features/mentions/mention-field";
import { StarRatingDisplay, StarRatingInput } from "@/components/ui/star-rating";
import { CompactContentCard, type AttachmentState } from "@/features/content/compact-content-card";
import { CommentExtrasPreview, CommentExtrasToolbar, CommentMediaView, type CommentExtrasController } from "./comment-extras";
import type { CommentAttachment } from "@/types";
import { WorksBadge } from "./works-badges";
import { CommentMenu } from "./comment-menu";
import { CommentComposeSheet } from "./comment-compose-sheet";
import type { CommentFollowController } from "./use-comment-follow";

const isDeletedComment = (comment: PromptComment) => Boolean(comment.deletedAt);

/**
 * Yanıtlar bu seviyeye kadar girintili ve kancalıdır (üst yorum → yanıt → yanıtın yanıtı); daha derin yanıtlar girinti kazanmaz (telefonda da okunur
 * kalsın) — "@kime yanıt verdiği" ipucu ilişkiyi gösterir (docs/history/452-*).
 */
const MAX_INDENT_DEPTH = 2;

export interface CommentTree {
  childrenByParent: Map<string, PromptComment[]>;
  commentsById: Map<string, PromptComment>;
  expandedIds: Set<string>;
  onToggleExpand: (id: string) => void;
  replyingTo: string | null;
  onStartReply: (id: string) => void;
  onCancelReply: () => void;
  replyDraft: string;
  onReplyDraftChange: (value: string) => void;
  onSubmitReply: (parentId: string) => void;
  isPosting: boolean;
  postError: string | null;
  canInteract: boolean;
  currentUserId: string | null;
  editingId: string | null;
  onStartEdit: (comment: PromptComment) => void;
  onCancelEdit: () => void;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onSubmitEdit: (id: string) => void;
  isSavingEdit: boolean;
  editError: string | null;
  deleteConfirmId: string | null;
  onRequestDelete: (id: string) => void;
  onCancelDeleteConfirm: () => void;
  isDeletingId: string | null;
  /** Silinen yorum çıkış animasyonundayken true (docs/history/335-*): kayıp solar, yüksekliği kapanır, sonra listeden çıkar. */
  isLeavingId: (id: string) => boolean;
  registerNodeRef: (id: string, el: HTMLDivElement | null) => void;
  /** The comment/reply currently flashed after a notification jump (Aşama 5) — null once the flash has faded or nothing was jumped to. */
  highlightedId: string | null;
  /**
   * `thread` (default): the detail pages' inline thread (reply form under the comment). `sheet`: Odak's comment sheet
   * (docs/history/200-*) — Instagram-like rows, the heart on the right, replies written in the sheet's one composer.
   */
  layout?: "thread" | "sheet";
  /** Space yorumlarında kendi puanını yıldızlardan değiştirmek (docs/history/242-*); yoksa yıldızlar yalnız gösterilir. */
  onRate?: (id: string, rating: number) => void;
  /** Yanıt kutusunun ekleri (fotoğraf · GIF · içerik, docs/history/308-*). */
  replyExtras: CommentExtrasController;
  /** Düzenlenen yorumun ekleri: mevcut görsel/ek ile açılır; değiştirilebilir ya da kaldırılabilir. */
  editExtras: CommentExtrasController;
  /** Yorumdaki içerik ekinin önizleme kartı durumu (toplu okunur, yorum başına istek yok). */
  attachmentStateFor: (attachment: CommentAttachment) => AttachmentState;
  /**
   * Prompt yorumlarında yazarın O PROMPTTAKİ "Çalıştı mı?" oyu (docs/history/341-*): `true` = çalıştı, `false` = çalışmadı, `undefined` = oy yok / bilinmiyor
   * (rozet çıkmaz). Salt okunur yansımadır; yorumun içine yazılmaz.
   */
  worksVoteOf?: (authorId: string) => boolean | undefined;
  /** İçeriğin sahibi (docs/history/385-*): yorumlarında "Yazar" rozeti çıkar. */
  contentOwnerId?: string | null;
  /** Yalnız içerik sahibinde: üst düzey yorumu sabitler / sabitlemeyi kaldırır. */
  onTogglePin?: (id: string) => void;
  /**
   * Yorumun ⋮ menüsü, düzenleme geçmişi ve yorum takibi (docs/history/452-*). Yalnız detay sayfasındaki yorum bölümü verir; Odak'ın yorum
   * sayfası vermez ve satır içi işlemler eskisi gibi kalır.
   */
  menu?: {
    follow: CommentFollowController;
    notify: (message: string) => void;
    openHistory: (comment: PromptComment) => void;
  };
}

/**
 * A single comment or reply, recursively rendering its own children —
 * this is the whole "unlimited depth" nested-reply tree: any node
 * (top-level comment or a reply at any depth) can itself be replied to,
 * liked, edited, deleted, and independently collapsed/expanded, because
 * every node here is rendered by the exact same component regardless of
 * depth.
 */
export function CommentNode({
  comment,
  depth,
  tree,
}: {
  comment: PromptComment;
  depth: number;
  tree: CommentTree;
}) {
  const node = tree.layout === "sheet" ? <SheetCommentNode comment={comment} depth={depth} tree={tree} /> : <ThreadCommentNode comment={comment} depth={depth} tree={tree} />;
  return <ExitMotion leaving={tree.isLeavingId(comment.id)}>{node}</ExitMotion>;
}

/** İçeriğin sahibinin yorumlarında küçük "Yazar" rozeti (docs/history/385-*). */
function AuthorBadge({ className }: { className?: string }) {
  const { t } = useTranslation();
  return <span className={cn("inline-flex items-center rounded-full bg-primary-soft px-2 py-0.5 text-caption font-semibold text-primary", className)}>{t("comments.authorBadge")}</span>;
}

/** Sabitlenmiş yorumun etiketi: yalnız raptiye ve yazı (dolgu yok); yorum her sıralamada listenin başında durur. */
function PinnedLabel({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span data-comment-pinned className={cn("inline-flex items-center gap-1 text-caption font-semibold text-text-secondary", className)}>
      <Pin size={12} aria-hidden />
      {t("comments.pinnedLabel")}
    </span>
  );
}

/** Space yorumunun puanı: başkasınınki yalnız yıldız, kendininki dokunarak değişir (docs/history/242-*). Puan yorumla birlikte, yorumun üstünde görünür. */
function CommentRating({ comment, tree, isOwn }: { comment: PromptComment; tree: CommentTree; isOwn: boolean }) {
  const rating = comment.rating ?? 0;
  return (
    <div className="mb-0.5 flex items-center gap-1.5" data-comment-rating={rating}>
      {isOwn && tree.onRate ? (
        <StarRatingInput value={rating} size={16} allowClear={false} onChange={(value) => value > 0 && tree.onRate?.(comment.id, value)} />
      ) : (
        <StarRatingDisplay value={rating} size={16} />
      )}
      <span className="text-caption font-semibold tabular-nums text-text-secondary">{rating}/5</span>
    </div>
  );
}

/** Yorumun kayıtlı görseli (fotoğraf/GIF) ve küçük içerik kartı; silinmiş yorumda ya da ek yoksa hiçbir şey çizmez. */
function CommentAttachments({ comment, tree }: { comment: PromptComment; tree: CommentTree }) {
  if (comment.deletedAt || (!comment.media && !comment.attachment)) return null;
  return (
    <div className="mt-1.5 space-y-2" data-comment-attachments>
      {comment.media && <CommentMediaView media={comment.media} />}
      {comment.attachment && <CompactContentCard attachment={comment.attachment} state={tree.attachmentStateFor(comment.attachment)} />}
    </div>
  );
}

/** Yorum kutusu: ince, arka plana yakın kenarlık, dolgu yok (panel yok). */
const BUBBLE_CLASS = "rounded-lg border border-border-soft px-4 py-3";
const FIELD_CLASS =
  "w-full resize-none rounded-lg card-flat px-3 py-2 text-body text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/15 shadow-xs transition-colors duration-200 ease-soft hover:border-border-strong focus:border-primary/60";

/**
 * Bir yanıtın sarmalayıcısı: kendi KISA kancası (üst yorumdan inen çizgiden kavisle yanıta girer, ucunda nokta) ve — son yanıt değilse — çizginin devamı.
 * Çizgi arka plana yakın, 2 px; yanıtlar arasında uzun çizgi yoktur (docs/history/452-*). Girinti telefonda küçüktür, kutular tam genişliğe yakın kalır.
 */
function replyWrapClass(last: boolean): string {
  return cn(
    "relative pl-3 pt-3 sm:pl-4 sm:pt-4",
    "bg-linear-to-b from-border-soft to-border-soft bg-position-[0_0] bg-no-repeat",
    last ? "bg-size-[2px_22px] sm:bg-size-[2px_16px]" : "bg-size-[2px_100%]",
    "before:pointer-events-none before:absolute before:left-0 before:top-[22px] before:h-3.5 before:w-3 before:rounded-bl-md before:border-b-2 before:border-l-2 before:border-border-soft before:content-['']",
    "sm:before:top-4 sm:before:h-3 sm:before:w-3.5",
    "after:pointer-events-none after:absolute after:left-[9px] after:top-[33px] after:size-1.5 after:rounded-full after:bg-border-soft after:content-['']",
    "sm:after:left-[11px] sm:after:top-[25px]",
  );
}

function ThreadCommentNode({ comment, depth, tree }: { comment: PromptComment; depth: number; tree: CommentTree }) {
  const { t, language } = useTranslation();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const children = tree.childrenByParent.get(comment.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = tree.expandedIds.has(comment.id);
  const isReplyingHere = tree.replyingTo === comment.id;
  const isDeleted = Boolean(comment.deletedAt);
  const isOwn = Boolean(tree.currentUserId) && tree.currentUserId === comment.author.id;
  const worksVote = isDeletedComment(comment) ? undefined : tree.worksVoteOf?.(comment.author.id);
  const isEditingHere = tree.editingId === comment.id;
  const isConfirmingDelete = tree.deleteConfirmId === comment.id;
  const isDeletingHere = tree.isDeletingId === comment.id;
  // Masaüstü/tablet: yanıt ve düzenleme satır içi; telefon: alttan açılan kart (tam ekran sayfa yok).
  const editInline = isEditingHere && !isPhone;
  const editSheet = isEditingHere && isPhone;
  const replyInline = isReplyingHere && !isPhone;
  const replySheet = isReplyingHere && isPhone;

  const parent = comment.parentId ? tree.commentsById.get(comment.parentId) : undefined;
  // Once indentation stops growing, the visual nesting alone no longer shows
  // who a reply is answering — this hint keeps that relationship visible.
  const showParentHint = depth > MAX_INDENT_DEPTH && parent;
  const isHighlighted = tree.highlightedId === comment.id;
  const isPinned = Boolean(comment.pinnedAt) && depth === 0 && !isDeleted;
  const isByOwner = Boolean(tree.contentOwnerId) && tree.contentOwnerId === comment.author.id && !isDeleted;
  const avatarSize = depth === 0 ? 36 : 24;
  const indented = depth < MAX_INDENT_DEPTH;
  const hasMenu = Boolean(tree.menu) && !isDeleted && !isEditingHere;
  const canSaveEdit = Boolean(tree.editDraft.trim() || tree.editExtras.hasExtras) && !tree.editExtras.isPreparing;
  const canSendReply = Boolean(tree.replyDraft.trim() || tree.replyExtras.hasExtras) && !tree.replyExtras.isPreparing;

  const authorAvatar = (size: number, className?: string) => (
    <Link href={profileHref(comment.author)} className={cn("shrink-0 hover:opacity-80", className)} aria-label={comment.author.displayName}>
      <Avatar src={comment.author.avatarUrl} alt={comment.author.displayName} size={size} />
    </Link>
  );

  return (
    <div
      ref={(el) => tree.registerNodeRef(comment.id, el)}
      data-comment-id={comment.id}
      className={cn("rounded-md transition-colors duration-700", isHighlighted && "-m-1.5 bg-primary/10 p-1.5 ring-1 ring-primary/40")}
    >
      <div className="sm:grid sm:grid-cols-[auto_minmax(0,1fr)] sm:gap-x-3">
        {/* Sol sütun (sm+): avatar, daraltma oku ve üst yorumu yanıtlara bağlayan çizgi. Telefonda avatar kutunun içinde, kutu tam genişlik. */}
        <div className="hidden flex-col items-center sm:flex">
          {authorAvatar(avatarSize)}
          {hasChildren && (
            <>
              <button
                type="button"
                onClick={() => tree.onToggleExpand(comment.id)}
                aria-expanded={isExpanded}
                aria-label={isExpanded ? t("comments.collapseThread") : t("comments.expandThread")}
                data-comment-fold
                className="mt-1.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronDown size={12} aria-hidden className={cn("transition-transform duration-200", !isExpanded && "-rotate-90")} />
              </button>
              {isExpanded && <span aria-hidden className="mt-1 w-0.5 flex-1 rounded-full bg-border-soft" />}
            </>
          )}
        </div>

        <div className="min-w-0">
          <div className={BUBBLE_CLASS}>
            {isDeleted ? (
              <div className="flex items-center gap-2">
                {authorAvatar(24, "sm:hidden")}
                <p className="text-small italic text-text-muted">
                  <Link href={profileHref(comment.author)} className="font-medium not-italic text-text hover:underline">
                    {comment.author.displayName}
                  </Link>{" "}
                  {t("comments.thisCommentWasDeleted")}
                </p>
              </div>
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-muted">
                  {authorAvatar(depth === 0 ? 28 : 24, "sm:hidden")}
                  <Link href={profileHref(comment.author)} className="font-semibold text-text hover:underline">
                    {comment.author.displayName}
                  </Link>
                  {isPinned && <PinnedLabel />}
                  {isByOwner && <AuthorBadge />}
                  {worksVote !== undefined && <WorksBadge works={worksVote} />}
                  <span>· {formatRelativeTime(comment.createdAt, language)}</span>
                  {comment.editedAt && (
                    <button
                      type="button"
                      onClick={() => tree.menu?.openHistory(comment)}
                      disabled={!tree.menu}
                      data-comment-edited
                      className={cn("text-text-muted", tree.menu && "underline-offset-2 hover:text-text hover:underline")}
                    >
                      {t("comments.edited")}
                    </button>
                  )}
                  {hasMenu && (
                    <span className="ml-auto">
                      <CommentMenu comment={comment} depth={depth} tree={tree} isOwn={isOwn} isPinned={isPinned} />
                    </span>
                  )}
                </div>

                {editInline ? (
                  <div className="mt-2 space-y-1.5">
                    <p className="text-caption text-text-muted">{t("comments.editNotice")}</p>
                    <MentionTextarea value={tree.editDraft} maxLength={2000} onChange={tree.onEditDraftChange} rows={3} autoFocus className={FIELD_CLASS} />
                    <CommentExtrasPreview extras={tree.editExtras} attachmentState={tree.attachmentStateFor} />
                    <div className="flex flex-wrap items-center gap-2">
                      {tree.currentUserId && <CommentExtrasToolbar extras={tree.editExtras} userId={tree.currentUserId} disabled={tree.isSavingEdit} className="-ml-1.5" />}
                      <span className="ml-auto flex items-center gap-2">
                        <span className="text-caption tabular-nums text-text-muted">{t("comments.charCount", { count: tree.editDraft.length })}</span>
                        <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelEdit}>
                          {t("common.cancel")}
                        </Button>
                        <Button type="button" size="sm" disabled={!canSaveEdit || tree.isSavingEdit} onClick={() => tree.onSubmitEdit(comment.id)}>
                          {tree.isSavingEdit ? t("common.saving") : t("common.save")}
                        </Button>
                      </span>
                    </div>
                    {tree.editError && <p className="text-caption text-danger">{tree.editError}</p>}
                  </div>
                ) : (
                  <div className="mt-1.5">
                    {comment.rating ? <CommentRating comment={comment} tree={tree} isOwn={isOwn} /> : null}
                    <p className="break-words text-body text-text">
                      {showParentHint && (
                        <span className="mr-1 inline-flex items-center gap-0.5 text-caption font-medium text-primary">
                          <Reply size={12} />@{parent.author.username}
                        </span>
                      )}
                      <MentionText text={comment.body} />
                    </p>
                    <CommentAttachments comment={comment} tree={tree} />
                  </div>
                )}
              </>
            )}
          </div>

          {!isDeleted && !isEditingHere && (
            <div className="mt-1 flex flex-wrap items-center gap-x-1 gap-y-0.5 pl-1.5 text-small text-text-muted">
              <CommentReactions id={comment.id} likeCount={comment.likeCount} size={16} className="-my-0.5" />
              {tree.canInteract && (
                <button
                  type="button"
                  onClick={() => (isReplyingHere ? tree.onCancelReply() : tree.onStartReply(comment.id))}
                  className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2.5 font-medium transition-colors hover:bg-surface-soft hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  <Reply size={16} aria-hidden />
                  {t("request.reply")}
                </button>
              )}
              {hasChildren && (
                <button
                  type="button"
                  onClick={() => tree.onToggleExpand(comment.id)}
                  className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 font-medium text-primary transition-colors hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {isExpanded ? <ChevronUp size={12} aria-hidden /> : <ChevronDown size={12} aria-hidden />}
                  {isExpanded
                    ? t("comments.hideReplies")
                    : children.length === 1
                      ? t("comments.showReplySingular")
                      : t("comments.showRepliesPlural", { count: children.length })}
                </button>
              )}
              {/* Menü yoksa (Odak dışı eski kullanım) işlemler eskisi gibi satır içi kalır. */}
              {!tree.menu && tree.onTogglePin && depth === 0 && (
                <button type="button" onClick={() => tree.onTogglePin?.(comment.id)} aria-pressed={isPinned} data-comment-pin className="px-2 font-medium hover:text-text">
                  {isPinned ? t("comments.unpin") : t("comments.pin")}
                </button>
              )}
              {!tree.menu && !isOwn && tree.currentUserId && <ReportButton targetType="comment" targetId={comment.id} menuItem={false} />}
              {!tree.menu && isOwn && (
                <>
                  <button type="button" onClick={() => tree.onStartEdit(comment)} className="px-2 hover:text-text">
                    {t("common.edit")}
                  </button>
                  <button type="button" onClick={() => tree.onRequestDelete(comment.id)} disabled={isDeletingHere} className="px-2 hover:text-text">
                    {t("common.delete")}
                  </button>
                </>
              )}
            </div>
          )}

          {isConfirmingDelete && !isDeleted && (
            <div role="alert" data-comment-delete-confirm className="mt-1 flex flex-wrap items-center gap-2 rounded-md bg-danger-soft px-3 py-2 text-small text-danger">
              <span className="font-medium">{t("common.confirmDelete")}</span>
              <span className="ml-auto flex items-center gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelDeleteConfirm} disabled={isDeletingHere}>
                  {t("common.cancel")}
                </Button>
                <Button type="button" variant="danger" size="sm" onClick={() => tree.onRequestDelete(comment.id)} disabled={isDeletingHere}>
                  {isDeletingHere ? t("common.deleting") : t("common.delete")}
                </Button>
              </span>
            </div>
          )}

          {replyInline && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                tree.onSubmitReply(comment.id);
              }}
              className="mt-2 space-y-1.5"
            >
              <p className="text-caption text-text-muted">
                <span className="font-medium text-primary">@{comment.author.username}</span> {t("comments.replyingToSuffix")}
              </p>
              <MentionTextarea value={tree.replyDraft} maxLength={2000} onChange={tree.onReplyDraftChange} rows={3} autoFocus placeholder={t("comments.writeAReply")} className={FIELD_CLASS} />
              <CommentExtrasPreview extras={tree.replyExtras} />
              <div className="flex flex-wrap items-center gap-2">
                {tree.currentUserId && <CommentExtrasToolbar extras={tree.replyExtras} userId={tree.currentUserId} disabled={tree.isPosting} className="-ml-1.5" />}
                <span className="ml-auto flex items-center gap-2">
                  <span className="text-caption tabular-nums text-text-muted">{t("comments.charCount", { count: tree.replyDraft.length })}</span>
                  <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelReply}>
                    {t("common.cancel")}
                  </Button>
                  <Button type="submit" size="sm" disabled={!canSendReply || tree.isPosting}>
                    {tree.isPosting ? t("common.sending") : t("common.send")}
                  </Button>
                </span>
              </div>
              {tree.postError && <p className="text-caption text-danger">{tree.postError}</p>}
            </form>
          )}
        </div>
      </div>

      {replySheet && tree.currentUserId && (
        <CommentComposeSheet
          title={t("comments.replySheetTitle")}
          quote={{ name: comment.author.displayName, text: comment.body }}
          value={tree.replyDraft}
          onChange={tree.onReplyDraftChange}
          placeholder={t("comments.writeAReply")}
          extras={tree.replyExtras}
          userId={tree.currentUserId}
          submitLabel={t("common.send")}
          submitting={tree.isPosting}
          canSubmit={canSendReply}
          error={tree.postError}
          onSubmit={() => tree.onSubmitReply(comment.id)}
          onCancel={tree.onCancelReply}
        />
      )}
      {editSheet && tree.currentUserId && (
        <CommentComposeSheet
          title={t("comments.editSheetTitle")}
          notice={t("comments.editNotice")}
          value={tree.editDraft}
          onChange={tree.onEditDraftChange}
          extras={tree.editExtras}
          userId={tree.currentUserId}
          attachmentState={tree.attachmentStateFor}
          submitLabel={t("common.save")}
          submitting={tree.isSavingEdit}
          canSubmit={canSaveEdit}
          error={tree.editError}
          onSubmit={() => tree.onSubmitEdit(comment.id)}
          onCancel={tree.onCancelEdit}
        />
      )}

      {hasChildren && isExpanded && (
        <div className={cn(indented && (depth === 0 ? "ml-2.5 sm:ml-[17px]" : "ml-2.5 sm:ml-[11px]"))}>
          {children.map((child, index) => (
            <div key={child.id} className={indented ? replyWrapClass(index === children.length - 1) : "pt-3 sm:pt-4"}>
              <CommentNode comment={child} depth={depth + 1} tree={tree} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** In the sheet, replies indent once (under the parent's avatar) and then stay flat; "@parent" shows who a deeper reply answers. */
const SHEET_MAX_INDENT_DEPTH = 1;

/**
 * Odak's comment row (Instagram-like): avatar · name + time · text · "Yanıtla" (+ edit / delete / report), the heart and its
 * count in a column on the right, and "— N yanıtı gör" under it. Replying highlights the row; the reply itself is typed in
 * the sheet's composer (`tree.replyingTo`), not in an inline form. Edit stays inline.
 */
function SheetCommentNode({ comment, depth, tree }: { comment: PromptComment; depth: number; tree: CommentTree }) {
  const { t, language } = useTranslation();
  const children = tree.childrenByParent.get(comment.id) ?? [];
  const hasChildren = children.length > 0;
  const isExpanded = tree.expandedIds.has(comment.id);
  const isReplyTarget = tree.replyingTo === comment.id;
  const isDeleted = Boolean(comment.deletedAt);
  const isOwn = Boolean(tree.currentUserId) && tree.currentUserId === comment.author.id;
  const worksVote = isDeletedComment(comment) ? undefined : tree.worksVoteOf?.(comment.author.id);
  const isEditingHere = tree.editingId === comment.id;
  const isConfirmingDelete = tree.deleteConfirmId === comment.id;
  const isDeletingHere = tree.isDeletingId === comment.id;
  const parent = comment.parentId ? tree.commentsById.get(comment.parentId) : undefined;
  const showParentHint = depth > SHEET_MAX_INDENT_DEPTH && parent;
  const isHighlighted = tree.highlightedId === comment.id;
  const isPinned = Boolean(comment.pinnedAt) && depth === 0 && !isDeleted;
  const isByOwner = Boolean(tree.contentOwnerId) && tree.contentOwnerId === comment.author.id && !isDeleted;

  return (
    <div ref={(el) => tree.registerNodeRef(comment.id, el)} data-comment-id={comment.id}>
      <div
        className={cn(
          "flex gap-3 rounded-lg px-1 py-1 transition-colors duration-300",
          (isReplyTarget || isHighlighted) && "bg-primary/10",
        )}
      >
        <Link href={profileHref(comment.author)} className="shrink-0 pt-0.5 hover:opacity-80" aria-label={comment.author.displayName}>
          <Avatar src={comment.author.avatarUrl} alt={comment.author.displayName} size={depth === 0 ? 36 : 28} />
        </Link>
        <div className="min-w-0 flex-1">
          {isPinned && <PinnedLabel className="mb-1 flex" />}
          <p className="flex min-w-0 items-baseline gap-1.5 text-small">
            <Link href={profileHref(comment.author)} className="truncate font-semibold text-text hover:underline">
              {comment.author.username}
            </Link>
            {isByOwner && <AuthorBadge className="self-center" />}
            {worksVote !== undefined && <WorksBadge works={worksVote} className="self-center" />}
            <span className="shrink-0 text-caption text-text-muted">
              {formatRelativeTime(comment.createdAt, language)}
              {comment.editedAt && ` · ${t("comments.edited")}`}
            </span>
          </p>
          {!isDeleted && !isEditingHere && comment.rating ? <CommentRating comment={comment} tree={tree} isOwn={isOwn} /> : null}
          {isDeleted ? (
            <p className="text-small italic text-text-muted">{t("comments.thisCommentWasDeleted")}</p>
          ) : isEditingHere ? (
            <div className="mt-1 space-y-1.5">
              <MentionTextarea
                value={tree.editDraft}
                maxLength={2000}
                onChange={tree.onEditDraftChange}
                rows={2}
                autoFocus
                className="w-full resize-none rounded-lg card-flat px-3 py-1.5 text-small text-text focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
              />
              <div className="flex items-center gap-2">
                <Button type="button" size="sm" disabled={!(tree.editDraft.trim() || tree.editExtras.hasExtras) || tree.editExtras.isPreparing || tree.isSavingEdit} onClick={() => tree.onSubmitEdit(comment.id)}>
                  {tree.isSavingEdit ? t("common.saving") : t("common.save")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={tree.onCancelEdit}>
                  {t("common.cancel")}
                </Button>
              </div>
              <CommentExtrasPreview extras={tree.editExtras} attachmentState={tree.attachmentStateFor} showHint={false} />
              {tree.currentUserId && <CommentExtrasToolbar extras={tree.editExtras} userId={tree.currentUserId} disabled={tree.isSavingEdit} className="-ml-1.5" />}
              {tree.editError && <p className="text-caption text-danger">{tree.editError}</p>}
            </div>
          ) : (
            <>
              {(comment.body || showParentHint) && (
                <p className="whitespace-pre-line break-words text-body leading-snug text-text">
                  {showParentHint && <span className="mr-1 font-semibold text-primary">@{parent.author.username}</span>}
                  <MentionText text={comment.body} />
                </p>
              )}
              <CommentAttachments comment={comment} tree={tree} />
            </>
          )}

          {!isDeleted && !isEditingHere && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-caption font-semibold text-text-muted">
              <button
                type="button"
                onClick={() => (isReplyTarget ? tree.onCancelReply() : tree.onStartReply(comment.id))}
                aria-pressed={isReplyTarget}
                className="hover:text-text"
              >
                {t("request.reply")}
              </button>
              {!isOwn && tree.currentUserId && (
                // Quiet, like "Yanıtla": the shared report button without its flag icon.
                <span className="contents [&_button]:h-auto [&_button]:gap-0 [&_button]:p-0 [&_button]:text-caption [&_button]:font-semibold [&_button]:text-text-muted [&_button:hover]:text-text [&_svg]:hidden">
                  <ReportButton targetType="comment" targetId={comment.id} menuItem={false} />
                </span>
              )}
              {isOwn && (
                <>
                  <button type="button" onClick={() => tree.onStartEdit(comment)} className="hover:text-text">
                    {t("common.edit")}
                  </button>
                  <button
                    type="button"
                    onClick={() => tree.onRequestDelete(comment.id)}
                    onBlur={tree.onCancelDeleteConfirm}
                    disabled={isDeletingHere}
                    className={cn("hover:text-text", isConfirmingDelete && "text-danger")}
                  >
                    {isDeletingHere ? t("common.deleting") : isConfirmingDelete ? t("common.confirmDelete") : t("common.delete")}
                  </button>
                </>
              )}
            </div>
          )}

          {hasChildren && (
            <button
              type="button"
              onClick={() => tree.onToggleExpand(comment.id)}
              aria-expanded={isExpanded}
              className="mt-2 flex items-center gap-3 text-caption font-semibold text-text-muted hover:text-text"
            >
              <span aria-hidden className="h-px w-7 bg-border-strong" />
              {isExpanded
                ? t("comments.hideReplies")
                : children.length === 1
                  ? t("comments.showReplySingular")
                  : t("comments.showRepliesPlural", { count: children.length })}
            </button>
          )}
        </div>

        {!isDeleted && (
          <div className="flex w-10 shrink-0 flex-col items-center self-start pt-1">
            <CommentReactions id={comment.id} likeCount={comment.likeCount} size={16} layout="column" buttonClassName="flex-col gap-0.5 !h-auto py-1" />
          </div>
        )}
      </div>

      {hasChildren && isExpanded && (
        <div className={cn("mt-1 space-y-1", depth < SHEET_MAX_INDENT_DEPTH && "pl-12")}>
          {children.map((child) => (
            <CommentNode key={child.id} comment={child} depth={depth + 1} tree={tree} />
          ))}
        </div>
      )}
    </div>
  );
}
