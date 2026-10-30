import type { ReportTarget } from "@/features/moderation/report-modal";
import type { CommunityPost } from "@/lib/supabase/communities";

/** Topluluk gönderisini merkezi şikâyet penceresine tanıtır (docs/history/284-*): başlık = içeriğin adı (yoksa not), alt satır = yazar · topluluk. */
export function communityPostReportTarget(post: CommunityPost, communityName?: string | null): ReportTarget {
  const data = post.content?.data as { title?: string } | undefined;
  const author = post.author?.username ? `@${post.author.username}` : null;
  return {
    type: "community_post",
    id: post.id,
    title: data?.title ?? post.note ?? null,
    subtitle: [author, communityName].filter(Boolean).join(" · ") || null,
  };
}
