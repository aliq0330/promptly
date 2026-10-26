"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, ListChecks, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import type { ChunkOutcome } from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { bulkDeletePrompts, bulkSetVisibility, fetchOwnPromptsForManage, type ManageRow, type ManageStatus } from "@/lib/supabase/admin-bulk-prompts";

type StatusFilter = "all" | ManageStatus;
type Action = "publish" | "hide" | "delete";

const SHOW_STEP = 100;
/** Bu sayının üstünde yayınlama da onay ister (akışa tek seferde çok içerik girmesin). */
const PUBLISH_CONFIRM_ABOVE = 100;

const STATE_KEYS: Record<ManageStatus, TranslationKey> = {
  draft: "exchange.manage.statusDraft",
  public: "exchange.manage.statusPublic",
  hidden: "exchange.manage.statusHidden",
};
const STATE_COLORS: Record<ManageStatus, string> = { draft: "text-text-muted", public: "text-success", hidden: "text-warning" };

/**
 * Moderatör aracı: KENDİ promptlarını (etikete göre; örn. toplu yüklediklerini) listeleyip seçerek yayınlar, gizler ya da siler
 * (docs/history/251-*). Her yazma `admin_bulk_*` RPC'sinden geçer (yalnız çağıranın kendi promptları; silme etkileşimli içeriği atlar).
 * Yayınlama/silme onay ister; "İlk N'i seç" akışı küçük gruplar hâlinde (damla damla) yayınlamak içindir.
 */
export function BulkManageCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const stopRef = useRef(false);
  const [tag, setTag] = useState("prompts.chat");
  const [rows, setRows] = useState<ManageRow[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [status, setStatus] = useState<StatusFilter>("all");
  const [query, setQuery] = useState("");
  const [shown, setShown] = useState(SHOW_STEP);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [firstN, setFirstN] = useState(50);
  const [pending, setPending] = useState<Action | null>(null);
  const [running, setRunning] = useState<Action | null>(null);
  const [progress, setProgress] = useState<ChunkOutcome | null>(null);
  const [outcome, setOutcome] = useState<{ action: Action; result: ChunkOutcome } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("tr");
    return (rows ?? []).filter((row) => (status === "all" || row.state === status) && (!needle || row.title.toLocaleLowerCase("tr").includes(needle)));
  }, [rows, status, query]);
  const counts = useMemo(() => {
    const all = rows ?? [];
    return { total: all.length, draft: all.filter((r) => r.state === "draft").length, public: all.filter((r) => r.state === "public").length, hidden: all.filter((r) => r.state === "hidden").length };
  }, [rows]);
  const busy = loading || running !== null;
  const selectedIds = useMemo(() => (rows ?? []).filter((row) => selected.has(row.id)).map((row) => row.id), [rows, selected]);

  async function load() {
    if (!user || busy) return;
    setLoading(true);
    setLoadError(false);
    setOutcome(null);
    setPending(null);
    try {
      const result = await fetchOwnPromptsForManage(user.id, tag.trim());
      setRows(result.rows);
      setTruncated(result.truncated);
      setSelected(new Set());
      setShown(SHOW_STEP);
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function execute(action: Action) {
    if (selectedIds.length === 0 || busy) return;
    stopRef.current = false;
    setPending(null);
    setOutcome(null);
    setRunning(action);
    setProgress({ done: 0, total: selectedIds.length, affected: 0, skipped: 0, stoppedAt: null, error: null });
    const options = { onProgress: setProgress, shouldStop: () => stopRef.current };
    const result = action === "delete" ? await bulkDeletePrompts(selectedIds, options) : await bulkSetVisibility(selectedIds, action === "publish", options);
    setOutcome({ action, result });
    setProgress(null);
    setRunning(null);
    // Durumlar değişti: listeyi yeniden oku (seçim temizlenir).
    if (user) {
      try {
        const fresh = await fetchOwnPromptsForManage(user.id, tag.trim());
        setRows(fresh.rows);
        setTruncated(fresh.truncated);
        setSelected(new Set());
      } catch {
        setLoadError(true);
      }
    }
  }

  function request(action: Action) {
    if (action === "delete" || (action === "publish" && selectedIds.length > PUBLISH_CONFIRM_ABOVE)) setPending(action);
    else void execute(action);
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const doneKey: Record<Action, TranslationKey> = { publish: "exchange.manage.donePublished", hide: "exchange.manage.doneHidden", delete: "exchange.manage.doneDeleted" };

  return (
    <section className="space-y-3 rounded-lg border border-border bg-surface p-4" data-testid="bulk-manage">
      <div className="flex items-start gap-3">
        <ListChecks size={18} className="mt-0.5 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-text">{t("exchange.manage.title")}</h2>
          <p className="text-small text-text-secondary">{t("exchange.manage.hint")}</p>
        </div>
      </div>

      <div className="space-y-1">
        <label className="block text-label font-semibold text-text" htmlFor="manage-tag">
          {t("exchange.manage.tagLabel")}
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="manage-tag"
            type="text"
            value={tag}
            onChange={(event) => setTag(event.target.value)}
            disabled={busy}
            maxLength={80}
            className="h-10 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-small text-text sm:max-w-xs"
            data-testid="manage-tag"
          />
          <Button type="button" size="sm" variant="outline" onClick={() => void load()} disabled={busy || !user} data-testid="manage-load">
            {loading && <Loader2 size={14} className="animate-spin" />}
            {loading ? t("exchange.manage.loading") : t("exchange.manage.load")}
          </Button>
        </div>
      </div>

      {loadError && (
        <p role="alert" className="text-small text-danger" data-testid="manage-load-error">
          {t("exchange.manage.loadFailed")}
        </p>
      )}

      {rows && (
        <div className="space-y-3">
          <p className="text-small font-semibold text-text" data-testid="manage-summary">
            {t("exchange.manage.summary", counts as unknown as Record<string, number>)}
          </p>
          {truncated && <p className="text-caption text-warning">{t("exchange.manage.truncated")}</p>}
          {rows.length === 0 ? (
            <p className="text-small text-text-secondary">{t("exchange.manage.empty")}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={status}
                  onChange={(event) => (setStatus(event.target.value as StatusFilter), setShown(SHOW_STEP))}
                  aria-label={t("exchange.manage.statusAria")}
                  className="h-9 rounded-md border border-border bg-background px-2 text-small text-text"
                  data-testid="manage-status"
                >
                  <option value="all">{t("exchange.manage.statusAll")}</option>
                  <option value="draft">{t("exchange.manage.statusDraft")}</option>
                  <option value="public">{t("exchange.manage.statusPublic")}</option>
                  <option value="hidden">{t("exchange.manage.statusHidden")}</option>
                </select>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => (setQuery(event.target.value), setShown(SHOW_STEP))}
                  placeholder={t("exchange.manage.search")}
                  aria-label={t("exchange.manage.search")}
                  className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-small text-text sm:max-w-xs"
                  data-testid="manage-search"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 text-small text-text-secondary">
                <Button type="button" size="sm" variant="outline" disabled={busy || filtered.length === 0} onClick={() => setSelected(new Set(filtered.map((r) => r.id)))} data-testid="manage-select-all">
                  {t("exchange.manage.selectAll", { count: filtered.length })}
                </Button>
                <span className="flex items-center gap-1">
                  {t("exchange.manage.firstN")}
                  <input
                    type="number"
                    min={1}
                    max={10000}
                    value={firstN}
                    onChange={(event) => setFirstN(Math.max(1, Math.min(10000, Number(event.target.value) || 1)))}
                    aria-label={t("exchange.manage.firstN")}
                    className="h-9 w-20 rounded-md border border-border bg-background px-2 text-small text-text"
                    data-testid="manage-first-n"
                  />
                  <Button type="button" size="sm" variant="outline" disabled={busy || filtered.length === 0} onClick={() => setSelected(new Set(filtered.slice(0, firstN).map((r) => r.id)))} data-testid="manage-select-first">
                    {t("exchange.manage.firstNSelect")}
                  </Button>
                </span>
                <Button type="button" size="sm" variant="ghost" disabled={busy || selected.size === 0} onClick={() => setSelected(new Set())} data-testid="manage-clear">
                  {t("exchange.manage.clear")}
                </Button>
              </div>

              <ul className="max-h-80 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft" data-testid="manage-list">
                {filtered.slice(0, shown).map((row) => (
                  <li key={row.id} data-state={row.state} data-testid="manage-row">
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2">
                      <input type="checkbox" checked={selected.has(row.id)} onChange={() => toggle(row.id)} disabled={busy} className="accent-primary" />
                      <span className="min-w-0 flex-1 truncate text-small text-text">{row.title}</span>
                      {row.engaged && <span className="shrink-0 text-caption text-text-muted">{t("exchange.manage.engaged")}</span>}
                      <span className={`shrink-0 text-caption font-semibold ${STATE_COLORS[row.state]}`}>{t(STATE_KEYS[row.state])}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-between gap-2 text-caption text-text-muted">
                <span data-testid="manage-showing">{t("exchange.manage.showing", { shown: Math.min(shown, filtered.length), total: filtered.length })}</span>
                {filtered.length > shown && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setShown((n) => n + SHOW_STEP)} data-testid="manage-more">
                    {t("exchange.manage.more")}
                  </Button>
                )}
              </div>

              <div className="space-y-2 border-t border-border-soft pt-3">
                <p className="text-small font-semibold text-text" data-testid="manage-selected">
                  {t("exchange.manage.selected", { count: selectedIds.length })}
                </p>
                {pending ? (
                  <div role="alertdialog" className="space-y-2 rounded-lg border border-danger/40 bg-danger/5 p-3" data-testid="manage-confirm">
                    <p className="text-small text-text">{t(pending === "delete" ? "exchange.manage.deleteConfirm" : "exchange.manage.publishConfirm", { count: selectedIds.length })}</p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="danger" onClick={() => void execute(pending)} data-testid="manage-confirm-yes">
                        {t(pending === "delete" ? "exchange.manage.confirmDelete" : "exchange.manage.confirmPublish")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPending(null)} data-testid="manage-cancel">
                        {t("exchange.manage.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" onClick={() => request("publish")} disabled={busy || selectedIds.length === 0} data-testid="manage-publish">
                      <Eye size={14} />
                      {t("exchange.manage.publish", { count: selectedIds.length })}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => request("hide")} disabled={busy || selectedIds.length === 0} data-testid="manage-hide">
                      <EyeOff size={14} />
                      {t("exchange.manage.hide")}
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => request("delete")} disabled={busy || selectedIds.length === 0} data-testid="manage-delete" className="text-danger">
                      <Trash2 size={14} />
                      {t("exchange.manage.delete")}
                    </Button>
                    {running && (
                      <Button type="button" size="sm" variant="ghost" onClick={() => (stopRef.current = true)} data-testid="manage-stop">
                        {t("exchange.manage.stop")}
                      </Button>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {progress && (
        <div className="space-y-1" data-testid="manage-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${percent}%` }} />
          </div>
          <p className="text-caption text-text-secondary">{t("exchange.manage.progress", { done: progress.done, total: progress.total })}</p>
        </div>
      )}

      {outcome && (
        <div className="space-y-1 text-small" data-testid="manage-outcome">
          <p className="text-text">{t(doneKey[outcome.action], { affected: outcome.result.affected, skipped: outcome.result.skipped })}</p>
          {outcome.result.stoppedAt !== null && (
            <p className="text-warning" data-testid="manage-partial">
              {t("exchange.manage.partial", { done: outcome.result.done, total: outcome.result.total })}
            </p>
          )}
          {outcome.result.error && (
            <p role="alert" className="text-danger" data-testid="manage-error">
              {outcome.result.error}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
