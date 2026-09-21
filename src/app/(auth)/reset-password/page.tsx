"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";
import { absoluteUrl } from "@/lib/utils";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Two real modes in one page (CLAUDE.md section 17):
 *  1. Request a reset link (email → supabase.auth.resetPasswordForEmail).
 *  2. Set a new password — shown automatically once the user arrives back
 *     here via that email's link, which Supabase's client library detects
 *     from the URL and turns into a PASSWORD_RECOVERY auth event
 *     (see AuthProvider). Note for whoever configures the Supabase
 *     project: its Authentication → URL Configuration redirect allow-list
 *     needs this app's `/reset-password` URL added, or the email link will
 *     be rejected.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { isPasswordRecovery, clearPasswordRecovery, loading: authLoading } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  async function handleRequestLink(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setIsSubmitting(true);

    try {
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: absoluteUrl("/reset-password"),
      });
      if (resetError) {
        setError(translateAuthError(resetError.message));
        return;
      }
      setLinkSent(true);
    } catch {
      // A real network failure throws instead of resolving — see login/page.tsx's comment.
      setError("Bağlantı kurulamadı, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdatePassword(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(translateAuthError(updateError.message));
        return;
      }
      clearPasswordRecovery();
      setPasswordUpdated(true);
    } catch {
      // A real network failure throws instead of resolving — see login/page.tsx's comment.
      setError("Bağlantı kurulamadı, lütfen tekrar dene.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (authLoading) return null;

  if (passwordUpdated) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
          <CheckCircle2 size={22} />
        </div>
        <h1 className="text-lg font-semibold text-text">Şifren güncellendi</h1>
        <Button className="w-full" onClick={() => router.push("/")}>
          Ana sayfaya git
        </Button>
      </div>
    );
  }

  if (isPasswordRecovery) {
    return (
      <form onSubmit={handleUpdatePassword} className="flex flex-col items-center gap-4 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
          <KeyRound size={22} />
        </div>
        <h1 className="text-lg font-semibold text-text">Yeni şifre belirle</h1>

        <div className="w-full space-y-3 text-left">
          <div>
            <label htmlFor="new-password" className="mb-1.5 block text-sm font-medium text-text">
              Yeni şifre
            </label>
            <input
              id="new-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          <div>
            <label htmlFor="confirm-password" className="mb-1.5 block text-sm font-medium text-text">
              Yeni şifre (tekrar)
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Güncelleniyor..." : "Şifreyi güncelle"}
        </Button>
      </form>
    );
  }

  if (linkSent) {
    return (
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
          <CheckCircle2 size={22} />
        </div>
        <h1 className="text-lg font-semibold text-text">Bağlantı gönderildi</h1>
        <p className="text-sm text-text-muted">
          <strong className="text-text">{email}</strong> adresine bir şifre sıfırlama bağlantısı
          gönderdik.
        </p>
        <Link href="/login" className="text-sm font-medium text-primary hover:underline">
          Giriş sayfasına dön
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleRequestLink} className="flex flex-col items-center gap-4 py-4 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent-surface text-primary">
        <KeyRound size={22} />
      </div>
      <h1 className="text-lg font-semibold text-text">Şifreni sıfırla</h1>
      <p className="text-sm text-text-muted">
        E-posta adresini gir, sana bir sıfırlama bağlantısı gönderelim.
      </p>

      <div className="w-full text-left">
        <label htmlFor="reset-email" className="mb-1.5 block text-sm font-medium text-text">
          E-posta
        </label>
        <input
          id="reset-email"
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Gönderiliyor..." : "Sıfırlama bağlantısı gönder"}
      </Button>
      <Link href="/login" className="text-xs text-primary hover:underline">
        Giriş sayfasına dön
      </Link>
    </form>
  );
}
