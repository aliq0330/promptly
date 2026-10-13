"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bookmark, Compass, Play, Sparkles, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "promptly-tour-seen";
const OPEN_EVENT = "promptly:open-tour";

interface TourStep {
  icon: LucideIcon;
  title: TranslationKey;
  body: TranslationKey;
}

const STEPS: TourStep[] = [
  { icon: Compass, title: "tour.step1Title", body: "tour.step1Body" },
  { icon: Play, title: "tour.step2Title", body: "tour.step2Body" },
  { icon: Sparkles, title: "tour.step3Title", body: "tour.step3Body" },
  { icon: Bookmark, title: "tour.step4Title", body: "tour.step4Body" },
];

function readSeen(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return true; // storage blocked: never nag
  }
}

function markSeen() {
  try {
    window.localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* storage blocked — the tour just may show again */
  }
}

/** Lets any screen (Settings) reopen the tour on demand. */
export function openWelcomeTour() {
  window.dispatchEvent(new Event(OPEN_EVENT));
}

/**
 * First-visit tour: four short steps about the core loop (find, copy/run,
 * create, save). Auto-opens once, only on the home page and only after auth
 * has resolved, so it never covers a deep link someone followed. Skipping or
 * finishing both count as "seen". Reopenable from Settings.
 */
export function WelcomeTour() {
  const { t } = useTranslation();
  const { loading } = useAuth();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    function handleOpen() {
      setStep(0);
      setOpen(true);
    }
    window.addEventListener(OPEN_EVENT, handleOpen);
    return () => window.removeEventListener(OPEN_EVENT, handleOpen);
  }, []);

  const isHome = pathname === "/" || pathname === "";
  useEffect(() => {
    if (loading || !isHome || readSeen()) return;
    const timer = setTimeout(() => {
      setStep(0);
      setOpen(true);
    }, 900);
    return () => clearTimeout(timer);
  }, [loading, isHome]);

  function close() {
    markSeen();
    setOpen(false);
  }

  if (!open) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const Icon = current.icon;

  return (
    <Modal onClose={close} labelledBy="tour-title">
      <div className="w-full max-w-md rounded-xl border border-border-soft bg-surface p-5 shadow-pop sm:p-6" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
            {t("tour.progress", { current: step + 1, total: STEPS.length })}
          </p>
          <button
            type="button"
            onClick={close}
            className="rounded-md px-2 py-1 text-label font-medium text-text-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {t("tour.skip")}
          </button>
        </div>

        <div key={step} className="animate-fade-in space-y-3 pb-1 pt-5">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary-soft text-primary">
            <Icon size={22} aria-hidden />
          </span>
          <h2 id="tour-title" className="font-serif text-h2 text-text">
            {t(current.title)}
          </h2>
          <p className="text-body leading-relaxed text-text-secondary">{t(current.body)}</p>
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5" aria-hidden>
            {STEPS.map((_, index) => (
              <span key={index} className={cn("h-1.5 rounded-full transition-all duration-200", index === step ? "w-5 bg-primary" : "w-1.5 bg-border-strong")} />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {step > 0 && (
              <Button variant="ghost" onClick={() => setStep((value) => value - 1)}>
                {t("tour.back")}
              </Button>
            )}
            <Button onClick={() => (isLast ? close() : setStep((value) => value + 1))}>{isLast ? t("tour.done") : t("tour.next")}</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
