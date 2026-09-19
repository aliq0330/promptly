"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";

/**
 * Real Supabase Auth sign-in (CLAUDE.md section 17) — genuinely
 * authenticates against the connected Supabase project, not mock data.
 */
export default function LoginPage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Already signed in — a login form has nothing to do here.
  useEffect(() => {
    if (!authLoading && session) router.replace("/");
  }, [authLoading, session, router]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    setIsSubmitting(false);
    if (signInError) {
      setError(translateAuthError(signInError.message));
      return;
    }
    router.push("/");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <LogIn size={22} />
      </div>
      <h1 className="text-lg font-semibold text-text">Giriş yap</h1>

      <div className="w-full space-y-3 text-left">
        <div>
          <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-text">
            E-posta
          </label>
          <input
            id="login-email"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="login-password" className="block text-sm font-medium text-text">
              Şifre
            </label>
            <Link href="/reset-password" className="text-xs text-primary hover:underline">
              Şifreni mi unuttun?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Giriş yapılıyor..." : "Giriş yap"}
      </Button>
      <p className="text-xs text-text-muted">
        Hesabın yok mu?{" "}
        <Link href="/signup" className="text-primary hover:underline">
          Kayıt ol
        </Link>
      </p>
    </form>
  );
}
