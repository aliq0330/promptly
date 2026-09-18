import { Bookmark } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function SavedPage() {
  return (
    <PlaceholderPage
      icon={Bookmark}
      title="Kaydedilenler"
      description="Kaydettiğin promptlar yalnızca sana özel olarak burada listelenecek."
    />
  );
}
