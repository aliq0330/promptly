"use client";

import { useCallback, useEffect, useRef, useState, type MouseEvent } from "react";
import { Heart } from "lucide-react";
import { cn, formatCount } from "@/lib/utils";
import { MOTION_MS, usePrefersReducedMotion } from "@/lib/motion";

/**
 * What a like mutation reports back. `liked` is the only result that plays
 * the burst — an unlike, a failure (already rolled back by the owner of the
 * state) or an ignored click (a request for this target is still in flight)
 * only get the soft state/colour/count transition.
 */
export type LikeToggleResult = "liked" | "unliked" | "failed" | "ignored";

/** Deterministic burst geometry (no randomness in render): 8 particles on a ring. */
const PARTICLES = Array.from({ length: 8 }, (_, i) => {
  const angle = (i / 8) * Math.PI * 2 + 0.4;
  const dist = 22 + ((i * 7) % 5);
  return {
    px: Math.round(Math.cos(angle) * dist),
    py: Math.round(Math.sin(angle) * dist),
    delay: (i * 13) % 40,
    color: ["bg-danger", "bg-primary", "bg-danger/60", "bg-secondary", "bg-primary-soft"][i % 5],
  };
});

/** Ring + particles. Purely decorative: never takes pointer events or layout space. */
function LikeBurstEffect({ size }: { size: number }) {
  return (
    <span aria-hidden className="pointer-events-none absolute left-1/2 top-1/2 motion-reduce:hidden">
      <span
        className="absolute left-0 top-0 animate-like-ring rounded-full border-danger"
        style={{ width: size * 1.9, height: size * 1.9, borderStyle: "solid" }}
      />
      {/* A second, wider and fainter ring a beat later — the "echo". */}
      <span
        className="absolute left-0 top-0 animate-like-ring rounded-full border-primary/60"
        style={{ width: size * 2.6, height: size * 2.6, borderStyle: "solid", animationDelay: "90ms" }}
      />
      {PARTICLES.map((p, i) => (
        <span
          key={i}
          className={cn("absolute left-0 top-0 size-1.5 animate-like-particle rounded-full", p.color)}
          style={{ ["--px" as string]: `${p.px}px`, ["--py" as string]: `${p.py}px`, animationDelay: `${p.delay}ms` }}
        />
      ))}
    </span>
  );
}

/** Count that rolls to its new value instead of jumping; width never changes between same-length numbers. */
function RollingCount({ value }: { value: number }) {
  const [state, setState] = useState({ value, prev: null as number | null, dir: 1 });
  if (state.value !== value) setState({ value, prev: state.value, dir: value > state.value ? 1 : -1 });

  useEffect(() => {
    if (state.prev === null) return;
    const timer = setTimeout(() => setState((s) => ({ ...s, prev: null })), 240);
    return () => clearTimeout(timer);
  }, [state.prev, state.value]);

  return (
    <span aria-hidden className="relative inline-flex overflow-hidden tabular-nums" style={{ ["--dir" as string]: state.dir }}>
      <span className={cn(state.prev !== null && "animate-count-in motion-reduce:animate-none")}>{formatCount(state.value)}</span>
      {state.prev !== null && (
        <span className="absolute inset-0 animate-count-out motion-reduce:hidden">{formatCount(state.prev)}</span>
      )}
    </span>
  );
}

/**
 * The one like interaction for every like surface (content cards and detail
 * pages for prompts / requests / generators / workflows / presets, and
 * comment likes): heart pop + ring + particle burst on a *successful* like,
 * a soft transition on unlike, rolling count. State and persistence stay
 * with the caller — `liked`/`count` come from the existing hooks and
 * `onToggle` runs the existing mutation and reports the outcome.
 */
export function LikeToggle({
  liked,
  count,
  onToggle,
  size = 16,
  showCount = true,
  hideZero = false,
  label,
  className,
  title,
  disabled,
}: {
  liked: boolean;
  count: number;
  onToggle: () => Promise<LikeToggleResult> | LikeToggleResult;
  size?: number;
  showCount?: boolean;
  /** Comments hide a zero count; content actions always show it. */
  hideZero?: boolean;
  /** Accessible name — callers pass the localized, state-based label ("Beğen" / "Beğeniyi kaldır"). */
  label: string;
  className?: string;
  title?: string;
  disabled?: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const [burstSeq, setBurstSeq] = useState(0);
  const heartRef = useRef<HTMLSpanElement>(null);
  const [bursting, setBursting] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const handleClick = useCallback(
    async (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const result = await onToggle();
      // Unlike: a quiet "release" (no particles) — clearly lighter than a like.
      // (Web Animations, not a remount, so the fill/colour transition keeps running.)
      if (result === "unliked" && !reducedMotion) {
        heartRef.current?.animate(
          [{ transform: "scale(1)" }, { transform: "scale(0.82)", offset: 0.45 }, { transform: "scale(1)" }],
          { duration: MOTION_MS.normal, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        );
      }
      if (result !== "liked") return;
      setBurstSeq((n) => n + 1);
      setBursting(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setBursting(false), 700);
    },
    [onToggle, reducedMotion],
  );

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-pressed={liked}
      aria-label={label}
      title={title}
      disabled={disabled}
      className={className}
    >
      <span className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
        <span
          ref={heartRef}
          // Keys must differ from the burst layer's below: two siblings sharing a key made React keep every old heart.
          key={`heart-${burstSeq}`}
          className={cn("inline-flex", burstSeq > 0 && liked && "animate-heart-pop motion-reduce:animate-none")}
        >
          <Heart
            size={size}
            strokeWidth={1.75}
            className={cn("transition-[fill,color] duration-200 ease-soft", liked ? "fill-current text-danger" : "fill-transparent")}
          />
        </span>
        {bursting && !reducedMotion && <LikeBurstEffect key={`burst-${burstSeq}`} size={size} />}
      </span>
      {showCount && !(hideZero && count <= 0) && <RollingCount value={count} />}
    </button>
  );
}
