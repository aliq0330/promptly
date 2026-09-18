import { User } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export default function ProfilePage() {
  return (
    <PlaceholderPage
      icon={User}
      title="Profil"
      description="Kullanıcı bilgileri, promptlar, remixler ve istek yanıtları sekmeleri bu sayfada olacak."
    />
  );
}
