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
const BUTTON_CLASS = "flex min-h-11 min-w-0 flex-1 items-start gap-3 rounded-lg px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-not-allowed";

function Body({ label, description, badge, icon: Icon, leading, checked }: Pick<OptionItem<string>, "label" | "description" | "badge" | "icon" | "leading"> & { checked: boolean }) {
  return (
    <>
      {leading}
      {Icon && <Icon size={20} aria-hidden className={cn("mt-0.5 shrink-0", checked ? "text-primary" : "text-text-secondary")} />}
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
}) {
  const anyChecked = options.some((option) => option.key === value);
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

export interface OptionTileItem<K extends string> {
  key: K;
  label: ReactNode;
  /** One short line under the title (owner, step count). */
  description?: ReactNode;
  /** The picture: fills a 4:3 box (a thumbnail, a cover, or a type icon on the soft ground). */
  art: ReactNode;
  /** `data-*` attributes put on the radio button (tests, analytics). */
  attrs?: { [data: `data-${string}`]: string | undefined };
}

/**
 * Pick ONE item from a PICTURE grid (content pick lists where recognising the cover is the point — comment attachment picker):
 * a `radiogroup` of tiles, two per row on a phone, three from `sm`. The checked tile gets a primary ring + tick; the title turns primary.
 * Short labels are `ChoiceGroup`, options with explanations are `OptionGroup`. Arrow keys move + select.
 */
export function OptionTileGroup<K extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  labelledBy,
  className,
}: {
  value: K | null;
  options: OptionTileItem<K>[];
  onChange: (key: K) => void;
  ariaLabel?: string;
  labelledBy?: string;
  className?: string;
}) {
  const anyChecked = options.some((option) => option.key === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-labelledby={labelledBy} onKeyDown={radioGroupKeyDown} className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", className)}>
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
            onClick={() => !checked && onChange(option.key)}
            {...option.attrs}
            className="flex min-w-0 flex-col gap-2 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <span
              className={cn(
                "relative block aspect-4/3 w-full overflow-hidden rounded-xl bg-primary-soft text-primary transition-shadow duration-200 ease-soft motion-reduce:transition-none",
                checked && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
              )}
            >
              {option.art}
              {checked && (
                <span aria-hidden className="absolute right-2 top-2 grid h-6 w-6 place-items-center rounded-full bg-primary text-primary-foreground">
                  <Check size={16} />
                </span>
              )}
            </span>
            <span className="min-w-0 px-0.5">
              <span className={cn("line-clamp-2 block break-words text-small font-semibold leading-snug", checked ? "text-primary" : "text-text")}>{option.label}</span>
              {option.description && <span className="mt-0.5 block truncate text-caption text-text-muted">{option.description}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}
