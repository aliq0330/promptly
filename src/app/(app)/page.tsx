import { Sparkles } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export default function HomePage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Sparkles}
        title="Ana sayfa akışı yakında burada"
        description="Takip Ettiklerim, Popüler ve Sana Özel sekmeleriyle prompt akışı bir sonraki modülde geliştirilecek."
      />
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid />
      </div>
    </div>
  );
}
