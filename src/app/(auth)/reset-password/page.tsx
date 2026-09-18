import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function ResetPasswordPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <KeyRound size={22} />
      </div>
      <h1 className="text-lg font-semibold text-text">Şifreni sıfırla</h1>
      <p className="text-sm text-text-muted">
        Supabase Auth entegrasyonu henüz bağlanmadı — bu form yakında etkin
        hale gelecek.
      </p>
      <Button className="w-full" disabled>
        Sıfırlama bağlantısı gönder
      </Button>
    </div>
  );
}
