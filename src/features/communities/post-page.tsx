"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowUpRight, Flag, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button, buttonClassName } from "@/components/ui/button";
import { DetailSkeleton, NotFoundBlock } from "@/components/ui/detail-skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { useToast } from "@/features/groups/use-toast";
import { ReportModal } from "./report-modal";
import { DropdownMenu, MenuItem } from "./dropdown-menu";
import { PostScopeProvider } from "./post-scope";
import { summarizeContent } from "./content-summary";
import { PaletteStrip, SpaceCoverArt } from "@/features/spaces/space-visuals";
import { spaceHref } from "@/lib/spaces";
import { summaryArt } from "@/lib/supabase/spaces";
import { PostMenuExtras, type PostMenuExtra } from "@/features/prompts/post-menu-extras";
import { PromptDetailView } from "@/features/prompts/prompt-detail-view";
import { RequestDetailView } from "@/features/requests/request-detail-view";
import { WorkflowDetailView } from "@/features/workflows/workflow-view";
import { PresetDetailView } from "@/features/presets/preset-detail-view";
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
  space: "communities.feed.shared.space",
};

type Dialog = "edit" | "delete" | "moderate" | "report" | null;

/**
 * `/communities/post/local?id=<gönderi>`: BAŞVURU gönderisinin kendi sayfası. Başvurulan içeriğin NORMAL detay sayfası (Prompt/İstek/Workflow/Hazır Ayar —
 * mobil, tablet ve masaüstü yerleşimi dahil) olduğu gibi çizilir; yalnızca üstte başvuru bandı vardır ve beğeni/yorum/kaydet/istatistik/paylaş GÖNDERİNİN
 * KENDİSİNE bağlanır (`PostScope`, orijinale karışmaz; docs/history/184-*). "Orijinal içeriği aç" içeriğin kendi sayfasına geçer. Yerel (native) gönderinin sayfası içeriğin
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

  // Gönderi işleri, içeriğin NORMAL ⋮ menüsüne eklenir (ikinci menü yok); içeriğin kendi yönetimi (düzenle/sil) orijinalin sayfasında kalır.
  const extras: PostMenuExtra[] = [];
  if (mine) extras.push({ key: "edit-note", label: t("communities.feed.editNote"), icon: <Pencil size={14} />, onSelect: () => setDialog("edit") });
  if (role && !mine) extras.push({ key: "report", label: t("communities.report.menu"), icon: <Flag size={14} />, onSelect: () => setDialog("report") });
  if (canModerate && !mine) extras.push({ key: "moderate", label: t("communities.feed.removeAsStaff"), icon: <ShieldAlert size={14} />, danger: true, onSelect: () => setDialog("moderate") });
  if (mine) extras.push({ key: "delete", label: t("communities.feed.deleteMine"), icon: <Trash2 size={14} />, danger: true, onSelect: () => setDialog("delete") });

  const content = post.content;
  const originalHref = content ? summarizeContent(content).href : null;

  return (
    <div data-community-post-page={post.id}>
      {/* A flat strip edge to edge (no card), right under the header and on top of the band — the same side padding as the detail page. */}
      <section aria-label={t("communities.post.linked.appliedLabel")} className="border-b border-border-soft bg-surface">
        <div className="mx-auto w-full max-w-6xl px-4 py-4 sm:px-6 lg:px-10">
          <Link href={feedHref} className="inline-flex items-center gap-1.5 text-small text-text-muted hover:text-text">
            <ArrowLeft size={14} aria-hidden /> {group ? t("communities.post.page.back", { name: group.name }) : t("communities.post.page.backGeneric")}
          </Link>
          <div className="mt-3 flex items-start gap-3">
            {post.author && <Avatar src={post.author.avatarUrl} alt={post.author.displayName} size={40} />}
            <div className="min-w-0 flex-1">
              <p className="break-words text-small leading-snug text-text">
                {post.author ? (
                  <Link href={profileHref(post.author)} className="font-semibold hover:underline">
                    {post.author.displayName}
                  </Link>
                ) : (
                  <span className="font-semibold">{t("common.genericUser")}</span>
                )}{" "}
                <span className="text-text-muted">{t(SHARED_LABEL[post.contentType])}</span>
              </p>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-text-muted">
                {post.kind !== "legacy" && <Badge variant="default">{t("communities.post.badge.application")}</Badge>}
                <span>{formatRelativeTime(post.createdAt, language)}</span>
              </p>
            </div>
            {(!content || content.type === "space") && extras.length > 0 && (
              <DropdownMenu label={t("communities.feed.postMenu")}>
                {(close) => (
                  <>
                    {extras.map((extra) => (
                      <MenuItem key={extra.key} icon={extra.icon} label={extra.label} danger={extra.danger} onClick={() => { close(); extra.onSelect(); }} />
                    ))}
                  </>
                )}
              </DropdownMenu>
            )}
          </div>
          {post.note && <p data-post-note className="mt-3 whitespace-pre-wrap break-words rounded-lg bg-surface-soft px-3.5 py-3 text-small text-text-secondary">{post.note}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border-soft pt-3">
            <p className="min-w-0 flex-1 basis-56 text-caption text-text-muted">{t("communities.post.page.scopeHelp")}</p>
            {originalHref && (
              <Link href={originalHref} data-open-original className={buttonClassName({ size: "sm", variant: "outline", className: "ml-auto shrink-0 gap-1.5" })}>
                {t("communities.post.linked.openOriginal")}
                <ArrowUpRight size={14} aria-hidden />
              </Link>
            )}
          </div>
        </div>
      </section>

      <PostScopeProvider value={{ post, mode, onToast: show }}>
        <PostMenuExtras items={extras}>
          {content?.type === "prompt" && <PromptDetailView prompt={content.data} />}
          {content?.type === "request" && <RequestDetailView request={content.data} />}
          {content?.type === "workflow" && <WorkflowDetailView workflowId={content.data.id} />}
          {content?.type === "preset" && <PresetDetailView presetId={content.data.id} />}
        </PostMenuExtras>
      </PostScopeProvider>

      {(!content || content.type === "space") && (
        <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-5">
          {content?.type === "space" ? (
            // Space'in kendi sayfası pano/vitrindir (detay sayfası yok): burada kapak kolajı + başlık + "Space'i aç"; gönderinin kendi
            // beğeni/yorumu aşağıda (sayaçlar GÖNDERİNİN — docs/history/215-*).
            <Link href={spaceHref(content.data.id)} data-post-space={content.data.id} className="block overflow-hidden rounded-lg border border-border-soft bg-surface shadow-card transition-shadow hover:shadow-card-hover">
              <SpaceCoverArt urls={summaryArt(content.data)} className="aspect-[16/9] w-full" iconSize={48} />
              {content.data.palette.length > 0 && <PaletteStrip colors={content.data.palette} className="h-1.5 rounded-none" />}
              <span className="block space-y-1 p-4">
                <span className="block text-h3 font-bold text-text">{content.data.title}</span>
                {content.data.description && <span className="line-clamp-3 block text-small text-text-secondary">{content.data.description}</span>}
              </span>
            </Link>
          ) : (
            <p className="flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-4 text-small text-text-muted">
              <EyeOff size={15} aria-hidden /> {t("communities.feed.contentGone")}
            </p>
          )}
          <section className="space-y-2" aria-label={t("communities.post.page.commentsTitle")}>
            <p className="text-caption text-text-muted">{t("communities.post.page.commentsHelp")}</p>
            <PostEngagement post={post} mode={mode} onToast={show} highlightCommentId={highlightCommentId} />
          </section>
        </div>
      )}

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
