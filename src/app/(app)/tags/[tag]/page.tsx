import { Tag } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export function generateStaticParams() {
  return [{ tag: "ai" }];
}

export default function TagDetailPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Tag}
        title="Etiket"
        description="Bu etikete sahip promptlar bir sonraki modülde burada listelenecek."
      />
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid />
      </div>
    </div>
  );
}
