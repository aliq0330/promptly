"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Flag, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { useToast } from "@/features/groups/use-toast";
import { DropdownMenu, MenuItem } from "./dropdown-menu";
import { ReportModal } from "./report-modal";
import { ApplicationContentDetail } from "./application-detail";
import { PostEngagement, type EngageMode } from "./post-engagement";
import { DeletePostDialog, EditNoteModal } from "./feed-tab";
import { useCommunity } from "./use-community";
import { fetchCommunityPostById, type CommunityPost } from "@/lib/supabase/communities";
import { can, isGroupStaff } from "@/lib/chat-groups";
import { communityHref } from "@/lib/communities";
import { formatRelativeTime, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import { EyeOff } from "lucide-react";
import type { TranslationKey } from "@/lib/i18n/translations";

const SHARED_LABEL: Record<CommunityPost["contentType"], TranslationKey> = {
  prompt: "communities.feed.shared.prompt",
  request: "communities.feed.shared.request",
  workflow: "communities.feed.shared.workflow",
  preset: "communities.feed.shared.preset",
};

type Dialog = "edit" | "delete" | "moderate" | "report" | null;

/**
 * `/communities/post/local?id=<gönderi>`: BAŞVURU gönderisinin kendi sayfası. Başvurulan içerik ayrıntılı (salt okunur) gösterilir, "Orijinal içeriği aç"
 * ile içeriğin kendi sayfasına geçilir; gönderinin KENDİ beğenisi/yorumları burada yürür (orijinale karışmaz). Yerel (native) gönderinin sayfası içeriğin
 * kendisidir → o içeriğe yönlenir. Erişim topluluğun okuma kuralıdır (gönderiyi okuyamayan "bulunamadı" görür).
 */
export function CommunityPostPage() {
  const { t, language } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const postId = params.get("id");
  const hl = params.get("hl");
  const highlightCommentId = hl?.startsWith("comment:") ? hl.slice("comment:".length) : null;
  const { user, loading: authLoading } = useAuth();
  const { node: toastNode, show } = useToast();
  const [post, setPost] = useState<CommunityPost | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [dialog, setDialog] = useState<Dialog>(null);
  const community = useCommunity(post ? post.communityId : null, user?.id ?? null);

  const load = useCallback(async () => {
    if (!postId) {
      setPost(null);
      return;
    }
    try {
      setPost(await fetchCommunityPostById(postId));
      setFailed(false);
    } catch (err) {
      console.error("community post page", err);
      setFailed(true);
    }
  }, [postId]);

  useEffect(() => {
    if (authLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    void load();
  }, [authLoading, load]);

  // Yerel gönderinin sayfası içeriğin kendisidir.
  useEffect(() => {
    if (post?.kind === "native" && post.content) {
      const base = post.content.type === "prompt" ? "/prompts/local" : post.content.type === "request" ? "/requests/local" : post.content.type === "workflow" ? "/workflows/local" : "/presets/local";
      router.replace(`${base}?id=${post.content.data.id}`);
    }
  }, [post, router]);

  if (authLoading || (post === undefined && !failed)) return <DetailSkeleton />;
  if (failed) {
    return (
      <div className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <p role="alert" className="text-small text-danger">
          {t("communities.post.page.loadError")}
        </p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          {t("common.retry")}
        </Button>
      </div>
    );
  }
  if (!post || post.kind === "native") {
    return (
      <div className="mx-auto max-w-md space-y-4 px-4 py-16 text-center">
        <NotFoundBlock title={t("communities.notFound.title")} description={t("communities.post.focus.notFound")} />
        <Link href="/communities" className={buttonClassName({ size: "sm", variant: "outline" })}>
          {t("communities.join.toCommunities")}
        </Link>
      </div>
    );
  }

  const group = community.state.status === "ready" ? community.state.group : null;
  const role = community.state.status === "ready" ? (community.state.membership?.role ?? null) : null;
  const closed = Boolean(group?.closedAt);
  const mode: EngageMode = closed ? "closed" : !user || role ? "open" : "join";
  const mine = Boolean(user) && post.author?.id === user?.id;
  const canModerate = Boolean(group) && isGroupStaff(role) && can(role, "moderate_posts", group?.rolePermissions);
  const feedHref = communityHref(post.communityId, "feed");
  const hasMenu = mine || canModerate || Boolean(role);

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5 sm:py-6">
      <Link href={feedHref} className="inline-flex items-center gap-1.5 text-small text-text-muted hover:text-text">
        <ArrowLeft size={14} aria-hidden /> {group ? t("communities.post.page.back", { name: group.name }) : t("communities.post.page.backGeneric")}
      </Link>

      <article data-community-post-page={post.id} className="space-y-4">
        <header className="flex items-start gap-2.5">
          {post.author && <Avatar src={post.author.avatarUrl} alt={post.author.displayName} size={36} />}
          <div className="min-w-0 flex-1 leading-tight">
            <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-small text-text">
              {post.author ? (
                <Link href={profileHref(post.author)} className="font-semibold hover:underline">
                  {post.author.displayName}
                </Link>
              ) : (
                <span className="font-semibold">{t("common.genericUser")}</span>
              )}
              <span className="text-text-muted">{t(SHARED_LABEL[post.contentType])}</span>
              {post.kind !== "legacy" && <Badge variant="default">{t("communities.post.badge.application")}</Badge>}
            </p>
            <p className="text-caption text-text-muted">{formatRelativeTime(post.createdAt, language)}</p>
          </div>
          {hasMenu && (
            <DropdownMenu label={t("communities.feed.postMenu")}>
              {(close) => (
                <>
                  {mine && <MenuItem icon={<Pencil size={15} />} label={t("communities.feed.editNote")} onClick={() => { close(); setDialog("edit"); }} />}
                  {role && !mine && <MenuItem icon={<Flag size={15} />} label={t("communities.report.menu")} onClick={() => { close(); setDialog("report"); }} />}
                  {canModerate && !mine && <MenuItem icon={<ShieldAlert size={15} />} label={t("communities.feed.removeAsStaff")} danger onClick={() => { close(); setDialog("moderate"); }} />}
                  {mine && <MenuItem icon={<Trash2 size={15} />} label={t("communities.feed.deleteMine")} danger onClick={() => { close(); setDialog("delete"); }} />}
                </>
              )}
            </DropdownMenu>
          )}
        </header>

        {post.note && <p data-post-note className="whitespace-pre-wrap break-words rounded-lg bg-surface-soft px-3.5 py-3 text-small text-text-secondary">{post.note}</p>}

        {post.content ? (
          <ApplicationContentDetail content={post.content} />
        ) : (
          <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
            <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
          </p>
        )}

        <section className="space-y-2" aria-label={t("communities.post.page.commentsTitle")}>
          <p className="text-caption text-text-muted">{t("communities.post.page.commentsHelp")}</p>
          <PostEngagement post={post} mode={mode} onToast={show} highlightCommentId={highlightCommentId} />
        </section>
      </article>

      {dialog === "edit" && (
        <EditNoteModal
          post={post}
          onClose={() => setDialog(null)}
          onSaved={async () => {
            setDialog(null);
            show(t("communities.feed.noteSavedToast"));
            await load();
          }}
        />
      )}
      {(dialog === "delete" || dialog === "moderate") && (
        <DeletePostDialog
          post={post}
          moderation={dialog === "moderate"}
          onClose={() => setDialog(null)}
          onDone={() => {
            setDialog(null);
            router.replace(feedHref);
          }}
        />
      )}
      {dialog === "report" && (
        <ReportModal
          communityId={post.communityId}
          kind="post"
          targetId={post.id}
          onClose={() => setDialog(null)}
          onReported={() => {
            setDialog(null);
            show(t("communities.report.sentToast"));
          }}
        />
      )}
      {toastNode}
    </div>
  );
}
