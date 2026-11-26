"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Input, fieldLabelClassName } from "@/components/ui/field";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { imageSourceProblem } from "@/lib/image-processing";
import { renderInitialAvatar } from "@/lib/avatar-initial";
import {
  AVATAR_COLORS,
  avatarInitial,
  normalizeUsername,
  usernameCanFinish,
  usernameFormat,
  usernameStatus,
  usernameSuggestions,
  USERNAME_MAX,
  type UsernameCheck,
} from "@/lib/first-run-setup";
import { isUsernameTaken, updateOwnAvatarUrl, updateOwnUsername, uploadAvatar } from "@/lib/supabase/profiles";
import { cn } from "@/lib/utils";

type AvatarChoice = { kind: "color"; index: number } | { kind: "photo"; file: File; url: string };

/** How long typing must pause before the name is looked up (one request per pause, not per key). */
const CHECK_DELAY_MS = 350;

/**
 * Third step of the first-run setup (docs/history/427-*): username + profile picture. The database gave the new member a username at sign-up
 * (`handle_new_user`); it is shown here, prefilled, and checked live while they change it. The picture is a photo (`uploadAvatar`) or a coloured
 * initial drawn in the browser and uploaded the same way. "Bitir" saves what changed (username through `updateOwnUsername`, picture through
 * `uploadAvatar` + `updateOwnAvatarUrl`); a taken name or a failed upload keeps the member on this step with the reason.
 */
export function FirstRunProfileStep({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { profile, setProfile } = useOwnProfile();
  const current = profile?.username ?? "";
  const [username, setUsername] = useState(current);
  const [check, setCheck] = useState<UsernameCheck>("idle");
  const [choice, setChoice] = useState<AvatarChoice>({ kind: "color", index: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const photoUrl = choice.kind === "photo" ? choice.url : null;

  // The profile can arrive after this step opens: start from the real username once.
  const seeded = useRef(Boolean(current));
  useEffect(() => {
    if (!seeded.current && current) {
      seeded.current = true;
      setUsername(current);
    }
  }, [current]);

  useEffect(
    () => () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    },
    [photoUrl],
  );

  // Live "is it taken?" (debounced). The format is checked first and locally; own current name is never looked up.
  useEffect(() => {
    if (!user || usernameFormat(username) !== "valid" || username === current) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to look up: reset the check
      setCheck("idle");
      return;
    }
    setCheck("checking");
    let cancelled = false;
    const timer = setTimeout(() => {
      isUsernameTaken(username, user.id)
        .then((taken) => {
          if (!cancelled) setCheck(taken ? "taken" : "free");
        })
        .catch((err: unknown) => {
          console.error("first-run isUsernameTaken", err);
          if (!cancelled) setCheck("error");
        });
    }, CHECK_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [username, current, user]);

  const status = usernameStatus(username, check, current);
  const canFinish = usernameCanFinish(status) && !saving;
  const initial = avatarInitial(username || current);

  const pickPhoto = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      if (!file) return;
      const problem = imageSourceProblem(file);
      if (problem) {
        setError(problem);
        return;
      }
      setError(null);
      setChoice({ kind: "photo", file, url: URL.createObjectURL(file) });
    },
    [],
  );

  const message = useMemo(() => {
    switch (status) {
      case "empty":
        return { tone: "hint" as const, text: t("firstRun.usernameHint") };
      case "short":
        return { tone: "bad" as const, text: t("firstRun.usernameShort") };
      case "invalid":
        return { tone: "bad" as const, text: t("firstRun.usernameInvalid") };
      case "checking":
        return { tone: "hint" as const, text: t("firstRun.usernameChecking") };
      case "taken": {
        const [a, b] = usernameSuggestions(username);
        return { tone: "bad" as const, text: t("firstRun.usernameTaken", { name: `@${username}`, a, b }) };
      }
      default:
        return { tone: "good" as const, text: t("firstRun.usernameAvailable", { name: `@${username}` }) };
    }
  }, [status, username, t]);

  async function finish() {
    if (!user || !canFinish) return;
    setSaving(true);
    setError(null);
    try {
      let next = profile;
      if (username !== current) {
        await updateOwnUsername(user.id, username);
        if (next) next = { ...next, username };
      }
      const file = choice.kind === "photo" ? choice.file : await renderInitialAvatar(avatarInitial(username), AVATAR_COLORS[choice.index]);
      const url = await uploadAvatar(user.id, file);
      next = await updateOwnAvatarUrl(user.id, url);
      if (next) setProfile(next);
      onDone();
    } catch (err) {
      console.error("first-run profile save", err);
      setError(err instanceof Error && err.message ? err.message : t("firstRun.profileSaveFailed"));
      setSaving(false);
    }
  }

  const bigAvatar =
    choice.kind === "photo" ? (
      // eslint-disable-next-line @next/next/no-img-element -- yerel nesne adresi (kullanıcının seçtiği dosyanın önizlemesi)
      <img src={choice.url} alt={t("firstRun.photoAlt")} className="h-28 w-28 rounded-full object-cover ring-2 ring-border-soft sm:h-32 sm:w-32" />
    ) : (
      <span
        aria-hidden
        className="flex h-28 w-28 items-center justify-center rounded-full font-display text-display font-bold text-on-art sm:h-32 sm:w-32"
        style={{ backgroundColor: AVATAR_COLORS[choice.index] }}
      >
        {initial}
      </span>
    );

  return (
    <>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pt-5 sm:px-6">
        <h1 className="text-h1 text-text">{t("firstRun.profileTitle")}</h1>
        <p className="mt-2 text-body text-text-secondary">{t("firstRun.profileSubtitle")}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto grid w-full max-w-3xl gap-6 px-3 pb-6 pt-2 sm:px-6 md:grid-cols-3" data-first-run-profile>
          <div className="flex flex-col items-center gap-3 rounded-lg card-flat px-4 py-5 md:col-span-1">
            {bigAvatar}
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => fileInput.current?.click()} data-first-run-photo>
                {t("firstRun.uploadPhoto")}
              </Button>
              {choice.kind === "photo" && (
                <Button type="button" variant="ghost" size="sm" onClick={() => setChoice({ kind: "color", index: 0 })} data-first-run-photo-remove>
                  {t("firstRun.removePhoto")}
                </Button>
              )}
              <input ref={fileInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} onChange={pickPhoto} data-first-run-file />
            </div>
            <p className="text-label font-semibold text-text-secondary">{t("firstRun.pickColor")}</p>
            <div className="flex flex-wrap justify-center gap-2" role="group" aria-label={t("firstRun.pickColor")}>
              {AVATAR_COLORS.map((color, index) => {
                const selected = choice.kind === "color" && choice.index === index;
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setChoice({ kind: "color", index })}
                    aria-label={t("firstRun.colorN", { n: index + 1 })}
                    aria-pressed={selected}
                    data-first-run-color={index}
                    style={{ backgroundColor: color }}
                    className={cn(
                      "tap-area h-9 w-9 rounded-sm transition-shadow duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                      selected && "ring-2 ring-text ring-offset-2 ring-offset-surface",
                    )}
                  />
                );
              })}
            </div>
          </div>

          <div className="space-y-5 md:col-span-2">
            <div>
              <label htmlFor="first-run-username" className={fieldLabelClassName}>
                {t("firstRun.usernameLabel")}
              </label>
              <div className="relative">
                <span aria-hidden className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-body text-text-muted">
                  @
                </span>
                <Input
                  id="first-run-username"
                  value={username}
                  onChange={(event) => {
                    setError(null);
                    setUsername(normalizeUsername(event.target.value));
                  }}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  maxLength={USERNAME_MAX}
                  invalid={message.tone === "bad"}
                  aria-describedby="first-run-username-status"
                  className="pl-8"
                  data-first-run-username
                />
              </div>
              <p
                id="first-run-username-status"
                role="status"
                data-first-run-username-status={status}
                className={cn("mt-2 min-h-5 text-small font-medium", message.tone === "bad" ? "text-danger" : message.tone === "good" ? "text-success" : "text-text-muted")}
              >
                {message.text}
              </p>
            </div>

            <div>
              <p className="text-label font-semibold text-text-secondary">{t("firstRun.previewLabel")}</p>
              <div className="mt-2 flex items-center gap-3 rounded-lg card-flat px-4 py-3" data-first-run-preview>
                {choice.kind === "photo" ? (
                  // eslint-disable-next-line @next/next/no-img-element -- yerel nesne adresi
                  <img src={choice.url} alt="" className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <span aria-hidden className="flex h-14 w-14 items-center justify-center rounded-full text-h3 font-semibold text-on-art" style={{ backgroundColor: AVATAR_COLORS[choice.index] }}>
                    {initial}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate text-body font-semibold text-text">@{username || current}</p>
                  <p className="text-small text-text-muted">{t("firstRun.previewMeta")}</p>
                </div>
              </div>
            </div>

            {error && <InlineAlert data-first-run-profile-error>{error}</InlineAlert>}
          </div>
        </div>
      </div>
      <footer className="shrink-0 border-t border-border-soft bg-surface px-3 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-label font-semibold text-text-secondary" aria-live="polite" data-first-run-profile-hint>
            {canFinish || saving ? t("firstRun.profileReady") : t("firstRun.profileNeedName")}
          </p>
          <Button type="button" size="lg" disabled={!canFinish} onClick={() => void finish()} data-first-run-profile-finish>
            {saving ? t("firstRun.saving") : t("firstRun.finishProfile")}
          </Button>
        </div>
      </footer>
    </>
  );
}
