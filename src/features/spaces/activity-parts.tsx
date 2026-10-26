"use client";

import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { SPACE_VISIBILITY_LABEL, type SpaceVisibility } from "@/lib/spaces";
import type { SpaceActivity, SpaceActivityAction } from "@/lib/supabase/spaces";
import { SpaceImage } from "./space-visuals";

/** Etkinlik cümlesi (adı yazanın yanında): eylem türü → çeviri anahtarı. */
export const ACTIVITY_KEY: Record<SpaceActivityAction, TranslationKey> = {
  created: "spaces.activity.created",
  renamed: "spaces.activity.renamed",
  visibility_changed: "spaces.activity.visibility_changed",
  archived: "spaces.activity.archived",
  unarchived: "spaces.activity.unarchived",
  image_added: "spaces.activity.image_added",
  image_removed: "spaces.activity.image_removed",
  prompt_added: "spaces.activity.prompt_added",
  note_added: "spaces.activity.note_added",
  content_added: "spaces.activity.content_added",
  item_removed: "spaces.activity.item_removed",
  palette_created: "spaces.activity.palette_created",
  palette_updated: "spaces.activity.palette_updated",
  palette_deleted: "spaces.activity.palette_deleted",
  group_created: "spaces.activity.group_created",
  group_deleted: "spaces.activity.group_deleted",
  member_invited: "spaces.activity.member_invited",
  member_joined: "spaces.activity.member_joined",
  member_removed: "spaces.activity.member_removed",
  role_changed: "spaces.activity.role_changed",
  link_created: "spaces.activity.link_created",
  link_revoked: "spaces.activity.link_revoked",
};

export type ActivityCategory = "palette" | "items" | "settings" | "other";

/** Etkinlik sekmesindeki süzgeç grupları. */
export function activityCategory(action: SpaceActivityAction): ActivityCategory {
  if (action.startsWith("palette_")) return "palette";
  if (action === "image_added" || action === "image_removed" || action === "prompt_added" || action === "note_added" || action === "content_added" || action === "item_removed") return "items";
  if (action === "renamed" || action === "visibility_changed" || action === "archived" || action === "unarchived") return "settings";
  return "other";
}

/** "adı \"X\" yaptı" gibi eylem cümlesi (kişinin adı çağıranda yazılır). */
export function useActivityText() {
  const { t } = useTranslation();
  return (entry: Pick<SpaceActivity, "action" | "count" | "label">) =>
    t(ACTIVITY_KEY[entry.action], {
      count: entry.count,
      label:
        entry.action === "visibility_changed" && entry.label
          ? t(SPACE_VISIBILITY_LABEL[entry.label as SpaceVisibility] ?? "spaces.visibility.private")
          : (entry.label ?? ""),
    });
}

function Swatches({ colors }: { colors: string[] }) {
  return (
    <div className="flex gap-1" data-activity-swatches="">
      {colors.slice(0, 10).map((color, index) => (
        // Renk değeri kullanıcı verisidir (palet satırındaki hex); inline stil tek yol.
        <i key={`${color}-${index}`} className="block h-7 min-w-0 flex-1 rounded-md border border-border-soft" style={{ backgroundColor: color }} title={color} />
      ))}
    </div>
  );
}

function asColors(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((c): c is string => typeof c === "string") : [];
}

function Side({ tone, title, children }: { tone: "before" | "after"; title: string; children: React.ReactNode }) {
  return (
    <div className={cn("min-w-0 rounded-xl px-3 py-2.5", tone === "before" ? "bg-danger/10" : "bg-success/10")} data-activity-side={tone}>
      <h4 className={cn("mb-2 text-label font-semibold uppercase tracking-[0.08em]", tone === "before" ? "text-danger" : "text-success")}>{title}</h4>
      {children}
    </div>
  );
}

/**
 * Etkinliğin ÖNCE / SONRA karşılaştırması (docs/history/242-*): ad ve görünürlük metin olarak, palet renk şeridi olarak, eklenen/kaldırılan
 * öğeler küçük resim + başlıkla. Ayrıntısı olmayan (eski) etkinlik hiçbir şey çizmez; `emptyNote` ile açıklayabilirsin.
 */
export function ActivityDiff({ entry, emptyNote = false }: { entry: SpaceActivity; emptyNote?: boolean }) {
  const { t } = useTranslation();
  const d = entry.details;
  const action = entry.action;
  const visLabel = (value: unknown) => t(SPACE_VISIBILITY_LABEL[value as SpaceVisibility] ?? "spaces.visibility.private");

  let body: React.ReactNode = null;
  if (d && (action === "renamed" || action === "visibility_changed")) {
    const before = typeof d.before === "string" ? d.before : null;
    const after = typeof d.after === "string" ? d.after : null;
    const fmt = (value: string | null, strike: boolean) =>
      value === null ? null : action === "visibility_changed" ? (
        <span className="inline-flex rounded-full bg-surface px-2.5 py-0.5 text-small font-semibold text-text">{visLabel(value)}</span>
      ) : (
        <span className={cn("break-words text-small", strike ? "text-text-secondary line-through" : "font-semibold text-text")}>{value}</span>
      );
    body = (
      <div className="grid gap-2 sm:grid-cols-2">
        <Side tone="before" title={t("spaces.activity.before")}>{fmt(before, true)}</Side>
        <Side tone="after" title={t("spaces.activity.after")}>{fmt(after, false)}</Side>
      </div>
    );
  } else if (d && action.startsWith("palette_")) {
    const before = asColors(d.before);
    const after = asColors(d.after);
    body = (
      <div className={cn("grid gap-2", before.length > 0 && after.length > 0 && "sm:grid-cols-2")}>
        {before.length > 0 && (
          <Side tone="before" title={t("spaces.activity.before")}>
            <Swatches colors={before} />
            <p className="mt-1.5 text-caption text-text-muted">{t("spaces.activity.colorsCount", { count: before.length })}</p>
          </Side>
        )}
        {after.length > 0 && (
          <Side tone="after" title={t("spaces.activity.after")}>
            <Swatches colors={after} />
            <p className="mt-1.5 text-caption text-text-muted">{t("spaces.activity.colorsCount", { count: after.length })}</p>
          </Side>
        )}
      </div>
    );
  } else if (d?.items && d.items.length > 0) {
    const removed = action === "image_removed" || action === "item_removed";
    body = (
      <Side tone={removed ? "before" : "after"} title={removed ? t("spaces.activity.removedItems") : t("spaces.activity.added")}>
        <ul className="space-y-1.5">
          {d.items.map((item, index) => (
            <li key={index} className="flex min-w-0 items-center gap-2 text-small text-text">
              {item.thumb ? <SpaceImage url={item.thumb} alt="" className="h-12 w-12 shrink-0 overflow-hidden rounded-lg" /> : null}
              <span className="min-w-0">
                {item.title ? <span className="block truncate font-semibold">{item.title}</span> : null}
                {item.text ? <span className="line-clamp-2 block break-words text-caption text-text-secondary">{item.text}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      </Side>
    );
  }

  if (!body) return emptyNote ? <p className="text-small text-text-muted">{t("spaces.activity.noDetails")}</p> : null;
  return <div data-activity-diff={action}>{body}</div>;
}
