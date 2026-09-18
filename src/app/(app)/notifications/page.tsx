import { Bell } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { ListRowSkeletonGroup } from "@/components/ui/list-row-skeleton";

export default function NotificationsPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Bell}
        title="Bildirimler"
        description="Takip, beğeni, yorum, remix ve mesaj bildirimlerin burada listelenecek."
      />
      <div className="px-4 lg:px-6">
        <ListRowSkeletonGroup />
      </div>
    </div>
  );
}
