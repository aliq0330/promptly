import { Compass } from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { DiscoverFeed } from "@/features/feed/discover-feed";

export default function DiscoverPage() {
  return (
    <PageContainer className="space-y-6">
      <PageHeader
        eyebrow="Keşfet"
        icon={Compass}
        title="Promptları, generatorları ve yaratıcıları keşfet"
        description="Trend etiketlere göz at, içerik türüne göre filtrele, topluluğun en yeni paylaşımlarını bul."
      />
      <DiscoverFeed />
    </PageContainer>
  );
}
