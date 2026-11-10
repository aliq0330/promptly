"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Check } from "@/components/icons/check";
import { Copy } from "@/components/icons/copy";
import { ImageIcon } from "@/components/icons/image-icon";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { Maximize2 } from "@/components/icons/maximize-2";
import { Palette } from "@/components/icons/palette";
import { Presentation } from "@/components/icons/presentation";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { Trash2 } from "@/components/icons/trash-2";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import type { IconComponent } from "@/components/icons/icon";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { resolveSource, sourceReasonKey, useItemTitle } from "@/features/spaces/space-items";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useSpaceContext } from "@/features/spaces/space-provider";
import { SpaceImage } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import { deleteSpacePalette, type SpaceItem, type SpacePalette } from "@/lib/supabase/spaces";
import { decideReview, submitReview, withdrawReview, type ProjectVariable } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canDeleteItem, canSubmitItem, canWithdrawItem, effectiveVariables, fillProjectVariables, type ProjectRole } from "@/lib/team-projects";
import { cn, formatRelativeTime } from "@/lib/utils";
import { ProjectPathBar, type PathCrumb } from "./project-path-bar";
import { ReviewChip } from "./project-ui";
import { paletteItemId, splitPromptTokens } from "@/lib/team-item-kit";

/**
 * Öğe detay sayfası (docs/history/364-*, mockup "Gezgin — öğe detay sayfaları"): alan listesinde bir satıra dokununca o öğenin kendi sayfası
 * açılır (`?item=<öğe kimliği>` ya da `?item=palette:<palet kimliği>`). Prompt (değişken doldurma + kopyalama + lider kararı), görsel
 * (büyütme + bilgi + "Panoda göster"), not, palet (renk kopyala) ve ⋯ menüsü (Panoda göster · Sil). Pano ayrı sayfadır (`sub=board`).
 * Veri ve yetki mevcut alan sağlayıcısından gelir; yeni sunucu çağrısı yoktur (karar: `team_review_*`, silme: Space öğe silme).
 */

export interface AreaItemContext {
  itemId: string;
  /** Üst çubuktaki yol (öğe adı en sona burada eklenir). */
  crumbs: PathCrumb[];
  listHref: string;
  /** "Panoda göster": panoyu bu öğeye odaklı açan adres. */
  boardHref: (focusId: string) => string;
  variables: ProjectVariable[];
  fileId: string | null;
}

type DetailKind = "prompt" | "image" | "note" | "palette" | "content";
const KIND_ICON: Record<DetailKind | "workflow" | "preset" | "request", IconComponent> = {
  prompt: SquareTerminal,
  image: ImageIcon,
  note: StickyNote,
  palette: Palette,
  content: LayoutDashboard,
  workflow: WorkflowIcon,
  preset: SlidersHorizontal,
  request: LayoutDashboard,
};
const KIND_TONE: Record<DetailKind | "workflow" | "preset" | "request", string> = {
  prompt: "bg-primary-soft text-primary",
  image: "bg-success/10 text-success",
  note: "bg-warning/10 text-warning",
  palette: "bg-secondary/10 text-secondary",
  content: "bg-surface-soft text-text-secondary",
  workflow: "bg-primary-soft text-primary",
  preset: "bg-secondary/10 text-secondary",
  request: "bg-surface-soft text-text-secondary",
};
const KIND_LABEL: Record<DetailKind | "workflow" | "preset" | "request", TranslationKey> = {
  prompt: "tp.kind.prompt",
  image: "tp.kind.image",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  content: "tp.kind.content",
  workflow: "tp.kind.workflow",
  preset: "tp.kind.preset",
  request: "tp.kind.request",
};

const CARD = "rounded-2xl border border-border-soft bg-surface";

export function AreaItemDetail({ ctx, role, onChanged }: { ctx: AreaItemContext; role: ProjectRole | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { items, palettes } = useSpaceContext();
  const paletteId = paletteItemId(ctx.itemId);
  const item = paletteId ? null : (items.find((entry) => entry.id === ctx.itemId) ?? null);
  const palette = paletteId ? (palettes.find((entry) => entry.id === paletteId) ?? null) : item?.kind === "palette" ? (palettes.find((entry) => entry.id === item.paletteId) ?? null) : null;

  if (!item && !palette) {
    return (
      <div className="space-y-4" data-testid="area-item-missing">
        <ProjectPathBar crumbs={ctx.crumbs} backHref={ctx.listHref} />
        <EmptyState icon={LayoutDashboard} title={t("tp.item.missing")} description={t("tp.item.missingBody")} action={{ label: t("tp.item.backToList"), href: ctx.listHref }} />
      </div>
    );
  }
  return <ItemBody ctx={ctx} role={role} item={palette ? null : item} palette={palette} onChanged={onChanged} />;
}

function ItemBody({ ctx, role, item, palette, onChanged }: { ctx: AreaItemContext; role: ProjectRole | null; item: SpaceItem | null; palette: SpacePalette | null; onChanged: () => void }) {
  const { t, language } = useTranslation();
  const router = useRouter();
  const { sources, readable, userId, caps, removeItems, setPalettes, setItems } = useSpaceContext();
  const itemTitle = useItemTitle();
  const [menu, setMenu] = useState<null | "menu" | "delete">(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [creator, setCreator] = useState<string | null>(null);

  const createdBy = item?.createdBy ?? palette?.createdBy ?? null;
  useEffect(() => {
    if (!createdBy) return;
    let alive = true;
    void fetchProfilesByIds([createdBy]).then((list) => {
      if (alive) setCreator(list[0]?.displayName ?? null);
    });
    return () => {
      alive = false;
    };
  }, [createdBy]);

  const resolved = item ? resolveSource(item, sources, readable) : null;
  const kind: DetailKind | "workflow" | "preset" | "request" = palette ? "palette" : item!.kind === "content" ? (item!.contentType === "workflow" ? "workflow" : item!.contentType === "preset" ? "preset" : "request") : item!.kind;
  const title = palette ? palette.name : itemTitle(item!);
  const Icon = KIND_ICON[kind];
  const createdAt = (item ?? palette)!.createdAt;
  const when = formatRelativeTime(createdAt, language);
  const state = item?.revState ?? "approved";
  const onBoard = Boolean(item && item.kind !== "content");

  const mayDelete = palette ? caps.edit : item ? canDeleteItem(role, { state: item.revState, createdBy: item.createdBy }, userId) : false;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      if (palette) {
        await deleteSpacePalette(palette.id);
        setPalettes((list) => list.filter((entry) => entry.id !== palette.id));
        setItems((list) => list.filter((entry) => entry.paletteId !== palette.id));
      } else if (item) {
        await removeItems([item.id]);
      }
      router.replace(ctx.listHref);
    } catch (e) {
      setError((e as Error).message || t("spaces.error.generic"));
      setBusy(false);
      setMenu(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="area-item-detail" data-item-kind={kind} data-item-state={state}>
      <ProjectPathBar crumbs={[...ctx.crumbs, { label: title }]} backHref={ctx.listHref} onMore={mayDelete || onBoard ? () => setMenu("menu") : undefined} />

      <header className="space-y-1.5 px-1">
        <h1 className="break-words text-h1 font-display font-extrabold leading-tight text-text" data-item-title>
          {title}
        </h1>
        <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full py-1 pl-2 pr-2.5 font-semibold", KIND_TONE[kind])}>
            <Icon size={14} aria-hidden />
            {t(KIND_LABEL[kind])}
          </span>
          {state !== "approved" && <ReviewChip state={state} />}
          <span>{creator ? t("tp.item.addedBy", { name: creator, when }) : t("tp.item.added", { when })}</span>
        </div>
      </header>

      {item?.revState === "changes" && item.revNote && (
        <div role="note" className="rounded-2xl border border-danger/30 bg-danger/10 p-3.5 text-small leading-relaxed text-danger" data-item-lead-note>
          <b className="mb-0.5 block">{t("tp.item.leadNote")}</b>
          {item.revNote}
        </div>
      )}

      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}

      {item?.kind === "prompt" && <PromptSection ctx={ctx} item={item} role={role} onChanged={onChanged} />}
      {item?.kind === "image" && <ImageSection ctx={ctx} item={item} title={title} creator={creator} />}
      {item?.kind === "note" && <NoteSection item={item} />}
      {palette && <PaletteSection palette={palette} />}
      {item?.kind === "content" && resolved?.href && (
        <Link href={resolved.href} className="inline-flex h-11 items-center gap-2 rounded-full border border-border bg-surface px-4 text-small font-semibold text-text hover:bg-surface-soft" data-item-open-content>
          <ArrowUpRight size={16} aria-hidden />
          {t("tp.item.openContent")}
        </Link>
      )}
      {item?.kind === "content" && !resolved?.href && resolved && sourceReasonKey(resolved.state) && <p className="rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary">{t(sourceReasonKey(resolved.state)!)}</p>}

      {item && item.kind !== "prompt" && <ReviewBar item={item} role={role} onChanged={onChanged} />}

      {menu === "menu" && (
        <SpaceDialog title={title} onClose={() => setMenu(null)} formTestId="area-item-menu">
          <ul className="-mx-1 space-y-0.5">
            {onBoard && item && (
              <li>
                <Link href={ctx.boardHref(item.id)} className="flex min-h-12 items-center gap-3 rounded-xl px-2 text-body font-semibold text-text hover:bg-surface-soft" data-item-show-on-board>
                  <Presentation size={20} aria-hidden />
                  {t("tp.item.showOnBoard")}
                </Link>
              </li>
            )}
            {mayDelete && (
              <li>
                <button type="button" onClick={() => setMenu("delete")} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-2 text-left text-body font-semibold text-danger hover:bg-danger/10" data-item-delete>
                  <Trash2 size={20} aria-hidden />
                  {t("tp.item.delete")}
                </button>
              </li>
            )}
          </ul>
        </SpaceDialog>
      )}
      {menu === "delete" && (
        <ConfirmDialog
          id="area-item-delete"
          title={t("tp.item.deleteTitle")}
          body={t("tp.item.deleteBody", { title })}
          confirmLabel={t("tp.item.delete")}
          danger
          busy={busy}
          error={error}
          onConfirm={() => void remove()}
          onCancel={() => setMenu(null)}
        />
      )}
    </div>
  );
}

/** Sağ altta sabit eylem çubuğu (telefonda alt menünün üstünde). */
function StickyBar({ children, testId }: { children: ReactNode; testId: string }) {
  return (
    <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-10 space-y-2 rounded-2xl border border-border-soft bg-surface p-3 shadow-pop md:bottom-4" data-testid={testId}>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Onay çubuğu: lider karar verir; ekleyen gönderir / geri çeker
// ---------------------------------------------------------------------------------------------------------------------------------------
function ReviewBar({ item, role, onChanged, extra }: { item: SpaceItem; role: ProjectRole | null; onChanged: () => void; extra?: ReactNode }) {
  const { t } = useTranslation();
  const { userId } = useSpaceContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const subject = { state: item.revState, createdBy: item.createdBy };
  const decide = role === "lead" && item.revState === "pending";
  const submit = canSubmitItem(role, subject, userId);
  const withdraw = canWithdrawItem(role, subject, userId);
  if (!decide && !submit && !withdraw && !extra) return null;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  const send = () => {
    if (!note.trim()) {
      setNoteError(true);
      return;
    }
    void run(() => decideReview([item.id], "changes", note.trim()));
  };

  return (
    <StickyBar testId="area-item-bar">
      {extra}
      {decide && changing && (
        <>
          <label className="block">
            <span className="mb-1.5 block text-small font-semibold text-text">{t("tp.item.askWhat")}</span>
            <textarea
              value={note}
              onChange={(event) => {
                setNote(event.target.value);
                setNoteError(false);
              }}
              rows={2}
              maxLength={2000}
              placeholder={t("tp.item.askPlaceholder")}
              className="w-full resize-none rounded-xl border border-border bg-background px-3 py-2 text-small"
              data-item-change-note
            />
          </label>
          {noteError && (
            <p role="alert" className="text-caption text-danger">
              {t("tp.review.noteRequired")}
            </p>
          )}
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => { setChanging(false); setNote(""); setNoteError(false); }} disabled={busy}>
              {t("common.cancel")}
            </Button>
            <Button type="button" className="h-12 flex-1" onClick={send} disabled={busy} data-item-send-changes>
              {t("tp.review.send")}
            </Button>
          </div>
        </>
      )}
      {decide && !changing && (
        <>
          <p className="text-center text-caption text-text-secondary">{t("tp.item.pendingLead")}</p>
          <div className="flex gap-2">
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => setChanging(true)} disabled={busy} data-item-ask-changes>
              {t("tp.review.requestChanges")}
            </Button>
            <Button type="button" className="h-12 flex-1 bg-success text-primary-foreground hover:bg-success/90" onClick={() => void run(() => decideReview([item.id], "approve"))} disabled={busy} data-item-approve>
              {t("tp.review.approve")}
            </Button>
          </div>
        </>
      )}
      {!decide && (submit || withdraw) && (
        <div className="flex gap-2">
          {submit && (
            <Button type="button" className="h-12 flex-1" onClick={() => void run(() => submitReview([item.id]))} disabled={busy} data-item-submit>
              {t("tp.review.submit")}
            </Button>
          )}
          {withdraw && (
            <Button type="button" variant="outline" className="h-12 flex-1" onClick={() => void run(() => withdrawReview([item.id]))} disabled={busy} data-item-withdraw>
              {t("tp.review.withdraw")}
            </Button>
          )}
        </div>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </StickyBar>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------------------------------------------------------------------
function PromptSection({ ctx, item, role, onChanged }: { ctx: AreaItemContext; item: SpaceItem; role: ProjectRole | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { sources, readable } = useSpaceContext();
  const [filled, setFilled] = useState(true);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">("idle");
  const resolved = resolveSource(item, sources, readable);
  const reason = item.isDraft ? null : sourceReasonKey(resolved.state);
  const text = item.isDraft ? item.body : (resolved.prompt?.promptText ?? item.body ?? "");
  const effective = effectiveVariables(ctx.variables, ctx.fileId);
  const values = new Map(effective.map((variable) => [variable.name.toLowerCase(), variable]));
  const tokens = splitPromptTokens(text);
  const names = [...new Set(tokens.filter((token) => token.variable).map((token) => token.variable!.toLowerCase()))];
  const copyText = filled ? fillProjectVariables(text, ctx.variables, ctx.fileId) : text;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(copyText);
      setCopyState("copied");
    } catch {
      setCopyState("failed");
    }
    setTimeout(() => setCopyState("idle"), 1600);
  };
  const copyLabel = copyState === "copied" ? t("common.copied") : copyState === "failed" ? t("spaces.share.copyFailed") : t(filled ? "tp.item.copyFilled" : "tp.item.copyRaw");

  return (
    <>
      {reason && <p className="rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary">{t(reason)}</p>}
      {text ? (
        <>
          <div className={cn(CARD, "p-3.5")} data-item-prompt-text>
            <div className="prompt-text whitespace-pre-wrap break-words text-small leading-relaxed text-text">
              {tokens.map((token, index) => {
                if (!token.variable) return <span key={index}>{token.text}</span>;
                const found = values.get(token.variable.toLowerCase());
                return (
                  <span key={index} className="rounded bg-secondary/10 px-0.5 font-medium text-secondary" data-item-token={token.variable}>
                    {filled && found ? found.value : token.text}
                  </span>
                );
              })}
            </div>
          </div>

          <div className={cn(CARD, "flex items-center gap-3 px-3.5 py-3")}>
            <span className="min-w-0 flex-1">
              <span className="block text-small font-bold text-text">{t("tp.item.fillTitle")}</span>
              <span className="block text-caption text-text-secondary">{t("tp.item.fillHint")}</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={filled}
              aria-label={t("tp.item.fillTitle")}
              onClick={() => {
                setFilled((value) => !value);
                setCopyState("idle");
              }}
              className={cn("flex h-8 w-[3.25rem] shrink-0 items-center rounded-full p-[3px] transition-colors", filled ? "justify-end bg-primary" : "justify-start bg-border-strong")}
              data-item-fill-switch
            >
              <span className="h-[1.625rem] w-[1.625rem] rounded-full bg-white shadow-xs" />
            </button>
          </div>

          <section className={cn(CARD, "overflow-hidden")} data-item-variables>
            <h2 className="px-3.5 pb-1.5 pt-3 text-caption font-bold uppercase tracking-wider text-text-secondary">{t("tp.item.vars")}</h2>
            {names.length === 0 ? (
              <p className="border-t border-border-soft px-3.5 py-3 text-small text-text-muted">{t("tp.item.varsNone")}</p>
            ) : (
              <ul>
                {names.map((name) => {
                  const found = values.get(name);
                  return (
                    <li key={name} className="flex items-center gap-2.5 border-t border-border-soft px-3.5 py-2.5 text-small" data-item-variable={name}>
                      <span className="prompt-text text-secondary">{`{${found?.name ?? name}}`}</span>
                      <span className={cn("min-w-0 flex-1 truncate font-semibold", found ? "text-text" : "text-text-muted")}>{found ? found.value : "—"}</span>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-caption font-semibold", !found ? "bg-warning/10 text-warning" : found.scope === "file" ? "bg-success/10 text-success" : "bg-surface-soft text-text-secondary")}>
                        {t(!found ? "tp.item.varMissing" : found.scope === "file" ? "tp.item.varFile" : "tp.item.varProject")}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="border-t border-border-soft px-3.5 py-2.5 text-caption leading-snug text-text-secondary">{t("tp.item.varOverride")}</p>
          </section>
        </>
      ) : (
        !reason && <p className="rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary">{t("tp.item.noText")}</p>
      )}
      {item.note && <p className="break-words rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary">{item.note}</p>}
      {resolved.href && !item.isDraft && (
        <Link href={resolved.href} className="inline-flex items-center gap-1 text-small font-semibold text-primary hover:underline">
          {t("spaces.source.open")}
          <ArrowUpRight size={14} aria-hidden />
        </Link>
      )}

      <ReviewBar
        item={item}
        role={role}
        onChanged={onChanged}
        extra={
          text ? (
            <Button type="button" className="h-12 w-full gap-2" onClick={() => void copy()} data-item-copy>
              {copyState === "copied" ? <Check size={18} aria-hidden /> : <Copy size={18} aria-hidden />}
              {copyLabel}
            </Button>
          ) : undefined
        }
      />
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Görsel
// ---------------------------------------------------------------------------------------------------------------------------------------
const IMAGE_FORMATS = new Set(["jpg", "jpeg", "png", "webp", "gif", "avif"]);
function imageFormat(url: string | null): string | null {
  const match = url?.split("?")[0].match(/\.([A-Za-z0-9]{2,5})$/);
  const ext = match?.[1]?.toLowerCase();
  return ext && IMAGE_FORMATS.has(ext) ? (ext === "jpeg" || ext === "jpg" ? "JPEG" : ext.toUpperCase()) : null;
}

function ImageSection({ ctx, item, title, creator }: { ctx: AreaItemContext; item: SpaceItem; title: string; creator: string | null }) {
  const { t } = useTranslation();
  const { sources, readable } = useSpaceContext();
  const [open, setOpen] = useState(false);
  const resolved = resolveSource(item, sources, readable);
  const reason = sourceReasonKey(resolved.state);
  const available = resolved.state === "own" || resolved.state === "ok";
  const format = imageFormat(item.mediaUrl);
  const rows: [string, string][] = [];
  if (item.mediaWidth && item.mediaHeight) rows.push([t("tp.item.size"), `${item.mediaWidth} × ${item.mediaHeight}`]);
  if (format) rows.push([t("tp.item.format"), format]);
  if (creator) rows.push([t("tp.item.addedByLabel"), creator]);
  return (
    <>
      <button
        type="button"
        onClick={() => available && setOpen(true)}
        disabled={!available}
        aria-label={t("media.viewFullscreen")}
        className="relative block aspect-[4/3] w-full overflow-hidden rounded-3xl bg-surface-soft"
        data-item-image
      >
        <SpaceImage url={item.mediaUrl} alt={title} available={available} reason={reason ? t(reason) : undefined} className="h-full w-full" imgClassName="object-cover" />
        {available && (
          <span className="absolute bottom-3 right-3 inline-flex h-9 items-center gap-1.5 rounded-full bg-black/70 px-3 text-small font-semibold text-white">
            <Maximize2 size={15} aria-hidden />
            {t("tp.item.enlarge")}
          </span>
        )}
      </button>
      {rows.length > 0 && (
        <dl className={cn(CARD, "overflow-hidden text-small")}>
          {rows.map(([label, value], index) => (
            <div key={label} className={cn("flex justify-between gap-3 px-3.5 py-2.5", index > 0 && "border-t border-border-soft")}>
              <dt className="text-text-secondary">{label}</dt>
              <dd className="min-w-0 truncate font-bold text-text">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {item.note && <p className="break-words rounded-xl bg-surface-soft px-3 py-2 text-small text-text-secondary">{item.note}</p>}
      <Link href={ctx.boardHref(item.id)} className="flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-border bg-surface text-small font-semibold text-text hover:bg-surface-soft" data-item-show-on-board-button>
        <Presentation size={18} aria-hidden />
        {t("tp.item.showOnBoard")}
      </Link>
      {open && item.mediaUrl && <ImageLightbox images={[{ url: item.mediaUrl, alt: title }]} onClose={() => setOpen(false)} />}
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Not
// ---------------------------------------------------------------------------------------------------------------------------------------
function NoteSection({ item }: { item: SpaceItem }) {
  const { t } = useTranslation();
  const { items } = useSpaceContext();
  const itemTitle = useItemTitle();
  const attached = item.attachedItemId ? items.find((entry) => entry.id === item.attachedItemId) : null;
  return (
    <>
      <div className="whitespace-pre-wrap break-words rounded-2xl border border-warning/30 bg-warning/10 p-4 text-body leading-relaxed text-text" data-item-note>
        {item.body || item.note}
      </div>
      <dl className={cn(CARD, "overflow-hidden text-small")}>
        <div className="flex justify-between gap-3 px-3.5 py-2.5">
          <dt className="text-text-secondary">{t("tp.item.noteLinked")}</dt>
          <dd className="min-w-0 truncate font-bold text-text">{attached ? itemTitle(attached) : t("tp.item.noteNoLink")}</dd>
        </div>
        <div className="flex justify-between gap-3 border-t border-border-soft px-3.5 py-2.5">
          <dt className="text-text-secondary">{t("tp.item.noteVisibility")}</dt>
          <dd className="min-w-0 truncate text-right font-bold text-text">{t(item.isPrivate ? "tp.item.noteVisPrivate" : "tp.item.noteVisAll")}</dd>
        </div>
      </dl>
    </>
  );
}

// ---------------------------------------------------------------------------------------------------------------------------------------
// Palet
// ---------------------------------------------------------------------------------------------------------------------------------------
function PaletteSection({ palette }: { palette: SpacePalette }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
      setCopied(hex);
      setTimeout(() => setCopied((current) => (current === hex ? null : current)), 1600);
    } catch {
      setCopied(null);
    }
  };
  return (
    <>
      {palette.description && <p className="break-words px-1 text-small text-text-secondary">{palette.description}</p>}
      {palette.colors.length > 0 && (
        <div className="flex h-20 overflow-hidden rounded-3xl border border-border-soft" aria-hidden data-item-swatches>
          {palette.colors.map((hex, index) => (
            <span key={`${hex}-${index}`} className="flex-1" style={{ backgroundColor: hex }} />
          ))}
        </div>
      )}
      <ul className={cn(CARD, "overflow-hidden")} data-item-palette-colors>
        {palette.colors.map((hex, index) => (
          <li key={`${hex}-${index}`} className={cn(index > 0 && "border-t border-border-soft")}>
            <button type="button" onClick={() => void copy(hex)} aria-label={t("tp.item.copyColor", { hex })} className="flex min-h-[3.5rem] w-full items-center gap-3 px-3.5 py-2 text-left hover:bg-surface-soft" data-item-color={hex}>
              <span aria-hidden className="h-9 w-9 shrink-0 rounded-[10px] border border-border" style={{ backgroundColor: hex }} />
              <span className="prompt-text min-w-0 flex-1 text-body font-semibold text-text">{hex}</span>
              <span className={cn("shrink-0 text-small font-semibold", copied === hex ? "text-success" : "text-primary")}>{copied === hex ? t("common.copied") : t("common.copy")}</span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
