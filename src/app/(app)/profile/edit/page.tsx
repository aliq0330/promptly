"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { INTEREST_OPTIONS } from "@/features/profile/interest-options";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { updateOwnProfile, uploadAvatar } from "@/lib/supabase/profiles";
import { cn, profileHref } from "@/lib/utils";

const BIO_MAX_LENGTH = 200;
const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Real, working profile editor — edits the signed-in user's real `profiles`
 * row (`updateOwnProfile`) and, if a new photo was picked, really uploads
 * it to the `avatars` Storage bucket (Bölüm 20): genuinely persisted,
 * visible to every visitor. Username is not editable: Supabase itself has
 * no username-rename flow wired up yet.
 */
export default function EditProfilePage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { profile: ownProfile, loading: ownProfileLoading, setProfile: setOwnProfile } = useOwnProfile();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [website, setWebsite] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [synced, setSynced] = useState(false);

  // The form's `useState`s above start empty, before the real profile has
  // necessarily finished loading — this effect seeds the form the first
  // time it becomes available.
  useEffect(() => {
    if (!ownProfile || synced) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time seed of the form from the real profile once it loads, not a cascading update
    setDisplayName(ownProfile.displayName);
    setBio(ownProfile.bio ?? "");
    setWebsite(ownProfile.website ?? "");
    setInterests(ownProfile.interests ?? []);
    setAvatarUrl(ownProfile.avatarUrl);
    setSynced(true);
  }, [ownProfile, synced]);

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setAvatarUrl(URL.createObjectURL(file));
    setAvatarFile(file);
    setAvatarError(null);
  }

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((item) => item !== interest) : [...prev, interest],
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError("Görünen ad boş bırakılamaz.");
      return;
    }
    setNameError(null);
    if (!user || !ownProfile) return;

    setSaveError(null);
    setIsSaving(true);
    try {
      let uploadedAvatarUrl: string | null | undefined;
      if (avatarFile) {
        uploadedAvatarUrl = await uploadAvatar(user.id, avatarFile);
      } else if (avatarUrl === null) {
        uploadedAvatarUrl = null;
      }
      const updated = await updateOwnProfile(user.id, {
        displayName: trimmedName,
        bio: bio.trim() || null,
        website: website.trim() || null,
        interests,
        avatarUrl: uploadedAvatarUrl,
      });
      setOwnProfile(updated);
      router.push(profileHref(updated));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Profil kaydedilemedi, lütfen tekrar dene.");
      setIsSaving(false);
    }
  }

  if (authLoading || (user && ownProfileLoading)) {
    return (
      <div className="mx-auto max-w-xl px-4 py-16 text-center text-sm text-text-muted">Yükleniyor…</div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="mb-2 text-h2 font-semibold text-text">Giriş yapmalısın</h1>
        <p className="mb-4 text-sm text-text-muted">Profilini düzenlemek için önce giriş yapmalısın.</p>
        <Link
          href="/login"
          className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary-dark"
        >
          Giriş Yap
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-3 py-5 sm:px-5 sm:py-6 lg:px-8 lg:py-8">
      <h1 className="mb-1 text-h1 font-semibold text-text">Profili Düzenle</h1>
      <p className="mb-6 text-sm text-text-muted">
        Değişiklikler gerçekten, kalıcı olarak kaydedilir ve her ziyaretçiye görünür olur.
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar src={avatarUrl} alt={displayName || "Sen"} size={72} />
          <div className="space-y-1.5">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-9 items-center gap-1.5 rounded-md border border-border bg-transparent px-3 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
              >
                <Camera size={14} />
                Fotoğraf değiştir
              </button>
              {avatarUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setAvatarUrl(null);
                    setAvatarFile(null);
                  }}
                  className="flex h-9 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
                >
                  <X size={14} />
                  Kaldır
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarChange}
              className="hidden"
            />
            {avatarError && <p className="text-xs text-danger">{avatarError}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="edit-username" className="mb-1.5 block text-sm font-medium text-text">
            Kullanıcı adı
          </label>
          <input
            id="edit-username"
            type="text"
            value={`@${ownProfile?.username ?? ""}`}
            disabled
            className="h-10 w-full rounded-md border border-border bg-accent-surface/40 px-3 text-sm text-text-muted"
          />
          <p className="mt-1 text-xs text-text-muted">
            Kullanıcı adı değişikliği henüz desteklenmiyor.
          </p>
        </div>

        <div>
          <label htmlFor="edit-display-name" className="mb-1.5 block text-sm font-medium text-text">
            Görünen ad
          </label>
          <input
            id="edit-display-name"
            type="text"
            required
            maxLength={DISPLAY_NAME_MAX_LENGTH}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            className={cn(
              "h-10 w-full rounded-md border bg-background px-3 text-sm text-text",
              nameError ? "border-danger" : "border-border",
            )}
          />
          {nameError && <p className="mt-1 text-xs text-danger">{nameError}</p>}
        </div>

        <div>
          <label htmlFor="edit-bio" className="mb-1.5 flex items-center justify-between text-sm font-medium text-text">
            Biyografi
            <span className="text-xs font-normal text-text-muted">
              {bio.length}/{BIO_MAX_LENGTH}
            </span>
          </label>
          <textarea
            id="edit-bio"
            rows={3}
            maxLength={BIO_MAX_LENGTH}
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            placeholder="Kendini ve yaratıcı çalışmalarını kısaca tanıt."
            className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
          />
        </div>

        <div>
          <label htmlFor="edit-website" className="mb-1.5 block text-sm font-medium text-text">
            Web sitesi <span className="text-text-muted">(opsiyonel)</span>
          </label>
          <input
            id="edit-website"
            type="text"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
            placeholder="ornek.com"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>

        <div>
          <label className="mb-2 block text-sm font-medium text-text">Yaratıcı İlgi Alanları</label>
          <div className="flex flex-wrap gap-1.5">
            {INTEREST_OPTIONS.map((interest) => {
              const active = interests.includes(interest);
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-surface text-text-muted hover:text-text",
                  )}
                >
                  {interest}
                </button>
              );
            })}
          </div>
        </div>

        {saveError && <p className="text-sm text-danger">{saveError}</p>}

        <div className="flex gap-2 pt-2">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => router.push(ownProfile ? profileHref(ownProfile) : "/")}
          >
            İptal
          </Button>
        </div>
      </form>
    </div>
  );
}
