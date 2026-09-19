"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MailCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import { absoluteUrl } from "@/lib/utils";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Real Supabase Auth sign-up. Collects email/password/display name;
 * `handle_new_user` (a database trigger, see `supabase/migrations`)
 * creates the real `profiles` row automatically once `auth.users` gets a
 * new row, reading the display name back out of `user_metadata`.
 */
export default function SignupPage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkEmail, setCheckEmail] = useState(false);

  useEffect(() => {
    if (!authLoading && session) router.replace("/");
  }, [authLoading, session, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { display_name: displayName },
          emailRedirectTo: absoluteUrl("/login"),
        },
      });

      if (signUpError) {
        setError(translateAuthError(signUpError.message));
        return;
      }

      // With email confirmation enabled (this project's default), signUp
      // returns a user but no session yet — nothing to redirect into.
      if (data.session) {
        router.push("/");
      } else {
        setCheckEmail(true);
      }
    } catch {
      // A real network failure throws instead of resolving — see login/page.tsx's comment.
      setError("Bağlantı kurulamadı, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (checkEmail) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
          <MailCheck size={22} />
        </div>
        <h1 className="text-lg font-semibold text-text">E-postanı kontrol et</h1>
        <p className="text-sm text-text-muted">
          <strong className="text-text">{email}</strong> adresine bir doğrulama bağlantısı
          gönderdik. Hesabını etkinleştirmek için bağlantıya tıkla, sonra giriş yapabilirsin.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Giriş sayfasına dön
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <UserPlus size={22} />
      </div>
      <h1 className="text-lg font-semibold text-text">Kayıt ol</h1>

      <div className="w-full space-y-3 text-left">
        <div>
          <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-text">
            Görünen ad
          </label>
          <input
            id="signup-name"
            type="text"
            required
            maxLength={40}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
        <div>
          <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-text">
            E-posta
          </label>
          <input
            id="signup-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
        <div>
          <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-text">
            Şifre
          </label>
          <input
            id="signup-password"
            type="password"
            required
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
          <p className="mt-1 text-xs text-text-muted">En az {PASSWORD_MIN_LENGTH} karakter.</p>
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Hesap oluşturuluyor..." : "Hesap oluştur"}
      </Button>
      <p className="text-xs text-text-muted">
        Zaten hesabın var mı?{" "}
        <Link href="/login" className="text-primary hover:underline">
          Giriş yap
        </Link>
      </p>
    </form>
  );
}
