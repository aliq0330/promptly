import { Settings } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function SettingsPage() {
  return (
    <PlaceholderPage
      icon={Settings}
      title="Hesap ayarları"
      description="Profil bilgileri, şifre, gizlilik ve bildirim tercihleri bu sayfada yönetilecek."
    />
  );
}
