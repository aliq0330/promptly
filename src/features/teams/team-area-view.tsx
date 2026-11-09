"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { ImageIcon } from "@/components/icons/image-icon";
import { LayoutDashboard } from "@/components/icons/layout-dashboard";
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
import { submitReview, withdrawReview } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { canAddToArea, canSubmitItem, canWithdrawItem, type ProjectRole } from "@/lib/team-projects";
import { cn, presetHref, requestHref, workflowHref } from "@/lib/utils";
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

export function TeamAreaView({ spaceId, role, tab, hrefFor, reviewHref }: { spaceId: string; role: ProjectRole | null; tab: AreaTab; hrefFor: (tab: AreaTab) => string; reviewHref?: string | null }) {
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
      <AreaBody role={role} tab={tab} hrefFor={hrefFor} reviewHref={reviewHref ?? null} onChanged={reload} />
    </SpaceProvider>
  );
}

function AreaBody({ role, tab, hrefFor, reviewHref, onChanged }: { role: ProjectRole | null; tab: AreaTab; hrefFor: (tab: AreaTab) => string; reviewHref: string | null; onChanged: () => void }) {
  const { t } = useTranslation();
  const { space, items, palettes, caps } = useSpaceContext();
  const count: Partial<Record<AreaTab, number>> = {
    images: items.filter((i) => i.kind === "image").length,
    prompts: items.filter((i) => i.kind === "prompt").length,
    content: items.filter((i) => i.kind === "content").length,
    notes: items.filter((i) => i.kind === "note").length,
    palette: palettes.length,
  };
  return (
    <div className="space-y-4" data-team-area={space.id} data-area-role={role ?? "none"} data-area-can-edit={caps.edit ? "1" : "0"}>
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
    </div>
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
  if (open.length === 0 || !canAddToArea(role)) return null;

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
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </section>
  );
}
