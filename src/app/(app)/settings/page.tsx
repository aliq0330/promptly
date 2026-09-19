"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { LogIn, LogOut, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { supabase } from "@/lib/supabase/client";
import { translateAuthError } from "@/features/auth/auth-errors";

const PASSWORD_MIN_LENGTH = 6;

/**
 * Real account settings (CLAUDE.md section 17) — shows the actual
 * Supabase-authenticated user's email, a genuinely working password
 * change, and sign out. Everything else CLAUDE.md's settings description
 * mentions (profile info, gizlilik, bildirim tercihleri) is intentionally
 * NOT here yet: profile fields belong to the "me" mock persona (see
 * /profile/edit, CLAUDE.md section 12) and aren't tied to a real account
 * until a `profiles` table + section 21's wiring exist. Mixing the two now
 * would misrepresent which parts are real.
 */
export default function SettingsPage() {
  const { user, loading } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleChangePassword(event: FormEvent) {
    event.preventDefault();
    if (isSubmitting) return;
    setError(null);
    setSuccess(false);

    if (password.length < PASSWORD_MIN_LENGTH) {
      setError(`Şifre en az ${PASSWORD_MIN_LENGTH} karakter olmalı.`);
      return;
    }
    if (password !== confirmPassword) {
      setError("Şifreler eşleşmiyor.");
      return;
    }

    setIsSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsSubmitting(false);

    if (updateError) {
      setError(translateAuthError(updateError.message));
      return;
    }
    setPassword("");
    setConfirmPassword("");
    setSuccess(true);
  }

  async function handleSignOut() {
    setIsSigningOut(true);
    await supabase.auth.signOut();
  }

  if (loading) return null;

  if (!user) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-accent-surface text-primary">
          <Settings size={28} />
        </div>
        <h1 className="text-lg font-semibold text-text">Hesap ayarları</h1>
        <p className="max-w-sm text-sm text-text-muted">
          Hesap ayarlarını görebilmek için giriş yapmalısın.
        </p>
        <Link
          href="/login"
          className="mt-2 inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          <LogIn size={14} />
          Giriş yap
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">Hesap ayarları</h1>
      <p className="mb-6 text-sm text-text-muted">
        Profil bilgileri (görünen ad, biyografi, ilgi alanları) için{" "}
        <Link href="/profile/edit" className="text-primary hover:underline">
          Profili Düzenle
        </Link>{" "}
        sayfasını kullan — burada yalnızca gerçek hesap bilgilerin var.
      </p>

      <div className="space-y-6">
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-text-muted">
            E-posta
          </p>
          <p className="text-sm text-text">{user.email}</p>
        </div>

        <form onSubmit={handleChangePassword} className="space-y-3 rounded-lg border border-border bg-surface p-4">
          <p className="text-sm font-medium text-text">Şifre değiştir</p>
          <div>
            <label htmlFor="settings-password" className="mb-1.5 block text-sm text-text-muted">
              Yeni şifre
            </label>
            <input
              id="settings-password"
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          <div>
            <label htmlFor="settings-confirm-password" className="mb-1.5 block text-sm text-text-muted">
              Yeni şifre (tekrar)
            </label>
            <input
              id="settings-confirm-password"
              type="password"
              required
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          {success && <p className="text-sm text-primary">Şifren güncellendi.</p>}
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? "Güncelleniyor..." : "Şifreyi güncelle"}
          </Button>
        </form>

        <Button type="button" variant="outline" onClick={handleSignOut} disabled={isSigningOut}>
          <LogOut size={14} />
          {isSigningOut ? "Çıkış yapılıyor..." : "Çıkış yap"}
        </Button>
      </div>
    </div>
  );
}
