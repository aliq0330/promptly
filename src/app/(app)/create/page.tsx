import { PlusSquare } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function CreatePromptPage() {
  return (
    <PlaceholderPage
      icon={PlusSquare}
      title="Prompt oluştur"
      description="Başlık, açıklama, tam prompt metni, görsel yükleme ve etiketleme formu bu sayfada olacak."
    />
  );
}
