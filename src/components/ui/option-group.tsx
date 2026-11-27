"use client";

import type { ReactNode } from "react";
import { Check } from "@/components/icons/check";
import type { IconComponent } from "@/components/icons/icon";
import { radioGroupKeyDown, radioTabIndex } from "@/components/ui/radio-keys";
import { cn } from "@/lib/utils";

export interface OptionItem<K extends string> {
  key: K;
  label: ReactNode;
  /** The option's own explanation, under the label. */
  description?: ReactNode;
  icon?: IconComponent;
  /** A thumbnail / avatar between the radio dot and the text (content pick lists). */
  leading?: ReactNode;
  /** Small mark next to the label ("Önerilen", "Mevcut"). */
  badge?: ReactNode;
  /** Something that lives IN the card but is its own control (a select, a link): rendered beside the radio, never inside the button. */
  after?: ReactNode;
  disabled?: boolean;
  /** `data-*` attributes put on the radio button (tests, analytics). */
  attrs?: { [data: `data-${string}`]: string | undefined };
}

const CARD_CLASS = "flex items-stretch rounded-lg card-inset transition-colors duration-200 ease-soft motion-reduce:transition-none";
const BUTTON_CLASS = "flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed";

function Body({ label, description, badge, icon: Icon, leading, checked }: Pick<OptionItem<string>, "label" | "description" | "badge" | "icon" | "leading"> & { checked: boolean }) {
  return (
    <>
      {leading}
      {Icon && <Icon size={20} aria-hidden className={cn("mt-0.5 shrink-0", checked ? "text-primary-text" : "text-text-secondary")} />}
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2 text-small font-medium text-text">
          {label}
          {badge}
        </span>
        {description && <span className="mt-0.5 block text-caption text-text-muted">{description}</span>}
      </span>
    </>
  );
}

/**
 * Pick ONE value when EACH option needs its own explanation (privacy, visibility, "who can write", an access level — docs/history/453-*): a card per
 * option with a DRAWN radio dot (never the browser's own `<input type="radio">`), so it looks the same in every browser. 2–5 options; short
 * labels without explanations are `ChoiceGroup`. Arrow keys move + select; the checked card is the group's one tab stop.
 *   <OptionGroup ariaLabel=… value={v} onChange={setV} options={[{ key: "a", label: "…", description: "…" }]} />
 * `columns={2}` puts two cards per row from `sm` up, `columns={3}` three from `md`. The dot sits on the left, always.
 */
export function OptionGroup<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  disabled,
  columns = 1,
  reselect,
  className,
  variant,
}: {
  value: K | null;
  options: OptionItem<K>[];
  onChange: (key: K) => void;
  /** Call `onChange` again when the checked option is pressed (a pick list that opens a form on every press). */
  reselect?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
  disabled?: boolean;
  columns?: 1 | 2 | 3;
  className?: string;
  /** `sx`: the option cards of the settings pages (`app/ayar-kit.css`, mockup "opt"). */
  variant?: "default" | "sx" | "sx-list";
}) {
  const anyChecked = options.some((option) => option.key === value);
  if (variant === "sx-list") {
    return (
      <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={radioGroupKeyDown} className={className}>
        {options.map((option, index) => {
          const checked = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={radioTabIndex(index, checked, anyChecked)}
              disabled={disabled || option.disabled}
              data-option={option.key}
              onClick={() => onChange(option.key)}
              className={cn("row focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus", checked && "on-ck")}
              {...option.attrs}
            >
              <span className="rt">
                <span className="t" style={{ display: "block" }}>{option.label}</span>
                {option.description && <span className="s" style={{ display: "block" }}>{option.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  if (variant === "sx") {
    return (
      <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={radioGroupKeyDown} className={cn("opts", className)}>
        {options.map((option, index) => {
          const checked = option.key === value;
          return (
            <button
              key={option.key}
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={radioTabIndex(index, checked, anyChecked)}
              disabled={disabled || option.disabled}
              data-option={option.key}
              onClick={() => (!checked || reselect) && onChange(option.key)}
              className={cn("opt focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:opacity-50", checked && "on")}
              {...option.attrs}
            >
              {option.leading}
              <span className="rd" aria-hidden />
              <span className="rt">
                <span className="t">{option.label}</span>
                {option.description && <span className="s">{option.description}</span>}
              </span>
            </button>
          );
        })}
      </div>
    );
  }
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={radioGroupKeyDown} className={cn(columns === 3 ? "grid gap-2 md:grid-cols-3" : columns === 2 ? "grid gap-2 sm:grid-cols-2" : "space-y-2", className)}>
      {options.map((option, index) => {
        const checked = option.key === value;
        const off = disabled || option.disabled;
        return (
          <div key={option.key} className={cn(CARD_CLASS, checked ? "border-primary bg-primary-soft" : "hover:border-border-strong", off && "opacity-50")}>
            <button
              type="button"
              role="radio"
              aria-checked={checked}
              tabIndex={radioTabIndex(index, checked, anyChecked)}
              disabled={off}
              data-option={option.key}
              onClick={() => (!checked || reselect) && onChange(option.key)}
              className={BUTTON_CLASS}
              {...option.attrs}
            >
              <span aria-hidden className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border-2 bg-surface transition-colors duration-200 motion-reduce:transition-none", checked ? "border-primary" : "border-control-border")}>
                {checked && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
              </span>
              <Body label={option.label} description={option.description} badge={option.badge} icon={option.icon} leading={option.leading} checked={checked} />
            </button>
            {option.after && <div className="flex shrink-0 items-center py-2 pr-4">{option.after}</div>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * One yes/no choice that sits NEXT TO an `OptionGroup` (an extra permission under an access level): same card, but the mark is a SQUARE with a tick,
 * so a checkbox never reads as one more radio. An on/off setting of its own is a `Switch`.
 */
export function OptionCheckbox({
  checked,
  onChange,
  label,
  description,
  icon,
  badge,
  disabled,
  className,
  attrs,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  icon?: IconComponent;
  badge?: ReactNode;
  disabled?: boolean;
  className?: string;
  attrs?: { [data: `data-${string}`]: string | undefined };
}) {
  return (
    <div className={cn(CARD_CLASS, checked ? "border-primary bg-primary-soft" : "hover:border-border-strong", disabled && "opacity-50", className)}>
      <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} onClick={() => onChange(!checked)} className={BUTTON_CLASS} {...attrs}>
        <span aria-hidden className={cn("mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-xs border-2 transition-colors duration-200 motion-reduce:transition-none", checked ? "border-primary bg-primary" : "border-control-border bg-surface")}>
          {checked && <Check size={12} className="text-primary-foreground" />}
        </span>
        <Body label={label} description={description} badge={badge} icon={icon} checked={checked} />
      </button>
    </div>
  );
}

/**
 * The end mark of a selectable list row (docs/history/477-*): a rounded square with a tick for MANY, a ring with a dot for ONE. Always drawn
 * (an empty ring when off), never a native input (docs/history/453-*).
 */
export function SelectMark({ kind, selected }: { kind: "check" | "radio"; selected: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-6 w-6 shrink-0 place-items-center border-2 transition-colors duration-200 motion-reduce:transition-none",
        kind === "check" ? "rounded-xs" : "rounded-full",
        selected ? "border-primary" : "border-control-border bg-surface",
        selected && kind === "check" && "bg-primary",
      )}
    >
      {selected && (kind === "check" ? <Check size={16} className="text-primary-foreground" /> : <span className="h-2 w-2 rounded-full bg-primary" />)}
    </span>
  );
}

export interface OptionRowItem<K extends string> {
  key: K;
  label: ReactNode;
  /** The row's kicker above the title (the content type): `ContentRowKicker`. */
  kicker?: ReactNode;
  /** One short line under the title (owner, step count). */
  description?: ReactNode;
  /** A thumbnail / cover at the start of the row. */
  leading: ReactNode;
  /** `data-*` attributes put on the radio button (tests, analytics). */
  attrs?: { [data: `data-${string}`]: string | undefined };
}

/**
 * Pick ONE item from a long LIST where recognising it needs a thumbnail, a title and one line (content pick lists — comment attachment picker):
 * a `radiogroup` of flat rows, no dot. The checked row is the soft blue one with a title in primary and a tick circle at the end
 * (the `MenuRadioGroup` look, with a picture). Options that need an explanation are `OptionGroup`; arrow keys move + select.
 */
export function OptionRowGroup<K extends string>({
  value,
  options,
  onChange,
  reselect,
  ariaLabel,
  labelledBy,
  className,
}: {
  value: K | null;
  options: OptionRowItem<K>[];
  onChange: (key: K) => void;
  /** Pressing the already-checked row calls `onChange` again (a row whose choice opens a window that was closed). */
  reselect?: boolean;
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
}) {
  const anyChecked = options.some((option) => option.key === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={radioGroupKeyDown} className={cn("space-y-1", className)}>
      {options.map((option, index) => {
        const checked = option.key === value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={radioTabIndex(index, checked, anyChecked)}
            data-option={option.key}
            onClick={() => (!checked || reselect) && onChange(option.key)}
            {...option.attrs}
            className={cn(
              "flex min-h-18 w-full min-w-0 items-center gap-3 rounded-md px-2 py-3 text-left transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none",
              checked ? "bg-primary-soft" : "hover:bg-surface-soft",
            )}
          >
            {option.leading}
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              {option.kicker}
              <span className={cn("line-clamp-2 break-words text-body font-semibold leading-[1.3]", checked ? "text-primary-text" : "text-text")}>{option.label}</span>
              {option.description && <span className="block truncate text-caption text-text-muted">{option.description}</span>}
            </span>
            <SelectMark kind="radio" selected={checked} />
          </button>
        );
      })}
    </div>
  );
}
