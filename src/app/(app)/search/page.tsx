import { Search } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function SearchPage() {
  return (
    <PlaceholderPage
      icon={Search}
      title="Arama"
      description="Prompt, kullanıcı, etiket ve prompt isteği arama sonuçları bu sayfada gösterilecek."
    />
  );
}
