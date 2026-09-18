import { Users } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { ListRowSkeletonGroup } from "@/components/ui/list-row-skeleton";

export default function FollowingPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Users}
        title="Takip ettiklerim"
        description="Takip ettiğin yaratıcıların listesi ve içerikleri burada gösterilecek."
      />
      <div className="px-4 lg:px-6">
        <ListRowSkeletonGroup />
      </div>
    </div>
  );
}
