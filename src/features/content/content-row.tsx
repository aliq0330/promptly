"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { SelectMark } from "@/components/ui/option-group";
import { SkillCoverImage, useSkillCoverUrl } from "@/features/skills/skill-cover";
import { StorageImage } from "@/components/ui/storage-media";
import { ATTACHMENT_ICONS } from "@/features/content/compact-content-card";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { CommentAttachmentType } from "@/types";

/**
 * The small sizes of the horizontal row ("D · Yatay satır", docs/history/477-*). The FULL row (search, collections, profile, My content) is the
 * same content card drawn by `ContentCardPost` inside `ContentGrid layout="rows"`; the small rows below are for places that do not hold a
 * whole card — pick lists, the detail page's side column, a ranked list — and only know a cover, a title and one line:
 *
 *   sm  72 px cover · type · title (2 lines) · one meta line · trailing control   (pick dialogs, ranked list)
 *   xs  56 px cover · type · title (2 lines) · one meta line                     (side column)
 *
 * A cover is the post's first picture; without one the type's icon sits on a soft tile (the type glyph chip is drawn on a picture instead).
 */
export type ContentRowSize = "sm" | "xs";

const THUMB_SIZE: Record<ContentRowSize, string> = { sm: "h-18 w-18", xs: "h-14 w-14" };

export function ContentThumb({ type, icon, src, skillCover, size = "sm", className }: { type?: CommentAttachmentType; icon?: IconComponent; src?: string | null; /** A Skill's cover (`skill-files` path, signed on the fly). */ skillCover?: string | null; size?: ContentRowSize; className?: string }) {
  const Icon = icon ?? ATTACHMENT_ICONS[type ?? "prompt"];
  const skillUrl = useSkillCoverUrl(skillCover);
  return (
    <span className={cn("relative z-2 flex shrink-0 items-center justify-center overflow-hidden rounded-sm bg-primary-soft text-primary-text", THUMB_SIZE[size], className)}>
      {src || skillUrl ? (
        <>
          {src ? <StorageImage src={src} alt="" fill sizes={size === "sm" ? "72px" : "56px"} className="object-cover" /> : <SkillCoverImage path={skillCover} className="absolute inset-0 h-full w-full object-cover" />}
          <span aria-hidden className="absolute bottom-1 right-1 grid h-5 w-5 place-items-center rounded-xs bg-art-chip text-on-art">
            <Icon size={12} />
          </span>
        </>
      ) : (
        <Icon size={size === "sm" ? 24 : 20} aria-hidden />
      )}
    </span>
  );
}

/** The type's name in the brand colour: `[icon] Prompt` — the row's kicker. */
export function ContentRowKicker({ type, className }: { type: CommentAttachmentType; className?: string }) {
  const { t } = useTranslation();
  const Icon = ATTACHMENT_ICONS[type];
  return (
    <span className={cn("flex min-w-0 items-center gap-1.5 text-caption font-semibold text-primary-text", className)}>
      <Icon size={12} aria-hidden className="shrink-0" />
      <span className="truncate">{t(`communities.feed.type.${type}`)}</span>
    </span>
  );
}

/** The text column of a small row: kicker, title (two lines), one meta line. */
export function ContentRowText({ type, title, meta, size = "sm", selected }: { type?: CommentAttachmentType; title: ReactNode; meta?: ReactNode; size?: ContentRowSize; selected?: boolean }) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-1">
      {type && <ContentRowKicker type={type} />}
      <span className={cn("line-clamp-2 break-words font-display font-bold leading-[1.3]", size === "sm" ? "text-body" : "text-small", selected ? "text-primary-text" : "text-text")}>{title}</span>
      {meta && <span className="truncate text-caption text-text-muted">{meta}</span>}
    </span>
  );
}

const ROW_BASE = "flex w-full min-w-0 items-center gap-3 text-left";

/**
 * A small row. With `href` it is a link (side column, ranked list); with `select` + `onSelect` a `role="checkbox"` button with a square mark at
 * its end (many-pick lists); otherwise a plain box with an optional `trailing` control. Pick-ONE lists use `OptionRowGroup` (it owns the radio roles).
 */
export function ContentRowSmall({
  type,
  icon,
  image,
  skillCover,
  title,
  meta,
  size = "sm",
  href,
  select,
  selected = false,
  onSelect,
  disabled,
  trailing,
  className,
  attrs,
}: {
  /** Which kind of post: draws the kicker. Without it (related lists) only `icon` is used for a picture-less thumb. */
  type?: CommentAttachmentType;
  icon?: IconComponent;
  image?: string | null;
  skillCover?: string | null;
  title: ReactNode;
  meta?: ReactNode;
  size?: ContentRowSize;
  href?: string;
  /** "check" = many (square); needs `onSelect`. */
  select?: "check";
  selected?: boolean;
  onSelect?: () => void;
  disabled?: boolean;
  trailing?: ReactNode;
  className?: string;
  attrs?: { [data: `data-${string}`]: string | undefined };
}) {
  const body = (
    <>
      <ContentThumb type={type} icon={icon} src={image} skillCover={skillCover} size={size} />
      <ContentRowText type={type} title={title} meta={meta} size={size} selected={selected} />
      {select && <SelectMark kind="check" selected={selected} />}
      {trailing}
    </>
  );
  const padding = "py-3";
  if (select && onSelect) {
    return (
      <button
        type="button"
        role="checkbox"
        aria-checked={selected}
        disabled={disabled}
        onClick={onSelect}
        {...attrs}
        className={cn(
          ROW_BASE,
          padding,
          "-mx-2 w-[calc(100%+1rem)] rounded-md px-2 transition-colors duration-200 ease-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus motion-reduce:transition-none disabled:opacity-60",
          selected ? "bg-primary-soft" : "hover:bg-surface-soft",
          className,
        )}
      >
        {body}
      </button>
    );
  }
  if (href) {
    return (
      <Link href={href} {...attrs} className={cn(ROW_BASE, padding, "group rounded-md outline-none focus-visible:ring-2 focus-visible:ring-focus", className)}>
        {body}
      </Link>
    );
  }
  return (
    <div {...attrs} className={cn(ROW_BASE, padding, className)}>
      {body}
    </div>
  );
}
