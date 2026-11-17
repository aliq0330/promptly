"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BrandWordmark } from "@/components/layout/brand-mark";
import { Check } from "@/components/icons/check";
import { Loader2 } from "@/components/icons/loader-2";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { PersonRow } from "@/components/ui/person-row";
import { FollowButtonView } from "@/features/profile/follow-button";
import { useFollowState } from "@/features/profile/use-follow-state";
import { INTEREST_OPTION_LABELS } from "@/features/profile/interest-options";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { FIRST_RUN_MAX_TOPICS, FIRST_RUN_MIN_TOPICS, FIRST_RUN_SUGGESTED_FOLLOWS, toggleTopic, topicProgress } from "@/lib/first-run-setup";
import { fetchSuggestedCreators, type SuggestedCreator } from "@/lib/supabase/creator-suggestions";
import { updateOwnInterests } from "@/lib/supabase/profiles";
import { cn, profileHref, publicAssetUrl } from "@/lib/utils";
import { FIRST_RUN_TOPICS, topicImagePaths, type FirstRunTopic } from "./first-run-topics";

type Step = "topics" | "people" | "building";

/** The "Özel akışın oluşturuluyor" screen is short on purpose: it only covers the moment the feed re-ranks on the new topics. */
const BUILDING_TICK_MS = 900;
const BUILDING_TICKS = 3;

/**
 * First-run setup (docs/history/424-*): a brand-new account must pick at least two topics before anything else of the site is usable.
 * Three steps on one full page — topics (required, each a row of three pictures that fit the title), people to follow (optional,
 * the existing `suggest_creators` ranking) and a short "building your feed" screen. There is no close button, no Esc and no skip on
 * the topics step; the only way out besides finishing is signing out. The topics are saved the moment the first step is left
 * (`profiles.interests`, the same column the profile editor and "Sana özel" read), so a reload in the middle never loses them.
 */
export function FirstRunSetup({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const { user, signOut } = useAuth();
  const { setProfile } = useOwnProfile();
  const [step, setStep] = useState<Step>("topics");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [followed, setFollowed] = useState<ReadonlySet<string>>(() => new Set());

  const progress = topicProgress(picked.length);
  const stepNumber = step === "topics" ? 1 : 2;

  const saveTopics = useCallback(async () => {
    if (!user || saving || !topicProgress(picked.length).canContinue) return;
    setSaving(true);
    setFailed(false);
    try {
      setProfile(await updateOwnInterests(user.id, picked));
      setStep("people");
    } catch (err) {
      console.error("first-run updateOwnInterests", err);
      setFailed(true);
    } finally {
      setSaving(false);
    }
  }, [user, saving, picked, setProfile]);

  const onFollowChange = useCallback((id: string, isFollowing: boolean) => {
    setFollowed((prev) => {
      if (prev.has(id) === isFollowing) return prev;
      const next = new Set(prev);
      if (isFollowing) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  if (step === "building") return <BuildingScreen topics={picked} onDone={onDone} />;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-text" data-first-run-setup>
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border-soft px-3 py-2 sm:px-6">
        <BrandWordmark className="text-h2" />
        <div className="flex items-center gap-2">
          <span className="text-small text-text-muted">{t("firstRun.stepLabel", { current: stepNumber, total: 2 })}</span>
          <Button type="button" variant="ghost" size="sm" onClick={() => void signOut()} data-first-run-signout>
            {t("settings.signOut")}
          </Button>
        </div>
      </header>

      {step === "topics" ? (
        <>
          <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pt-5 sm:px-6">
            <h1 className="text-h1 text-text">{t("firstRun.topicsTitle")}</h1>
            <p className="mt-2 text-body text-text-secondary">{t("firstRun.topicsSubtitle")}</p>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="mx-auto grid w-full max-w-3xl gap-3 px-3 pb-6 pt-1 sm:grid-cols-2 sm:px-6">
              {FIRST_RUN_TOPICS.map((topic) => (
                <TopicRow
                  key={topic.value}
                  topic={topic}
                  selected={picked.includes(topic.value)}
                  atMax={picked.length >= FIRST_RUN_MAX_TOPICS}
                  onToggle={() => setPicked((prev) => toggleTopic(prev, topic.value))}
                />
              ))}
            </div>
          </div>
          <footer className="shrink-0 border-t border-border-soft bg-surface px-3 py-3 sm:px-6">
            <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-label font-semibold text-text-secondary" aria-live="polite" data-first-run-hint>
                  {progress.canContinue
                    ? t("firstRun.good")
                    : picked.length === 0
                      ? t("firstRun.needMin", { count: FIRST_RUN_MIN_TOPICS })
                      : t("firstRun.needMore", { count: progress.missing })}
                </p>
                {failed && (
                  <InlineAlert className="mt-2" data-first-run-error>
                    {t("firstRun.saveFailed")}
                  </InlineAlert>
                )}
              </div>
              <Button type="button" size="lg" disabled={!progress.canContinue || saving} onClick={() => void saveTopics()} data-first-run-next>
                {saving ? t("firstRun.saving") : t("firstRun.next")}
              </Button>
            </div>
          </footer>
        </>
      ) : (
        <PeopleStep followedCount={followed.size} onFollowChange={onFollowChange} onFinish={() => setStep("building")} />
      )}
    </div>
  );
}

function TopicRow({ topic, selected, atMax, onToggle }: { topic: FirstRunTopic; selected: boolean; atMax: boolean; onToggle: () => void }) {
  const { t } = useTranslation();
  const label = t(INTEREST_OPTION_LABELS[topic.value]);
  const images = topicImagePaths(topic);
  const blocked = atMax && !selected;
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      aria-disabled={blocked || undefined}
      data-first-run-topic={topic.slug}
      className={cn(
        "block w-full overflow-hidden rounded-lg border-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected ? "border-primary bg-primary text-primary-foreground" : "border-border-soft bg-surface text-text hover:border-border-strong",
        blocked && "opacity-60",
      )}
    >
      {images.length > 0 ? (
        <span className="grid grid-cols-3">
          {images.map((path) => (
            // eslint-disable-next-line @next/next/no-img-element -- statik dışa aktarma: next/image sunucusu yok, dosyalar zaten küçük (560×420) JPEG
            <img key={path} src={publicAssetUrl(path)} alt="" loading="lazy" draggable={false} className="h-24 w-full object-cover sm:h-28" />
          ))}
        </span>
      ) : (
        <span className={cn("block h-12 w-full sm:h-14", selected ? "bg-primary-hover" : "bg-primary-soft")} aria-hidden />
      )}
      <span className="flex min-h-14 items-center justify-between gap-3 px-4 py-2">
        <span className="min-w-0 font-display text-body font-bold leading-tight">{label}</span>
        {selected ? (
          <span className="flex shrink-0 items-center gap-2 text-small font-semibold">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-surface text-primary" aria-hidden>
              <Check size={12} />
            </span>
            {t("firstRun.followed")}
          </span>
        ) : (
          <span className="h-5 w-5 shrink-0 rounded-full border-2 border-border-strong" aria-hidden />
        )}
      </span>
    </button>
  );
}

/** Optional second step: people the server already ranks for this viewer (`suggest_creators`); following is the existing follow button. */
function PeopleStep({
  followedCount,
  onFollowChange,
  onFinish,
}: {
  followedCount: number;
  onFollowChange: (id: string, isFollowing: boolean) => void;
  onFinish: () => void;
}) {
  const { t } = useTranslation();
  const [people, setPeople] = useState<SuggestedCreator[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchSuggestedCreators(12)
      .then((found) => {
        if (!cancelled) setPeople(found.slice(0, 8));
      })
      .catch((err: unknown) => {
        console.error("first-run fetchSuggestedCreators", err);
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const reachedGoal = followedCount >= FIRST_RUN_SUGGESTED_FOLLOWS;
  return (
    <>
      <div className="mx-auto w-full max-w-3xl shrink-0 px-3 pb-3 pt-5 sm:px-6">
        <h1 className="text-h1 text-text">{t("firstRun.peopleTitle")}</h1>
        <p className="mt-2 text-body text-text-secondary">{t("firstRun.peopleSubtitle", { count: FIRST_RUN_SUGGESTED_FOLLOWS })}</p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-3 pb-6 sm:px-6" data-first-run-people>
          {people === null && !loadFailed && (
            <p role="status" className="py-8 text-center text-small text-text-muted">
              {t("common.loading")}
            </p>
          )}
          {loadFailed && (
            <div className="space-y-3 py-6 text-center">
              <InlineAlert>{t("firstRun.peopleLoadFailed")}</InlineAlert>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setLoadFailed(false);
                  setPeople(null);
                  setAttempt((n) => n + 1);
                }}
              >
                {t("common.retry")}
              </Button>
            </div>
          )}
          {people !== null && people.length === 0 && <p className="py-8 text-center text-small text-text-muted">{t("firstRun.peopleEmpty")}</p>}
          {people !== null && people.length > 0 && (
            <ul className="divide-y divide-border-soft">
              {people.map((candidate) => (
                <li key={candidate.profile.id}>
                  <SuggestedPerson candidate={candidate} onFollowChange={onFollowChange} />
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
      <footer className="shrink-0 border-t border-border-soft bg-surface px-3 py-3 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-label font-semibold text-text-secondary" aria-live="polite" data-first-run-follow-hint>
            {reachedGoal ? t("firstRun.followDone", { count: followedCount }) : t("firstRun.followProgress", { count: followedCount, total: FIRST_RUN_SUGGESTED_FOLLOWS })}
          </p>
          <Button type="button" size="lg" onClick={onFinish} variant={reachedGoal ? "primary" : "outline"} data-first-run-finish>
            {followedCount > 0 ? t("firstRun.finish") : t("firstRun.skipPeople")}
          </Button>
        </div>
      </footer>
    </>
  );
}

function SuggestedPerson({ candidate, onFollowChange }: { candidate: SuggestedCreator; onFollowChange: (id: string, isFollowing: boolean) => void }) {
  const { profile } = candidate;
  const state = useFollowState(profile);
  const { isFollowing } = state;
  useEffect(() => {
    onFollowChange(profile.id, isFollowing);
  }, [profile.id, isFollowing, onFollowChange]);
  return (
    <PersonRow
      name={profile.displayName}
      username={profile.username}
      avatarUrl={profile.avatarUrl}
      sub={profile.bio ? <span className="line-clamp-1">{profile.bio}</span> : undefined}
      href={profileHref(profile)}
      right={<FollowButtonView {...state} size="md" />}
      className="py-3"
      data-first-run-person={profile.id}
    />
  );
}

/** "Özel akışın oluşturuluyor": a few seconds, one chosen topic named at a time; then the app opens on the freshly ranked feed. */
function BuildingScreen({ topics, onDone }: { topics: string[]; onDone: () => void }) {
  const { t } = useTranslation();
  const [tick, setTick] = useState(0);
  const labels = useMemo(
    () => topics.map((value) => (value in INTEREST_OPTION_LABELS ? t(INTEREST_OPTION_LABELS[value as keyof typeof INTEREST_OPTION_LABELS]) : value)),
    [topics, t],
  );

  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 1; i <= BUILDING_TICKS; i += 1) {
      timers.push(
        setTimeout(() => {
          if (i < BUILDING_TICKS) setTick(i);
          else onDone();
        }, i * BUILDING_TICK_MS),
      );
    }
    return () => timers.forEach(clearTimeout);
  }, [onDone]);

  const topic = labels.length > 0 ? labels[tick % labels.length] : t("firstRun.buildingPopular");
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh flex-col items-center justify-center gap-5 bg-background px-6 text-center text-text" data-first-run-building>
      <Loader2 size={24} className="animate-spin" aria-hidden />
      <h1 className="text-display text-text">{t("firstRun.buildingTitle")}</h1>
      <p className="text-body text-text-secondary">{t("firstRun.building", { topic })}</p>
    </div>
  );
}
