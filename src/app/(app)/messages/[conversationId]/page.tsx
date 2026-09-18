import { MessageCircle } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function ConversationPage() {
  return (
    <PlaceholderPage
      icon={MessageCircle}
      title="Konuşma"
      description="Mesaj geçmişi ve mesaj yazma alanı bu sayfada olacak."
    />
  );
}
