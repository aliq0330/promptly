import { MessageCircle } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function MessagesPage() {
  return (
    <PlaceholderPage
      icon={MessageCircle}
      title="Mesajlar"
      description="Konuşma listen ve yeni konuşma başlatma seçeneği bu sayfada olacak."
    />
  );
}
