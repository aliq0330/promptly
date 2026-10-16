"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { EyeOff, Flag, Pencil, Pin, PinOff, Plus, ShieldAlert, SquareStack, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldControlClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import { DropdownMenu, MenuItem } from "./dropdown-menu";
import { ReportModal } from "./report-modal";
import { ShareToCommunityModal } from "./share-to-community-modal";
import type { CommunityTabProps } from "./community-page";
import {
  deleteCommunityPost,
  fetchCommunityPosts,
  fetchPinnedPosts,
  moderateCommunityPost,
  setCommunityPostPinned,
  updateCommunityPostNote,
  type CommunityPost,
} from "@/lib/supabase/communities";
import { can, isGroupStaff } from "@/lib/chat-groups";
import { canSharePost, COMMUNITY_NOTE_MAX } from "@/lib/communities";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";

type PostAction = { kind: "edit" | "delete" | "moderate" | "report"; post: CommunityPost };

/**
 * Topluluk akışı: üyelerin paylaştığı Prompt / İstek / Workflow / Hazır Ayar'lar. Gönderi içeriğin KOPYASI değil başvurusudur; kart,
 * beğeni, yorum ve kaydetme içeriğin kendi altyapısıdır. Üye olmayan ziyaretçi (herkese açık topluluk) akışı okur, paylaşamaz/raporlayamaz.
 * Düzenleme/silme: yazar kendi gönderisini; kaldırma/sabitleme: ilgili yetenekle (denetim kaydı düşer, yazara bildirim gider).
 */
export function FeedTab({ group, role, viewerId, onToast, reload }: CommunityTabProps) {
  const { t } = useTranslation();
  const searchParams = useSearchParams();
  const [pinned, setPinned] = useState<CommunityPost[] | null>(null);
  const [posts, setPosts] = useState<CommunityPost[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [action, setAction] = useState<PostAction | null>(null);
  const shareFailed = searchParams.get("shareFailed");
  const justShared = searchParams.get("shared") === "1";

  const canPost = canSharePost(role, group.feedPolicy, Boolean(group.closedAt));
  const canPin = can(role, "pin_posts", group.rolePermissions) && !group.closedAt;
  const canModerate = isGroupStaff(role) && can(role, "moderate_posts", group.rolePermissions);

  const load = useCallback(async () => {
    try {
      const [pins, page] = await Promise.all([fetchPinnedPosts(group.id), fetchCommunityPosts(group.id, null)]);
      setPinned(pins);
      setPosts(page.posts);
      setHasMore(page.hasMore);
      setLoadError(false);
    } catch (err) {
      console.error("community feed", err);
      setLoadError(true);
    }
  }, [group.id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [load]);

  async function loadMore() {
    if (!posts || posts.length === 0 || loadingMore) return;
    const last = posts[posts.length - 1];
    setLoadingMore(true);
    try {
      const page = await fetchCommunityPosts(group.id, { createdAt: last.createdAt, id: last.id });
      setPosts([...posts, ...page.posts]);
      setHasMore(page.hasMore);
    } catch (err) {
      console.error("community feed (more)", err);
      onToast(t("communities.error.generic"));
    } finally {
      setLoadingMore(false);
    }
  }

  const refreshAll = useCallback(async () => {
    await load();
    await reload();
  }, [load, reload]);

  const pinAction = useAsyncAction();
  async function togglePin(post: CommunityPost) {
    const ok = await pinAction.run(async () => {
      await setCommunityPostPinned(post.id, !post.pinnedAt);
      return true;
    });
    if (ok) {
      onToast(post.pinnedAt ? t("communities.feed.unpinnedToast") : t("communities.feed.pinnedToast"));
      await load();
    }
  }

  return (
    <div className="space-y-5">
      {justShared && <p role="status" className="rounded-md bg-success/10 px-3 py-2 text-small text-text">{t("communities.feed.sharedBanner")}</p>}
      {shareFailed && (
        <p role="alert" className="rounded-md bg-warning/10 px-3 py-2 text-small text-text">
          {shareFailed === "content_not_public" || shareFailed === "content_not_found" ? t("communities.feed.shareFailedPrivate") : t("communities.feed.shareFailed")}
        </p>
      )}
      {pinAction.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {pinAction.error}
        </p>
      )}

      <div className="flex items-center justify-between gap-3">
        <p className="text-small text-text-muted">{group.feedPolicy === "admins" ? t("communities.feed.policyStaff") : t("communities.feed.policyMembers")}</p>
        {canPost ? (
          <Button type="button" size="sm" onClick={() => setShareOpen(true)}>
            <Plus size={14} /> {t("communities.feed.share")}
          </Button>
        ) : (
          role && group.closedAt === null && <span className="text-caption text-text-muted">{t("communities.feed.cannotShare")}</span>
        )}
      </div>

      {loadError ? (
        <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
          <p role="alert" className="text-small text-danger">
            {t("communities.feed.loadError")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : posts === null || pinned === null ? (
        <ul className="space-y-3" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
          {[0, 1].map((i) => (
            <li key={i} className="h-48 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
          ))}
        </ul>
      ) : pinned.length === 0 && posts.length === 0 ? (
        <EmptyState
          icon={SquareStack}
          title={t("communities.feed.empty")}
          description={canPost ? t("communities.feed.emptyHelpMember") : t("communities.feed.emptyHelp")}
        />
      ) : (
        <>
          {pinned.length > 0 && (
            <ul className="space-y-3" aria-label={t("communities.feed.pinnedAria")}>
              {pinned.map((post) => (
                <PostItem key={post.id} post={post} viewerId={viewerId} role={role} canPin={canPin} canModerate={canModerate} onPin={togglePin} onAction={setAction} />
              ))}
            </ul>
          )}
          <ul className="space-y-3">
            {posts.map((post) => (
              <PostItem key={post.id} post={post} viewerId={viewerId} role={role} canPin={canPin} canModerate={canModerate} onPin={togglePin} onAction={setAction} />
            ))}
          </ul>
          {hasMore && (
            <div className="flex justify-center">
              <Button type="button" variant="outline" size="sm" onClick={() => void loadMore()} disabled={loadingMore}>
                {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}

      {shareOpen && viewerId && (
        <ShareToCommunityModal
          communityId={group.id}
          userId={viewerId}
          onClose={() => setShareOpen(false)}
          onShared={async () => {
            setShareOpen(false);
            onToast(t("communities.feed.sharedToast"));
            await refreshAll();
          }}
        />
      )}
      {action?.kind === "edit" && (
        <EditNoteModal
          post={action.post}
          onClose={() => setAction(null)}
          onSaved={async () => {
            setAction(null);
            onToast(t("communities.feed.noteSavedToast"));
            await load();
          }}
        />
      )}
      {action?.kind === "delete" && (
        <DeletePostDialog
          post={action.post}
          moderation={false}
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            onToast(t("communities.feed.deletedToast"));
            await refreshAll();
          }}
        />
      )}
      {action?.kind === "moderate" && (
        <DeletePostDialog
          post={action.post}
          moderation
          onClose={() => setAction(null)}
          onDone={async () => {
            setAction(null);
            onToast(t("communities.feed.removedToast"));
            await refreshAll();
          }}
        />
      )}
      {action?.kind === "report" && (
        <ReportModal
          communityId={group.id}
          kind="post"
          targetId={action.post.id}
          onClose={() => setAction(null)}
          onReported={() => {
            setAction(null);
            onToast(t("communities.report.sentToast"));
          }}
        />
      )}
    </div>
  );
}

const SHARED_LABEL: Record<CommunityPost["contentType"], TranslationKey> = {
  prompt: "communities.feed.shared.prompt",
  request: "communities.feed.shared.request",
  workflow: "communities.feed.shared.workflow",
  preset: "communities.feed.shared.preset",
};

function PostItem({
  post,
  viewerId,
  role,
  canPin,
  canModerate,
  onPin,
  onAction,
}: {
  post: CommunityPost;
  viewerId: string | null;
  role: CommunityTabProps["role"];
  canPin: boolean;
  canModerate: boolean;
  onPin: (post: CommunityPost) => void;
  onAction: (action: PostAction) => void;
}) {
  const { t, language } = useTranslation();
  const mine = Boolean(viewerId) && post.author?.id === viewerId;
  const hasMenu = mine || canPin || canModerate || Boolean(role);
  const content = post.content;

  // İçerik artık okunamıyorsa (silindi / özel yapıldı) yalnızca yazar ve yetkililer gönderi kaydını görür; diğerleri için gizlenir.
  if (!content && !mine && !canModerate) return null;

  return (
    <li className="space-y-2 rounded-xl border border-border-soft bg-surface p-3 shadow-card sm:p-4">
      <div className="flex items-start gap-2.5">
        {post.author && <Avatar src={post.author.avatarUrl} alt={post.author.displayName} size={32} />}
        <div className="min-w-0 flex-1 leading-tight">
          <p className="flex flex-wrap items-center gap-x-1.5 text-small text-text">
            {post.author ? (
              <Link href={profileHref(post.author)} className="font-semibold hover:underline">
                {post.author.displayName}
              </Link>
            ) : (
              <span className="font-semibold">{t("common.genericUser")}</span>
            )}
            <span className="text-text-muted">{t(SHARED_LABEL[post.contentType])}</span>
            {post.pinnedAt && (
              <Badge variant="default">
                <Pin size={11} aria-hidden /> {t("communities.announcements.pinned")}
              </Badge>
            )}
          </p>
          <p className="text-caption text-text-muted">{formatRelativeTime(post.createdAt, language)}</p>
        </div>
        {hasMenu && (
          <DropdownMenu label={t("communities.feed.postMenu")}>
            {(close) => (
              <>
                {mine && <MenuItem icon={<Pencil size={15} />} label={t("communities.feed.editNote")} onClick={() => { close(); onAction({ kind: "edit", post }); }} />}
                {canPin && <MenuItem icon={post.pinnedAt ? <PinOff size={15} /> : <Pin size={15} />} label={post.pinnedAt ? t("communities.feed.unpin") : t("communities.feed.pin")} onClick={() => { close(); onPin(post); }} />}
                {role && !mine && <MenuItem icon={<Flag size={15} />} label={t("communities.report.menu")} onClick={() => { close(); onAction({ kind: "report", post }); }} />}
                {canModerate && !mine && <MenuItem icon={<ShieldAlert size={15} />} label={t("communities.feed.removeAsStaff")} danger onClick={() => { close(); onAction({ kind: "moderate", post }); }} />}
                {mine && <MenuItem icon={<Trash2 size={15} />} label={t("communities.feed.deleteMine")} danger onClick={() => { close(); onAction({ kind: "delete", post }); }} />}
              </>
            )}
          </DropdownMenu>
        )}
      </div>
      {post.note && <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{post.note}</p>}
      {content ? (
        <div>
          {content.type === "prompt" && <PromptCard prompt={content.data} />}
          {content.type === "request" && <RequestCard request={content.data} />}
          {content.type === "workflow" && <WorkflowCard workflow={content.data} />}
          {content.type === "preset" && <PresetCard preset={content.data} />}
        </div>
      ) : (
        <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
          <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
        </p>
      )}
    </li>
  );
}

function EditNoteModal({ post, onClose, onSaved }: { post: CommunityPost; onClose: () => void; onSaved: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAsyncAction();
  const [note, setNote] = useState(post.note ?? "");
  async function save() {
    const ok = await run(async () => {
      await updateCommunityPostNote(post.id, note);
      return true;
    });
    if (ok) await onSaved();
  }
  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="edit-note-title">
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5 shadow-lg" onClick={(event) => event.stopPropagation()}>
        <h2 id="edit-note-title" className="text-base font-semibold text-text">
          {t("communities.feed.editNote")}
        </h2>
        <div>
          <label htmlFor="edit-note" className={fieldLabelClassName}>
            {t("communities.feed.noteLabel")}
          </label>
          <textarea id="edit-note" value={note} onChange={(event) => setNote(event.target.value)} rows={4} maxLength={COMMUNITY_NOTE_MAX} disabled={busy} className={`${fieldControlClassName} resize-none py-2.5`} />
        </div>
        {error && (
          <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="button" size="sm" onClick={() => void save()} disabled={busy}>
            {busy ? t("common.loading") : t("common.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** Gönderiyi kaldırma onayı: yazar kendi gönderisini (içerik silinmez) ya da yetkili moderasyonla (sebep + denetim kaydı + yazara bildirim). */
function DeletePostDialog({ post, moderation, onClose, onDone }: { post: CommunityPost; moderation: boolean; onClose: () => void; onDone: () => void | Promise<void> }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAsyncAction();
  const [reason, setReason] = useState("");
  async function confirm() {
    const ok = await run(async () => {
      if (moderation) await moderateCommunityPost(post.id, reason);
      else await deleteCommunityPost(post.id);
      return true;
    });
    if (ok) await onDone();
  }
  return (
    <ConfirmDialog
      id="delete-post-title"
      title={moderation ? t("communities.feed.removeTitle") : t("communities.feed.deleteTitle")}
      body={moderation ? t("communities.feed.removeBody") : t("communities.feed.deleteBody")}
      confirmLabel={moderation ? t("communities.feed.removeConfirm") : t("common.delete")}
      danger
      busy={busy}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onClose}
    >
      {moderation && (
        <div>
          <label htmlFor="remove-reason" className={fieldLabelClassName}>
            {t("communities.feed.removeReason")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
          </label>
          <textarea id="remove-reason" value={reason} onChange={(event) => setReason(event.target.value)} rows={2} maxLength={300} disabled={busy} className={`${fieldControlClassName} resize-none py-2`} />
        </div>
      )}
    </ConfirmDialog>
  );
}

