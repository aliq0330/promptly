"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Camera, X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useProfileOverrides } from "@/features/profile/profile-overrides-provider";
import { INTEREST_OPTIONS } from "@/features/profile/interest-options";
import { getUserById } from "@/mocks/users";
import { cn, resizeImageToDataUrl } from "@/lib/utils";

const BIO_MAX_LENGTH = 200;
const DISPLAY_NAME_MAX_LENGTH = 40;

/**
 * Real, working local edit form for the "me" mock account (CLAUDE.md
 * section 13) — persists via ProfileOverridesProvider (localStorage), the
 * same architecture as follow/like/save. There is no backend, so this is
 * honestly scoped: username is not editable (every profile route is
 * statically generated from it at build time; a real rename needs
 * server-side routing that only exists once Supabase Auth lands, CLAUDE.md
 * section 17), and there is no "saving failed" state to show because a
 * localStorage write cannot fail the way a network request can — showing a
 * fake error/retry path here would itself be dishonest.
 */
export default function EditProfilePage() {
  const router = useRouter();
  const me = getUserById("me")!;
  const { overrides, updateOverrides } = useProfileOverrides();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(overrides.displayName ?? me.displayName);
  const [bio, setBio] = useState(overrides.bio ?? me.bio ?? "");
  const [website, setWebsite] = useState(overrides.website ?? me.website ?? "");
  const [interests, setInterests] = useState<string[]>(overrides.interests ?? me.interests ?? []);
  const [avatarDataUrl, setAvatarDataUrl] = useState<string | null | undefined>(overrides.avatarDataUrl);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  const effectiveAvatar = avatarDataUrl !== undefined ? avatarDataUrl : me.avatarUrl;

  async function handleAvatarChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageToDataUrl(file);
      setAvatarDataUrl(dataUrl);
      setAvatarError(null);
    } catch {
      setAvatarError("Görsel yüklenemedi, lütfen başka bir dosya dene.");
    }
  }

  function toggleInterest(interest: string) {
    setInterests((prev) =>
      prev.includes(interest) ? prev.filter((item) => item !== interest) : [...prev, interest],
    );
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmedName = displayName.trim();
    if (!trimmedName) {
      setNameError("Görünen ad boş bırakılamaz.");
      return;
    }
    setNameError(null);

    updateOverrides({
      displayName: trimmedName,
      bio: bio.trim(),
      website: website.trim() || null,
      interests,
      avatarDataUrl,
    });
    router.push("/profile/me");
  }

  return (
    <div className="mx-auto max-w-xl px-4 py-6 lg:px-6">
      <h1 className="mb-1 text-lg font-semibold text-text">Profili Düzenle</h1>
      <p className="mb-6 text-sm text-text-muted">
        Değişiklikler bu tarayıcıda kalıcı olarak saklanır. Hesap senkronizasyonu Supabase Auth
        entegrasyonuna bağlıdır (bkz. CLAUDE.md Bölüm 17).
      </p>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="flex items-center gap-4">
          <Avatar src={effectiveAvatar} alt={displayName || me.displayName} size={72} />
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
              {effectiveAvatar && (
                <button
                  type="button"
                  onClick={() => setAvatarDataUrl(null)}
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
            {avatarError && <p className="text-xs text-red-500">{avatarError}</p>}
          </div>
        </div>

        <div>
          <label htmlFor="edit-username" className="mb-1.5 block text-sm font-medium text-text">
            Kullanıcı adı
          </label>
          <input
            id="edit-username"
            type="text"
            value={`@${me.username}`}
            disabled
            className="h-10 w-full rounded-md border border-border bg-accent-surface/40 px-3 text-sm text-text-muted"
          />
          <p className="mt-1 text-xs text-text-muted">
            Kullanıcı adı değişikliği henüz desteklenmiyor — her profil adresi bu ada göre statik
            olarak oluşturuluyor, gerçek destek Supabase bağlantısı gerektirir.
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
              nameError ? "border-red-500" : "border-border",
            )}
          />
          {nameError && <p className="mt-1 text-xs text-red-500">{nameError}</p>}
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

        <div className="flex gap-2 pt-2">
          <Button type="submit">Kaydet</Button>
          <Button type="button" variant="ghost" onClick={() => router.push("/profile/me")}>
            İptal
          </Button>
        </div>
      </form>
    </div>
  );
}
