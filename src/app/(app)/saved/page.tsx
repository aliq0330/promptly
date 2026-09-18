import { Bookmark } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export default function SavedPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Bookmark}
        title="Kaydedilenler"
        description="Kaydettiğin promptlar yalnızca sana özel olarak burada listelenecek."
      />
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid count={3} />
      </div>
    </div>
  );
}
