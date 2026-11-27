import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The one on/off switch (docs/history/406-*): 44×24 track, 20 px thumb, the thumb moves with `transform` (never `left`).
 * Off = `border-strong`, on = `primary`; the thumb is the surface colour in both modes. Three pieces:
 *   - `SwitchTrack`  — the drawn track + thumb (decorative, `aria-hidden`), for a row that is itself the control.
 *   - `Switch`       — a standalone `role="switch"` button around the track.
 *   - `SwitchRow`    — a whole row (icon + text + track) as ONE `role="switch"` control.
 * `role="switch"` lives only in this file (`scripts/design-metrics.mjs` counts it); never hand-draw a track again.
 */
export function SwitchTrack({ on, className }: { on: boolean; className?: string }) {
  return (
    <span
      aria-hidden
      data-switch-track=""
      className={cn("relative inline-block h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ease-soft motion-reduce:transition-none", on ? "bg-primary" : "bg-border-strong", className)}
    >
      <span
        className={cn(
          "absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-surface shadow-xs transition-transform duration-200 ease-soft motion-reduce:transition-none",
          on && "translate-x-5",
        )}
      />
    </span>
  );
}

type ControlProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange" | "role" | "aria-checked" | "type"> & {
  checked: boolean;
  onChange: (next: boolean) => void;
  /** Accessible name (omit when `labelledBy` or the row's own text names it). */
  label?: string;
  labelledBy?: string;
  /** `sx`: the 52×30 track of the settings pages (`app/ayar-kit.css`, mockup "tg"). */
  variant?: "default" | "sx";
  [data: `data-${string}`]: string | boolean | undefined;
};

const FOCUS_CLASS = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background";

/** A standalone switch. */
export const Switch = forwardRef<HTMLButtonElement, ControlProps>(function Switch({ checked, onChange, label, labelledBy, disabled, className, variant, ...rest }, ref) {
  if (variant === "sx") {
    return (
      <button ref={ref} type="button" role="switch" aria-checked={checked} aria-label={label} aria-labelledby={labelledBy} disabled={disabled} onClick={() => onChange(!checked)} className={cn("tg", checked && "on", className)} {...rest}>
        <i />
      </button>
    );
  }
  return (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("inline-flex shrink-0 rounded-full disabled:cursor-not-allowed disabled:opacity-50", FOCUS_CLASS, className)}
      {...rest}
    >
      <SwitchTrack on={checked} />
    </button>
  );
});

/** A row that is the switch: `children` (icon, title, hint) then the track at the end (`trackPosition="start"` puts it first). */
export function SwitchRow({
  checked,
  onChange,
  label,
  labelledBy,
  disabled,
  className,
  trackPosition = "end",
  children,
  variant: _variant,
  ...rest
}: ControlProps & { trackPosition?: "start" | "end"; children: ReactNode }) {
  const track = <SwitchTrack on={checked} />;
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("flex w-full items-center gap-3 text-left disabled:cursor-not-allowed disabled:opacity-50", FOCUS_CLASS, className)}
      {...rest}
    >
      {trackPosition === "start" && track}
      {children}
      {trackPosition === "end" && track}
    </button>
  );
}
