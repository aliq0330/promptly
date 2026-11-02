"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { activeSectionIndex, neighborSection, pagerProgress } from "@/lib/section-pager";
import { cn } from "@/lib/utils";

export interface PagerSection {
  /** Bölümün DOM kimliği (sayfadaki `<section id>`). */
  id: string;
  label: string;
}

/** Bölüme kaydırır; hareketi azalt tercihinde animasyonsuz. Bölümlerde `scroll-mt-*` olmalı (üst çubuğun altında kalmasın). */
export function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
}

/**
 * Uzun belge sayfaları için ekranın sağ altında SABİT bölüm gezinmesi (docs/history/319-*; kullanıcı mockup 3'ü seçti): [▲ bölüm adı · 3/6 ▼] kapsülü —
 * oklar önceki/sonraki bölüme gider, ada basınca bölüm listesi açılır; altta ince bir ilerleme çubuğu. Şimdiki bölüm kaydırmayla izlenir
 * (karar saf `lib/section-pager.ts`). Telefonda alt menünün üstünde durur (alt menü 4rem + güvenli alan). Sayfanın üstüne ayrıca "içindekiler" konmaz.
 * Başka bir uzun sayfa için gerekirse aynı bileşen kullanılır; ikinci bir bölüm gezinmesi yazma.
 */
export function SectionPager({ sections }: { sections: PagerSection[] }) {
  const { t } = useTranslation();
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLElement>(null);
  const total = sections.length;
  const ids = sections.map((s) => s.id).join("|");

  const measure = useCallback(() => {
    const list = ids ? ids.split("|") : [];
    const tops = list.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Number.POSITIVE_INFINITY);
    const anchor = Math.min(Math.max(window.innerHeight * 0.3, 120), 240);
    const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 8;
    const next = activeSectionIndex(tops, anchor, atBottom);
    if (next >= 0) setActive(next);
  }, [ids]);

  useEffect(() => {
    let frame = 0;
    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        measure();
      });
    };
    onScroll(); // ilk ölçüm de bir sonraki karede (efekt içinde senkron setState yok)
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [measure]);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (total < 2) return null;
  const index = Math.min(active, total - 1);
  const current = sections[index];

  function goTo(target: number) {
    const section = sections[target];
    if (!section) return;
    setActive(target);
    setOpen(false);
    scrollToSection(section.id);
  }

  const arrowClassName =
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-soft text-primary transition-colors hover:bg-primary-soft/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:bg-surface-soft disabled:text-text-muted disabled:opacity-50";

  return (
    <nav
      ref={rootRef}
      aria-label={t("devNav.label")}
      data-dev-pager=""
      className="fixed right-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-30 md:right-6 md:bottom-6"
    >
      {open && (
        <ul data-dev-pager-list="" className="absolute bottom-full right-0 mb-2 w-72 max-w-[calc(100vw-1.5rem)] animate-pop-in space-y-0.5 rounded-xl border border-border-soft bg-surface p-1.5 shadow-pop">
          {sections.map((section, i) => (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => goTo(i)}
                aria-current={i === index ? "true" : undefined}
                className={cn(
                  "flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  i === index ? "bg-primary-soft" : "hover:bg-surface-soft",
                )}
              >
                <span
                  aria-hidden
                  className={cn("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-caption font-bold", i === index ? "bg-primary text-primary-foreground" : "bg-surface-soft text-text-secondary")}
                >
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{section.label}</span>
                {i === index && <Check size={16} strokeWidth={2.6} className="shrink-0 text-primary" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative flex h-[3.125rem] w-[16.5rem] max-w-[calc(100vw-1.5rem)] items-center gap-1.5 overflow-hidden rounded-full border border-border-soft bg-surface px-1.5 shadow-pop">
        <button type="button" aria-label={t("devNav.prev")} disabled={index === 0} onClick={() => goTo(neighborSection(index, total, -1))} className={arrowClassName}>
          <ChevronUp size={18} strokeWidth={2.4} />
        </button>
        <button
          type="button"
          aria-haspopup="true"
          aria-expanded={open}
          aria-label={`${t("devNav.list")}: ${current.label}`}
          onClick={() => setOpen((value) => !value)}
          className="min-w-0 flex-1 rounded-full px-1 text-center leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <span className="block truncate text-label font-bold text-text">{current.label}</span>
          <span className="block text-caption text-text-muted">{t("devNav.position", { n: index + 1, total })}</span>
        </button>
        <button type="button" aria-label={t("devNav.next")} disabled={index === total - 1} onClick={() => goTo(neighborSection(index, total, 1))} className={arrowClassName}>
          <ChevronDown size={18} strokeWidth={2.4} />
        </button>
        <span aria-hidden className="absolute bottom-0 left-0 h-[3px] bg-primary transition-[width] duration-200 ease-soft" style={{ width: `${pagerProgress(index, total) * 100}%` }} />
      </div>
    </nav>
  );
}
