"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ImageIcon } from "@/components/icons/image-icon";
import { Braces } from "@/components/icons/braces";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
import { Plus } from "@/components/icons/plus";
import { Palette } from "@/components/icons/palette";
import { Presentation } from "@/components/icons/presentation";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { Button } from "@/components/ui/button";
import { ScrollRow } from "@/components/ui/scroll-row";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/auth-provider";
import { SpaceBoard } from "@/features/spaces/board/space-board";
import { SpaceProvider, useSpaceContext, type SpaceData } from "@/features/spaces/space-provider";
import { ImagesTab } from "@/features/spaces/tabs/images-tab";
import { NotesTab } from "@/features/spaces/tabs/notes-tab";
import { PaletteTab } from "@/features/spaces/tabs/palette-tab";
import { PromptsTab } from "@/features/spaces/tabs/prompts-tab";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchMyRole, fetchSpace, fetchSpaceConnections, fetchSpaceGroups, fetchSpaceItems, fetchSpacePalettes, type SpaceItem } from "@/lib/supabase/spaces";
import { proposeChange, submitReview, withdrawReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canAddToArea, canProposeChange, canSubmitItem, canWithdrawItem, type ProjectRole } from "@/lib/team-projects";
import { cn, presetHref, requestHref, workflowHref } from "@/lib/utils";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { ReviewChip } from "./project-ui";

/**
 * Alan görünümü (docs/history/362-*): ekip projesinin bir kabı (proje geneli, dosya ya da ek pano). Alan, Space motorunun gizli bir
 * satırıdır; bu yüzden mevcut Space sağlayıcısı ve sekmeleri (pano, görseller, promptlar, notlar, palet) AYNEN kullanılır — yalnız Space'e
 * özgü şeyler (paylaş, yorum/puan, etkinlik, üyeler, vitrin) yoktur. Onay durumu rozetle gösterilir; "Onaya gönder / geri çek" burada,
 * karar (onayla / değişiklik iste) lider kuyruğundadır.
 */

export type AreaTab = "board" | "images" | "prompts" | "notes" | "palette" | "content";
export const AREA_TABS: readonly AreaTab[] = ["board", "images", "prompts", "content", "notes", "palette"];

export function isAreaTab(value: unknown): value is AreaTab {
  return typeof value === "string" && (AREA_TABS as readonly string[]).includes(value);
}

const TAB_ICON: Record<AreaTab, IconComponent> = { board: Presentation, images: ImageIcon, prompts: SquareTerminal, content: WorkflowIcon, notes: StickyNote, palette: Palette };
const TAB_KEY: Record<AreaTab, TranslationKey> = {
  board: "tp.area.tab.board",
  images: "tp.area.tab.images",
  prompts: "tp.area.tab.prompts",
  content: "tp.area.tab.content",
  notes: "tp.area.tab.notes",
  palette: "tp.area.tab.palette",
};

type LoadState = { status: "loading" } | { status: "missing" } | { status: "error" } | { status: "ready"; data: SpaceData };

export interface AreaAddActions {
  /** Pano ekle penceresini açar (yoksa seçenek gösterilmez). */
  onNewBoard?: () => void;
  /** Değişken ekle penceresini açar (yalnız proje/dosya kapsamında anlamlı). */
  onNewVariable?: () => void;
  /** Bu alanda onay açık mı: "eklediğin şey taslak başlar" notu için. */
  reviewOn?: boolean;
}

export function TeamAreaView({
  spaceId,
  role,
  tab,
  hrefFor,
  reviewHref,
  add,
}: {
  spaceId: string;
  role: ProjectRole | null;
  tab: AreaTab;
  hrefFor: (tab: AreaTab) => string;
  reviewHref?: string | null;
  add?: AreaAddActions;
}) {
  const { t } = useTranslation();
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (authLoading) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset while the address/version changes; the fetch below fills it in
    setState((prev) => (prev.status === "ready" ? prev : { status: "loading" }));
    (async () => {
      try {
        const space = await fetchSpace(spaceId);
        if (!space) {
          if (alive) setState({ status: "missing" });
          return;
        }
        const [spaceRole, items, groups, palettes, connections] = await Promise.all([
          fetchMyRole(spaceId, userId),
          fetchSpaceItems(spaceId),
          fetchSpaceGroups(spaceId),
          fetchSpacePalettes(spaceId),
          fetchSpaceConnections(spaceId),
        ]);
        if (alive) setState({ status: "ready", data: { space, role: spaceRole, items, groups, palettes, connections } });
      } catch {
        if (alive) setState({ status: "error" });
      }
    })();
    return () => {
      alive = false;
    };
  }, [spaceId, userId, authLoading, version]);

  if (state.status === "loading") return <Skeleton className="h-64 w-full rounded-xl" />;
  if (state.status !== "ready") {
    return (
      <div className="space-y-3 rounded-xl border border-border-soft p-6 text-center">
        <p className="text-body text-text">{t(state.status === "missing" ? "tp.area.missing" : "tp.error.load")}</p>
        {state.status === "error" && (
          <Button variant="outline" onClick={reload}>
            {t("common.retry")}
          </Button>
        )}
      </div>
    );
  }
  return (
    <SpaceProvider key={`${state.data.space.id}-${version}`} initial={state.data} userId={userId}>
      <AreaBody role={role} tab={tab} hrefFor={hrefFor} reviewHref={reviewHref ?? null} onChanged={reload} add={add} />
    </SpaceProvider>
  );
}

function AreaBody({ role, tab, hrefFor, reviewHref, onChanged, add }: { role: ProjectRole | null; tab: AreaTab; hrefFor: (tab: AreaTab) => string; reviewHref: string | null; onChanged: () => void; add?: AreaAddActions }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { space, items, palettes, caps } = useSpaceContext();
  const [addOpen, setAddOpen] = useState(false);
  const count: Partial<Record<AreaTab, number>> = {
    images: items.filter((i) => i.kind === "image").length,
    prompts: items.filter((i) => i.kind === "prompt").length,
    content: items.filter((i) => i.kind === "content").length,
    notes: items.filter((i) => i.kind === "note").length,
    palette: palettes.length,
  };
  return (
    <div className="space-y-4" data-team-area={space.id} data-area-role={role ?? "none"} data-area-can-edit={caps.edit ? "1" : "0"}>
      {caps.edit && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setAddOpen(true)} data-area-add>
            <Plus size={16} aria-hidden />
            {t("tp.add.button")}
          </Button>
        </div>
      )}
      <AreaReviewPanel role={role} reviewHref={reviewHref} onChanged={onChanged} />
      <nav aria-label={t("tp.area.tabsAria")}>
        <ScrollRow className="gap-2">
          {AREA_TABS.map((key) => {
            const Icon = TAB_ICON[key];
            const active = tab === key;
            return (
              <Link
                key={key}
                href={hrefFor(key)}
                replace
                scroll={false}
                aria-current={active ? "page" : undefined}
                data-area-tab={key}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-small transition-colors",
                  active ? "border-primary bg-primary-soft font-semibold text-primary" : "border-border-soft bg-surface text-text-secondary hover:bg-surface-soft",
                )}
              >
                <Icon size={15} aria-hidden />
                {t(TAB_KEY[key])}
                {count[key] !== undefined && <span className="text-caption text-text-muted">{count[key]}</span>}
              </Link>
            );
          })}
        </ScrollRow>
      </nav>
      <div role="tabpanel" aria-label={t(TAB_KEY[tab])}>
        {tab === "board" && <SpaceBoard focusId={null} />}
        {tab === "images" && <ImagesTab focusId={null} onShowOnBoard={() => undefined} />}
        {tab === "prompts" && <PromptsTab onShowOnBoard={() => undefined} />}
        {tab === "notes" && <NotesTab onShowOnBoard={() => undefined} />}
        {tab === "palette" && <PaletteTab />}
        {tab === "content" && <AreaContentList />}
      </div>
      {addOpen && (
        <AddMenuDialog
          reviewOn={Boolean(add?.reviewOn)}
          onClose={() => setAddOpen(false)}
          onGo={(next) => {
            setAddOpen(false);
            router.replace(hrefFor(next), { scroll: false });
          }}
          onNewBoard={add?.onNewBoard ? () => { setAddOpen(false); add.onNewBoard?.(); } : undefined}
          onNewVariable={add?.onNewVariable ? () => { setAddOpen(false); add.onNewVariable?.(); } : undefined}
        />
      )}
    </div>
  );
}

/**
 * "Ekle" menüsü (mockup 4): ne eklemek istiyorsun? Görsel/prompt/not/palet ilgili sekmeye götürür (orada kendi ekleme düğmesi vardır);
 * workflow ve ayar paketi panodaki "Promptly'den ekle" aracıyla gelir; pano ve değişken kendi pencereleriyle açılır.
 */
function AddMenuDialog({ reviewOn, onClose, onGo, onNewBoard, onNewVariable }: { reviewOn: boolean; onClose: () => void; onGo: (tab: AreaTab) => void; onNewBoard?: () => void; onNewVariable?: () => void }) {
  const { t } = useTranslation();
  const options: { key: string; icon: IconComponent; label: TranslationKey; hint: TranslationKey; run: () => void }[] = [
    ...(onNewBoard ? [{ key: "board", icon: Presentation, label: "tp.add.board" as TranslationKey, hint: "tp.add.boardHint" as TranslationKey, run: onNewBoard }] : []),
    { key: "image", icon: ImageIcon, label: "tp.add.image", hint: "tp.add.imageHint", run: () => onGo("images") },
    { key: "prompt", icon: SquareTerminal, label: "tp.add.prompt", hint: "tp.add.promptHint", run: () => onGo("prompts") },
    { key: "workflow", icon: WorkflowIcon, label: "tp.add.workflow", hint: "tp.add.workflowHint", run: () => onGo("board") },
    { key: "preset", icon: SlidersHorizontal, label: "tp.add.preset", hint: "tp.add.presetHint", run: () => onGo("board") },
    ...(onNewVariable ? [{ key: "variable", icon: Braces, label: "tp.add.variable" as TranslationKey, hint: "tp.add.variableHint" as TranslationKey, run: onNewVariable }] : []),
    { key: "palette", icon: Palette, label: "tp.add.palette", hint: "tp.add.paletteHint", run: () => onGo("palette") },
    { key: "note", icon: StickyNote, label: "tp.add.note", hint: "tp.add.noteHint", run: () => onGo("notes") },
  ];
  return (
    <SpaceDialog title={t("tp.add.title")} onClose={onClose} formTestId="area-add-menu" footer={reviewOn ? <p className="mr-auto text-caption text-text-secondary">{t("tp.add.draftNote")}</p> : undefined}>
      <ul className="grid grid-cols-2 gap-3" data-testid="area-add-options">
        {options.map((option) => {
          const Icon = option.icon;
          return (
            <li key={option.key}>
              <button type="button" onClick={option.run} data-area-add-option={option.key} className="flex h-full w-full flex-col gap-2 rounded-2xl border border-border-soft bg-surface p-3.5 text-left transition-colors hover:bg-surface-soft">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
                  <Icon size={20} />
                </span>
                <span className="text-small font-bold text-text">{t(option.label)}</span>
                <span className="text-caption text-text-secondary">{t(option.hint)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </SpaceDialog>
  );
}

/** Workflow / ayar paketi / istek öğeleri (Space sekmelerinde ayrı liste yok; pano dışında burada görünür). */
function AreaContentList() {
  const { t } = useTranslation();
  const { items, sources } = useSpaceContext();
  const list = items.filter((item) => item.kind === "content");
  if (list.length === 0) return <p className="rounded-xl border border-dashed border-border-soft p-6 text-center text-small text-text-muted">{t("tp.area.contentEmpty")}</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2" data-testid="area-content-list">
      {list.map((item) => {
        const type = item.contentType;
        const found = type === "workflow" ? sources.workflows.get(item.contentId ?? "") : type === "preset" ? sources.presets.get(item.contentId ?? "") : sources.requests.get(item.contentId ?? "");
        const href = !found ? null : type === "workflow" ? workflowHref(found) : type === "preset" ? presetHref(found) : requestHref(found);
        const Icon = type === "workflow" ? WorkflowIcon : type === "preset" ? SlidersHorizontal : LayoutDashboard;
        return (
          <li key={item.id} className="flex items-center gap-3 rounded-xl border border-border-soft bg-surface p-3" data-area-content-item={item.id}>
            <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-primary-soft text-primary">
              <Icon size={18} />
            </span>
            <span className="min-w-0 flex-1">
              {href ? (
                <Link href={href} className="block truncate text-small font-semibold text-text hover:text-primary">
                  {found?.title}
                </Link>
              ) : (
                <span className="block truncate text-small text-text-muted">{t("tp.area.sourceUnavailable")}</span>
              )}
              <span className="block text-caption text-text-muted">{t(type === "workflow" ? "tp.kind.workflow" : type === "preset" ? "tp.kind.preset" : "tp.kind.request")}</span>
            </span>
            <ReviewChip state={item.revState} />
          </li>
        );
      })}
    </ul>
  );
}

const KIND_KEY: Record<SpaceItem["kind"], TranslationKey> = {
  image: "tp.kind.image",
  prompt: "tp.kind.prompt",
  note: "tp.kind.note",
  palette: "tp.kind.palette",
  content: "tp.kind.content",
};

/**
 * Onay paneli: benim (ve lider için tüm) onaysız öğelerim — taslak / bekleyen / değişiklik istenen. Düzenleyici buradan "onaya gönder / geri çek";
 * lider kuyruğa gider. Onay kapalı ve onaysız öğe yoksa panel hiç çizilmez.
 */
function AreaReviewPanel({ role, reviewHref, onChanged }: { role: ProjectRole | null; reviewHref: string | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { items, userId } = useSpaceContext();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = items.filter((item) => item.revState !== "approved");
  const [proposing, setProposing] = useState<SpaceItem | null>(null);
  const proposable = role === "edit" ? items.filter((item) => canProposeChange(role, { state: item.revState, createdBy: item.createdBy }) && item.kind !== "palette") : [];
  if ((open.length === 0 && proposable.length === 0) || !canAddToArea(role)) return null;

  const subject = (item: SpaceItem) => ({ state: item.revState, createdBy: item.createdBy });
  const submittable = open.filter((item) => canSubmitItem(role, subject(item), userId));
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
  const pendingForLead = role === "lead" ? open.filter((item) => item.revState === "pending").length : 0;

  return (
    <section className="space-y-3 rounded-xl border border-border-soft bg-surface p-4" data-testid="area-review-panel">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.review.panelTitle")}</h3>
        {submittable.length > 0 && (
          <Button type="button" size="sm" onClick={() => void run(() => submitReview(submittable.map((item) => item.id)))} disabled={busy} data-review-submit-all>
            {t("tp.review.submitAll", { count: submittable.length })}
          </Button>
        )}
        {pendingForLead > 0 && reviewHref && (
          <Link href={reviewHref} className="inline-flex h-8 items-center rounded-full bg-warning/10 px-3 text-caption font-semibold text-warning" data-review-open-queue>
            {t("tp.review.openQueue", { count: pendingForLead })}
          </Link>
        )}
      </div>
      <ul className="divide-y divide-border-soft">
        {open.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-2 py-2" data-review-item={item.id} data-review-state={item.revState}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-small font-semibold text-text">{item.title || t(KIND_KEY[item.kind])}</span>
              <span className="block text-caption text-text-muted">{t(KIND_KEY[item.kind])}</span>
              {item.revState === "changes" && item.revNote && <span className="mt-1 block rounded-md bg-danger/10 px-2 py-1 text-caption text-danger">{item.revNote}</span>}
            </span>
            <ReviewChip state={item.revState} />
            {canSubmitItem(role, subject(item), userId) && (
              <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void run(() => submitReview([item.id]))} data-review-submit>
                {t("tp.review.submit")}
              </Button>
            )}
            {canWithdrawItem(role, subject(item), userId) && (
              <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void run(() => withdrawReview([item.id]))} data-review-withdraw>
                {t("tp.review.withdraw")}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {proposable.length > 0 && (
        <details className="rounded-lg border border-border-soft px-3 py-2" data-area-propose>
          <summary className="cursor-pointer text-small font-semibold text-text-secondary">{t("tp.review.proposeTitle", { count: proposable.length })}</summary>
          <p className="mt-1 text-caption text-text-muted">{t("tp.review.proposeHint")}</p>
          <ul className="mt-2 divide-y divide-border-soft">
            {proposable.slice(0, 50).map((item) => (
              <li key={item.id} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-small text-text">{item.title || t(KIND_KEY[item.kind])}</span>
                <span className="text-caption text-text-muted">{t(KIND_KEY[item.kind])}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => setProposing(item)} data-area-propose-item={item.id}>
                  {t("tp.review.propose")}
                </Button>
              </li>
            ))}
          </ul>
        </details>
      )}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      {proposing && (
        <ProposeChangeDialog
          item={proposing}
          onClose={() => setProposing(null)}
          onDone={() => {
            setProposing(null);
            onChanged();
          }}
        />
      )}
    </section>
  );
}

/** Onaylı öğe için değişiklik önerisi: öneri ayrı tabloda durur (öğe değişmez); lider onaylarsa uygulanır. */
function ProposeChangeDialog({ item, onClose, onDone }: { item: SpaceItem; onClose: () => void; onDone: () => void }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(item.title);
  const [body, setBody] = useState(item.body);
  const [note, setNote] = useState(item.note);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await proposeChange(item.id, { title: title.trim(), body, note });
      onDone();
    } catch (e) {
      setError((e as TeamActionError).message);
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t("tp.review.proposeDialog")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="area-propose-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("tp.review.proposeSend")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldTitle")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-small" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldBody")}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={8000} rows={6} className="w-full rounded-xl border border-border bg-background px-3 py-2 font-mono text-small" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-label font-semibold text-text">{t("tp.review.fieldNote")}</span>
          <textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} rows={3} className="w-full rounded-xl border border-border bg-background px-3 py-2 text-small" />
        </label>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
