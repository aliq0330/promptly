import Link from "next/link";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RequestCard } from "@/features/requests/request-card";
import { mockPrompts } from "@/mocks/prompts";
import { mockUsers } from "@/mocks/users";
import { mockTags } from "@/mocks/tags";
import { mockRequests } from "@/mocks/requests";
import { formatCount } from "@/lib/utils";

export default function DiscoverPage() {
  const trending = [...mockPrompts].sort((a, b) => b.likeCount - a.likeCount).slice(0, 6);
  const creators = [...mockUsers]
    .filter((user) => user.id !== "me")
    .sort((a, b) => b.followerCount - a.followerCount)
    .slice(0, 5);
  const openRequests = mockRequests.filter((request) => request.status === "open").slice(0, 3);

  return (
    <div className="space-y-8 px-4 py-6 lg:px-6">
      <section className="space-y-4">
        <h2 className="text-base font-semibold text-text">Trend Promptlar</h2>
        <PromptGrid prompts={trending} />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">Öne Çıkan Yaratıcılar</h2>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {creators.map((creator) => (
            <Link
              key={creator.id}
              href={`/profile/${creator.username}`}
              className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-lg border border-border bg-surface p-4 text-center transition-colors hover:bg-accent-surface/40"
            >
              <Avatar src={creator.avatarUrl} alt={creator.displayName} size={56} />
              <span className="line-clamp-1 text-sm font-medium text-text">
                {creator.displayName}
              </span>
              <span className="text-xs text-text-muted">
                {formatCount(creator.followerCount)} takipçi
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">Popüler Etiketler</h2>
        <div className="flex flex-wrap gap-2">
          {mockTags.map((tag) => (
            <Link key={tag.slug} href={`/tags/${tag.slug}`}>
              <Badge variant="outline" className="hover:bg-accent-surface">
                #{tag.label}
              </Badge>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-semibold text-text">Açık Prompt İstekleri</h2>
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          {openRequests.map((request) => (
            <RequestCard key={request.id} request={request} />
          ))}
        </div>
      </section>
    </div>
  );
}
