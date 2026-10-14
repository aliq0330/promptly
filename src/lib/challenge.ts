/**
 * Pure helpers for the weekly theme ("Haftalık tema", `public.weekly_challenges`,
 * migration 20260919870000) — framework-free so they can be unit-tested.
 */
export type ChallengeLanguage = "tr" | "en";
export type ChallengeStatus = "active" | "upcoming" | "ended";

export interface WeeklyChallenge {
  id: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  tagSlug: string;
  /** The tag's display label (joined from `tags`). */
  tagLabel: string;
  /** ISO timestamps. */
  startsAt: string;
  endsAt: string;
}

export function challengeStatus(challenge: Pick<WeeklyChallenge, "startsAt" | "endsAt">, now: Date): ChallengeStatus {
  const time = now.getTime();
  if (time < new Date(challenge.startsAt).getTime()) return "upcoming";
  if (time >= new Date(challenge.endsAt).getTime()) return "ended";
  return "active";
}

/** The theme to show: among the ACTIVE ones, the one that started most recently (null when none is running). */
export function pickActiveChallenge<T extends Pick<WeeklyChallenge, "startsAt" | "endsAt">>(challenges: T[], now: Date): T | null {
  const active = challenges.filter((challenge) => challengeStatus(challenge, now) === "active");
  if (active.length === 0) return null;
  return active.reduce((best, challenge) => (new Date(challenge.startsAt).getTime() > new Date(best.startsAt).getTime() ? challenge : best));
}

/** Title/description in the viewer's language, falling back to the other language when one is empty. */
export function localizeChallenge(challenge: WeeklyChallenge, language: ChallengeLanguage): { title: string; description: string } {
  const pick = (primary: string, fallback: string) => (primary.trim() ? primary : fallback);
  return language === "en"
    ? { title: pick(challenge.titleEn, challenge.titleTr), description: pick(challenge.descriptionEn, challenge.descriptionTr) }
    : { title: pick(challenge.titleTr, challenge.titleEn), description: pick(challenge.descriptionTr, challenge.descriptionEn) };
}

/** A new theme's default window: starts now (to the minute), runs 7 days. */
export function defaultChallengeWindow(now: Date): { startsAt: string; endsAt: string } {
  const start = new Date(now);
  start.setSeconds(0, 0);
  return { startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString() };
}

const pad = (value: number) => String(value).padStart(2, "0");

/** ISO instant → the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants, in the given timezone offset (minutes, as `Date#getTimezoneOffset`). */
export function toDateTimeLocalValue(iso: string, timezoneOffsetMinutes: number): string {
  const shifted = new Date(new Date(iso).getTime() - timezoneOffsetMinutes * 60_000);
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

/** `datetime-local` value (viewer's local time) → ISO instant, or null when it is empty/invalid. */
export function fromDateTimeLocalValue(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export interface ChallengeFormInput {
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  tagLabel: string;
  startsAt: string | null;
  endsAt: string | null;
}

export type ChallengeFormError = "title" | "description" | "tag" | "window";

/** Mirrors the database checks so the form can explain what is wrong before calling the RPC (the RPC stays the authority). */
export function validateChallengeForm(input: ChallengeFormInput): ChallengeFormError | null {
  const title = (value: string) => value.trim().length >= 1 && value.trim().length <= 80;
  if (!title(input.titleTr) || !title(input.titleEn)) return "title";
  if (input.descriptionTr.trim().length > 300 || input.descriptionEn.trim().length > 300) return "description";
  const tag = input.tagLabel.trim();
  if (tag.length < 1 || tag.length > 60 || /[<>]/.test(tag)) return "tag";
  if (!input.startsAt || !input.endsAt || new Date(input.endsAt).getTime() <= new Date(input.startsAt).getTime()) return "window";
  return null;
}
