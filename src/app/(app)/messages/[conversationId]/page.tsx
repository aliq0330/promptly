import { MessageCircle } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export function generateStaticParams() {
  return [{ conversationId: "1" }];
}

export default function ConversationPage() {
  return (
    <PlaceholderPage
      icon={MessageCircle}
      title="Konuşma"
      description="Mesaj geçmişi ve mesaj yazma alanı bu sayfada olacak."
    />
  );
}
