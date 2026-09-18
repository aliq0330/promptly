import Link from "next/link";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  return (
    <div className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <LogIn size={22} />
      </div>
      <h1 className="text-lg font-semibold text-text">Giriş yap</h1>
      <p className="text-sm text-text-muted">
        Supabase Auth entegrasyonu henüz bağlanmadı — bu form yakında etkin
        hale gelecek.
      </p>
      <Button className="w-full" disabled>
        Giriş yap
      </Button>
      <p className="text-xs text-text-muted">
        Hesabın yok mu?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Kayıt ol
        </Link>
      </p>
    </div>
  );
}
