"use client";

import Link from "next/link";
import type { IconComponent } from "@/components/icons/icon";
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { Avatar } from "@/components/ui/avatar";
import { Pin } from "@/components/icons/pin";
import { Badge } from "@/components/ui/badge";
import { buttonClassName } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { rememberCardMedia, useCardMediaReturn } from "@/lib/card-transition";
import { cn, profileHref } from "@/lib/utils";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";
import { splitSourceNotes } from "@/lib/source-notes";
import { GRID_COLUMNS, GRID_COLUMNS_ASIDE } from "@/lib/grid-columns";

/**
 * Shared shell of every content card on the platform —
 *
 *   ContentCard  (+ ContentCardPost — the Meydan post layout inside)
 *   ├── PromptCard     (image / text / video / audio prompts)
 *   ├── WorkflowCard · PresetCard · RequestCard
 *   └── ApplicationCard (community application post)
 *
 * Same surface, border, radius, padding, hover and "stretched link" for all
 * of them, so the feed reads as one system and only the content block in
 * the middle differs per type. The full-card `<Link>` sits behind everything
 * (`z-0`); every real control inside (author link, menu, copy, actions) is
 * `relative z-10`, so it stays independently clickable.
 *
 * Hover is border + shadow only — no transform, because a transform would
 * create a stacking context and trap the card's own dropdown menu under the
 * next card in the column.
 */
/**
 * Kartın çıkış animasyonu (docs/history/335-*): ⋮ menüsü bir silme/koleksiyondan kaldırma bitirdiğinde `exit(commit)` çağırır; kart önce küçülüp solar
 * (260 ms), sonra `commit` (listeden gerçek kaldırma) çalışır. `commit` hata fırlatırsa kart geri gelir. Sağlayıcı yoksa (kart dışı kullanım) `commit` hemen çalışır.
 */
type CardExit = (commit?: () => void | Promise<void>) => Promise<void>;
const CardExitContext = createContext<CardExit | null>(null);

/**
 * "A" (feed post) or "D" (row) layout of every card under it (docs/history/477-*): `ContentGrid layout="rows"` provides `{ author }` and each
 * content card — which already hands its picture, kicker, title, counters and menu to `ContentCardPost` — draws as a horizontal row (square
 * picture on the left; kicker + time, title, summary, author, counters on the right; hairline under it, no box). No second set of card
 * adapters exists: one card component, two layouts. `author: false` hides the author line where the page is already one person's (a profile).
 */
type CardLayout = { author: boolean; own: boolean; highlight?: string[] } | null;
const CardLayoutContext = createContext<CardLayout>(null);

/** `true` inside a row list (`ContentGrid layout="rows"` / `ContentRowsScope`): the art is a small square there (docs/history/479-*). */
export function useRowsLayout(): boolean {
  return useContext(CardLayoutContext) !== null;
}

/**
 * A page region whose post lists are ROWS (docs/history/477-*): every `ContentGrid` below it draws rows without each list passing `layout`, so a page
 * (search results, a profile tab, a collection, My content) switches layout in ONE place. `author={false}` hides the author line (the page is one
 * person's); `own` marks the viewer's own library (My content): a status badge and an "Düzenle" button join each row.
 */
const ContentRowsScopeContext = createContext<CardLayout>(null);
export function ContentRowsScope({ author = true, own = false, highlight, children }: { author?: boolean; own?: boolean; highlight?: string[]; children: React.ReactNode }) {
  const key = highlight?.join("\u0000") ?? "";
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` is the words' identity (the array is a new object every render)
  const value = useMemo<CardLayout>(() => ({ author, own, highlight }), [author, own, key]);
  return <ContentRowsScopeContext.Provider value={value}>{children}</ContentRowsScopeContext.Provider>;
}
/**
 * Narrow strips (Keşfet's horizontal `ScrollRow`s, docs/history/478-*): the cards below draw WITHOUT the two-line summary, so a 232 px card stays
 * about as tall as its picture plus a title. Same card, one density.
 */
const CardCompactContext = createContext(false);
export function CompactCards({ children }: { children: React.ReactNode }) {
  return <CardCompactContext.Provider value>{children}</CardCompactContext.Provider>;
}

/** One extra small line a list puts under a row's author (a shared collection's "Ekleyen …"); rows only, nothing is drawn on a card. */
export const RowNoteContext = createContext<React.ReactNode>(null);
/** Is the surrounding list a row list? (Skeletons and empty states follow it.) */
export function useContentRowsScope(): boolean {
  return useContext(ContentRowsScopeContext) !== null;
}
export function useCardExit(): CardExit {
  return useContext(CardExitContext) ?? (async (commit) => void (await commit?.()));
}

export function ContentCard({
  href,
  onOpen,
  variant = "box",
  className,
  children,
}: {
  href: string;
  /** Called when the card's own link is followed — a card hands its post to the detail page (`lib/detail-handoff.ts`). */
  onOpen?: () => void;
  /** "visual": the picture-first post card (`ContentCardPost`) — no box, the rounded picture is the card. "box": a surface with border + shadow. */
  variant?: "box" | "visual";
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const [leaving, setLeaving] = useState(false);
  const exit = useCallback<CardExit>(async (commit) => {
    if (prefersReducedMotion()) {
      await commit?.();
      return;
    }
    setLeaving(true);
    await new Promise((resolve) => setTimeout(resolve, 260));
    try {
      await commit?.();
    } catch (error) {
      setLeaving(false);
      throw error;
    }
  }, []);
  // Back from this card's own detail page: the hero shrinks back into the cover.
  useCardMediaReturn(href, ref);
  const rows = useContext(CardLayoutContext) !== null && variant === "visual";
  return (
    <CardExitContext.Provider value={exit}>
    <article
      ref={ref}
      // A click that will navigate to this card's own page remembers where the cover is, so the detail
      // page can morph it (src/lib/card-transition.ts). Controls (like, menu…) stop their own clicks.
      onClickCapture={(event) => {
        if ((event.target as Element).closest("a[data-card-link]")) {
          rememberCardMedia(href, event.currentTarget.querySelector("[data-card-media]"));
          onOpen?.();
        }
      }}
      className={cn(
        variant === "visual"
          ? rows
            ? "group relative border-b border-border py-4"
            : "group relative flex flex-col"
          : [
              "group relative flex flex-col rounded-lg card-flat shadow-card transition-[border-color,box-shadow] duration-300 ease-soft hover:border-border hover:shadow-card-hover",
              // Hover-capable pointers only (Tailwind's hover: variant): a hairline of the brand colour opens along the top edge.
              "before:pointer-events-none before:absolute before:inset-x-5 before:top-0 before:z-1 before:h-px before:origin-center before:scale-x-0 before:rounded-full before:bg-primary/55 before:transition-transform before:duration-[var(--motion-emphasis)] before:ease-soft hover:before:scale-x-100",
            ],
        leaving && "pointer-events-none scale-90 opacity-0 transition-[transform,opacity] duration-[240ms] ease-soft",
        className,
      )}
    >
      {children}
      {/* Mouse/touch convenience only: hidden from assistive tech and the tab
          order — the card title (ContentCardTitle) is the accessible link. */}
      <Link href={href} data-card-link className={cn("absolute inset-0 z-0", variant === "visual" ? "rounded-md" : "rounded-lg")} aria-hidden tabIndex={-1} />
    </article>
    </CardExitContext.Provider>
  );
}

export { GRID_COLUMNS, GRID_COLUMNS_ASIDE };

/**
 * Every list of posts (Ana Sayfa, Topluluklar and a community's feed, Keşfet, type lists, profile, search,
 * saved/collections, my content — Meydan, docs/history/190-*): the same boxed cards on EVERY screen (a phone is one column with the
 * page's 12px gutter; from `sm` the boxes flow into CSS columns), so a post list looks the same everywhere
 * (docs/history/196-*; the brief flat-rows-on-phones experiment of Faz 6 eki was reverted). Wrap each card in an element with
 * `CONTENT_GRID_ITEM_CLASS`. No `overflow-hidden`: a card's ⋮ menu must be able to open past the list's edge.
 */
export function ContentGrid({
  as: Tag = "div",
  columns,
  layout,
  rowAuthor,
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLElement> & {
  as?: "div" | "ul";
  columns?: string;
  /** "rows" = the horizontal row list (D, docs/history/477-*): every card below draws as a row, in a grid of 1 or 2 columns by width. Default: the surrounding `ContentRowsScope`, else cards. */
  layout?: "cards" | "rows";
  /** Rows only: false hides each row's author line (a profile's own list). */
  rowAuthor?: boolean;
  [data: `data-${string}`]: string | undefined;
}) {
  const pageColumns = useContext(ContentGridColumnsContext);
  const scope = useContext(ContentRowsScopeContext);
  const rows = layout ? layout === "rows" : scope !== null;
  const author = rowAuthor ?? scope?.author ?? true;
  const own = scope?.own ?? false;
  const highlight = scope?.highlight;
  const layoutValue = useMemo<CardLayout>(() => (rows ? { author, own, highlight } : null), [rows, author, own, highlight]);
  if (rows) {
    return (
      <CardLayoutContext.Provider value={layoutValue}>
        <Tag {...rest} data-content-rows="" className={cn("grid gap-x-10 [grid-template-columns:repeat(auto-fill,minmax(min(100%,30rem),1fr))] [&>*]:pb-0!", className)}>
          {children}
        </Tag>
      </CardLayoutContext.Provider>
    );
  }
  columns ??= pageColumns ?? GRID_COLUMNS;
  return (
    <Tag {...rest} className={cn("sm:gap-4", columns, className)}>
      {children}
    </Tag>
  );
}

/**
 * A page whose lists sit beside a side column (profile, collection: docs/history/203-*) sets the columns once for every
 * `ContentGrid` under it — its tabs' lists are separate components that each draw their own grid.
 */
const ContentGridColumnsContext = createContext<string | null>(null);
export const ContentGridColumns = ContentGridColumnsContext.Provider;

/** One cell of a `ContentGrid`: never split across columns; the gap between cards (20px on a phone, 24px from `sm`). */
export const CONTENT_GRID_ITEM_CLASS = "break-inside-avoid pb-3 sm:pb-4";

/**
 * The tinted layer behind an Albüm card's band: the picture's average colour, else the quiet brand tint. Put it first inside a `relative rounded-t-xl` band; the band's content goes
 * after it in a `relative` box. Shared by the content cards and the community / collection / creator cards (docs/history/203-*).
 */
export function CardBandBackdrop({
  tint,
  className,
  as: Tag = "div",
}: {
  /**
   * The picture's stored average colour (`PromptMedia.color`, docs/history/209-*). When known it tints the band directly; else the quiet brand tint.
   * (The enlarged, blurred copy of the picture that used to sit behind the band is gone, docs/history/406-*: it cost a decoded image per card for a colour wash.)
   */
  tint?: string | null;
  className?: string;
  /** "span" inside a `<button>` band (a workflow's step card). */
  as?: "div" | "span";
}) {
  if (tint) {
    return <Tag aria-hidden className={cn("absolute inset-0 overflow-hidden rounded-t-xl", className)} style={{ backgroundColor: bandTint(tint) }} />;
  }
  return <Tag aria-hidden className={cn("absolute inset-0 overflow-hidden rounded-t-xl bg-primary-soft", className)} />;
}

/** A band colour from a picture's average colour: about a third of it over the page colour (the blurred backdrop's strength). */
export function bandTint(color: string): string {
  return `color-mix(in srgb, ${color} 34%, var(--color-background))`;
}

/**
 * The one inner structure of every content card — the FEED POST (docs/history/477-*, "A · Akış gönderisi"; it replaced the picture-first
 * card of 266-* and 277-* whose title sat over the picture):
 *
 *   ┌──────────────────────────────────────────────┐
 *   │ [status]                             ( ▶ )    │  ← the post's picture, 12 px corners, no frame
 *   │              (the picture / the art)          │
 *   └──────────────────────────────────────────────┘
 *   [icon] Görsel Prompt · Midjourney          2 sa      ← kicker (`badges`) + `time`
 *   Başlık, 17/700                                      ← `title` (`ContentCardTitle`)
 *   İki satırlık serif özet                            ← `ContentCardTitle description`
 *   (·) Name                       ♥ 12  💬 3  🔖  ⋮
 *
 * The picture is the card's face and carries no text but what the art itself is (a prompt text, the steps, the parameters…); the type,
 * tool, time, title and summary are real text BELOW it, so they read on every phone and for assistive tech. `art` sets the picture's
 * height (an output keeps its own clamped ratio); below `sm` the picture is cropped to at most a square (centred), so a feed on a phone
 * stays scannable. `status` is always visible in the picture's bottom-right corner (Taslak, Açık/Kapandı, Alıntı…); `badges` is the kicker
 * and `time` its right end; `meta` ("@user · time") stays for assistive tech. `children` are extra lines (a request-response's provenance,
 * a quote's note) between the title block and the footer. Nothing here creates a stacking context outside the picture (no `isolate`/transform
 * on the card), so the ⋮ menu still opens over the next card; the controls are `relative z-10` above the card's stretched link and the menu `z-20`.
 */
export function ContentCardPost({
  author,
  meta,
  time,
  typeIcon: TypeIcon,
  status,
  badges,
  menu,
  editHref,
  ownMetrics,
  pinned = false,
  art,
  title,
  footer,
  children,
}: {
  /** `null` = unknown/removed author (shown as a generic user, no profile link). */
  author: (Pick<UserProfile, "username" | "displayName" | "avatarUrl"> & { id?: string }) | null;
  /** Muted part of the author line — e.g. "@carol · 3 gün önce" or "bir prompt paylaştı · dün"; kept for assistive tech only. */
  meta: string;
  /** The short relative time at the kicker's right end ("2 sa", "dün"). */
  time?: string;
  /** The type's glyph for a card with no art at all (an empty placeholder); nothing is drawn on the picture itself. */
  typeIcon?: IconComponent;
  /** Always-visible chips in the picture's bottom-right corner (`Badge`s: Taslak, Açık/Kapandı, Alıntı, Sabit…). */
  status?: React.ReactNode;
  /** The kicker row below the picture (`ContentTypePill`…). */
  badges?: React.ReactNode;
  menu?: React.ReactNode;
  /** Where the author edits this post; a row in the viewer's own library (`ContentRowsScope own`) shows an "Düzenle" button to it. */
  editHref?: string;
  /** Counters shown INSTEAD of `footer` on a row of the viewer's own library (`ContentRowsScope own`): `RowMetrics` — copies + saves. */
  ownMetrics?: React.ReactNode;
  /** The post is pinned to the open profile (docs/history/480-*): a pin mark at the kicker's right end. */
  pinned?: boolean;
  /** What fills the picture: the output, a prompt box, the steps… It sets the picture's height. */
  art?: React.ReactNode;
  /** `ContentCardTitle` (title + optional two-line summary). */
  title: React.ReactNode;
  /** The compact counters (Beğeni · Yorum · Kaydet), right of the author. */
  footer?: React.ReactNode;
  /** Extra lines between the title block and the author row. */
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const rows = useContext(CardLayoutContext);
  const rowNote = useContext(RowNoteContext);
  const { user } = useAuth();
  const name = author?.displayName ?? t("common.genericUser");
  if (rows) {
    const canEdit = rows.own && Boolean(editHref) && Boolean(author?.id) && user?.id === author?.id;
    const rowStatus = status ?? (rows.own ? <Badge variant="success">{t("card.row.published")}</Badge> : null);
    return (
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          data-card-media
          className="relative aspect-square w-26 shrink-0 overflow-hidden rounded-md bg-primary-soft sm:w-36 lg:w-48 [&_figure]:aspect-square! [&_[data-skill-detail-cover]]:aspect-square!"
        >
          <div className="absolute inset-0 flex items-center">
            <div className="min-w-0 flex-1">
              {art ?? (
                <div aria-hidden className="flex aspect-square w-full items-center justify-center text-primary-text/40">
                  {TypeIcon && <TypeIcon size={32} />}
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          {(badges || rowStatus || time || pinned) && (
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden">{badges}</div>
              {rowStatus && <div className="relative z-10 flex shrink-0 flex-wrap items-center gap-1.5">{rowStatus}</div>}
              {pinned && <PinnedMark />}
              {time && <span className="shrink-0 text-caption text-text-muted">{time}</span>}
            </div>
          )}
          <div className="space-y-2">{title}</div>
          {meta && <p className="sr-only">{meta}</p>}
          {children && <div className="space-y-2 empty:hidden">{children}</div>}
          {rows.author && (
            <div className="relative z-10 mt-auto flex min-w-0 items-center">
              {author ? (
                <Link href={profileHref(author)} className="flex min-w-0 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus">
                  <Avatar src={author.avatarUrl} alt="" size={24} className="shrink-0" />
                  <span className="min-w-0 truncate text-small font-medium text-text hover:text-primary-text">{name}</span>
                </Link>
              ) : (
                <span className="flex min-w-0 items-center gap-2">
                  <Avatar src={null} alt="" size={24} className="shrink-0" />
                  <span className="min-w-0 truncate text-small font-medium text-text">{name}</span>
                </span>
              )}
            </div>
          )}
          {rowNote}
          {(footer || menu || canEdit) && (
            <div data-card-actions className="relative z-10 -ml-2 flex items-center">
              {rows.own && ownMetrics ? ownMetrics : footer}
              {canEdit && editHref && (
                <>
                  <span className="flex-1" />
                  <Link href={editHref} data-card-edit="" className={buttonClassName({ size: "sm", variant: "outline", className: "mx-1 shrink-0" })}>
                    {t("common.edit")}
                  </Link>
                </>
              )}
              {menu && <div className="relative z-20 focus-within:z-30">{menu}</div>}
            </div>
          )}
        </div>
      </div>
    );
  }
  return (
    <>
      <div data-card-media className="relative flex items-center overflow-hidden rounded-md bg-primary-soft max-sm:max-h-[calc(100vw-1.5rem)]">
        <div className="min-w-0 flex-1">
          {art ?? (
            <div aria-hidden className="flex aspect-[4/3] w-full items-center justify-center text-primary-text/40">
              {TypeIcon && <TypeIcon size={40} />}
            </div>
          )}
        </div>
        {status && <div className="absolute bottom-2 right-2 z-3 flex flex-wrap items-center justify-end gap-1.5">{status}</div>}
      </div>
      {(badges || time || pinned) && (
        <div className="mt-3 flex min-w-0 items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-x-3 overflow-hidden">{badges}</div>
          {pinned && <PinnedMark />}
          {time && <span className="shrink-0 text-caption text-text-muted">{time}</span>}
        </div>
      )}
      <div className={cn("space-y-2", badges || time || pinned ? "mt-2" : "mt-3")}>{title}</div>
      {meta && <p className="sr-only">{meta}</p>}
      {children && <div className="mt-2 space-y-2 empty:hidden">{children}</div>}
      <div className="relative z-10 flex items-center gap-2 pt-3">
        {author ? (
          <Link href={profileHref(author)} className="flex min-w-0 flex-1 items-center gap-2 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-focus">
            <Avatar src={author.avatarUrl} alt="" size={24} className="shrink-0" />
            <span className="min-w-0 truncate text-small font-medium text-text hover:text-primary-text">{name}</span>
          </Link>
        ) : (
          <span className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar src={null} alt="" size={24} className="shrink-0" />
            <span className="min-w-0 truncate text-small font-medium text-text">{name}</span>
          </span>
        )}
        {(footer || menu) && (
          <div data-card-actions className="-mr-2 flex shrink-0 items-center">
            {footer}
            {menu && <div className="relative z-20 focus-within:z-30">{menu}</div>}
          </div>
        )}
      </div>
    </>
  );
}

/** Search results (docs/history/477-*): the words that matched are marked in a row's title and summary. */
function highlightWords(text: string, words: string[] | undefined): React.ReactNode {
  if (!words || words.length === 0) return text;
  const pattern = new RegExp(`(${words.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return text.split(pattern).map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="rounded-xs bg-primary-soft px-0.5 text-inherit">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

/** The summary's `{variable}` jetons drawn as small mono chips (the same mark the prompt text uses); everything else is plain text (matched words marked in search rows). */
function summaryParts(text: string, words?: string[]): React.ReactNode[] {
  return text.split(/(\{[^{}\n]{1,40}\})/g).map((part, index) =>
    part.startsWith("{") && part.endsWith("}") ? (
      <span key={index} className="rounded-xs bg-primary-soft px-1 font-mono text-small font-medium text-primary-text">
        {part}
      </span>
    ) : (
      highlightWords(part, words)
    ),
  );
}

/**
 * Card title — a real link so keyboard users reach the item from its title (the stretched link behind the card is `tabIndex=-1`,
 * mouse-only) — plus the optional two-line Spectral summary (`description`; credit lines "Kaynak: …" belong on the detail page, not here).
 */
export function ContentCardTitle({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description?: string;
}) {
  const compact = useContext(CardCompactContext);
  const cardBody = compact ? "" : splitSourceNotes(description).body.trim();
  const words = useContext(CardLayoutContext)?.highlight;
  return (
    <>
      <h2 className="font-display text-h3 font-bold leading-[1.25] text-text [overflow-wrap:anywhere] [text-wrap:balance]">
        <Link
          href={href}
          data-card-link
          className="relative z-10 rounded-xs outline-none decoration-primary/40 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-focus"
        >
          {highlightWords(title, words)}
        </Link>
      </h2>
      {cardBody && <p data-card-summary className="line-clamp-2 break-words font-serif text-body leading-[1.45] text-text-secondary">{summaryParts(cardBody, words)}</p>}
    </>
  );
}

/** Raptiye işareti (docs/history/480-*): profilde "Profilde sabitle" ile en üste sabitlenmiş gönderiyi belli eder. */
function PinnedMark() {
  const { t } = useTranslation();
  return (
    <span role="img" aria-label={t("postMenu.pinned")} title={t("postMenu.pinned")} data-pinned-mark="" className="inline-flex shrink-0 items-center text-primary-text">
      <Pin size={16} />
    </span>
  );
}
