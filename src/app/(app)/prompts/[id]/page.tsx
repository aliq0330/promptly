import { ImageIcon } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export function generateStaticParams() {
  return [{ id: "1" }];
}

export default function PromptDetailPage() {
  return (
    <PlaceholderPage
      icon={ImageIcon}
      title="Prompt detayı"
      description="Görsel, tam prompt metni, etiketler, remix zinciri ve yorumlar bu sayfada gösterilecek."
    />
  );
}
