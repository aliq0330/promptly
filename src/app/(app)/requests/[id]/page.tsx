import { Sparkles } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export function generateStaticParams() {
  return [{ id: "1" }];
}

export default function RequestDetailPage() {
  return (
    <PlaceholderPage
      icon={Sparkles}
      title="Prompt isteği detayı"
      description="İstek ayrıntıları, yaratıcı yanıtlar ve yeni yanıt oluşturma formu bu sayfada olacak."
    />
  );
}
