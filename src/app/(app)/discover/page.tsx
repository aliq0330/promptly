import { Compass } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export default function DiscoverPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Compass}
        title="Keşfet"
        description="Trend promptlar, öne çıkan yaratıcılar, popüler etiketler ve prompt istekleri burada listelenecek."
      />
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid />
      </div>
    </div>
  );
}
