import { MessageCircle } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { ListRowSkeletonGroup } from "@/components/ui/list-row-skeleton";

export default function MessagesPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={MessageCircle}
        title="Mesajlar"
        description="Konuşma listen ve yeni konuşma başlatma seçeneği bu sayfada olacak."
      />
      <div className="px-4 lg:px-6">
        <ListRowSkeletonGroup />
      </div>
    </div>
  );
}
