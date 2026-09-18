import { Sparkles } from "lucide-react";
import { FeedPlaceholderHeader } from "@/components/ui/feed-placeholder-header";
import { ListRowSkeletonGroup } from "@/components/ui/list-row-skeleton";

export default function RequestsPage() {
  return (
    <div className="space-y-6 pb-6">
      <FeedPlaceholderHeader
        icon={Sparkles}
        title="Prompt istekleri"
        description="Kullanıcıların yaratıcı prompt istekleri, filtreleri ve yanıt sayılarıyla burada listelenecek."
      />
      <div className="px-4 lg:px-6">
        <ListRowSkeletonGroup />
      </div>
    </div>
  );
}
