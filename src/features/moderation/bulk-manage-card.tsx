"use client";

import { useMemo, useRef, useState } from "react";
import { Eye, EyeOff, ListChecks, Loader2, Tags, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import type { ChunkOutcome } from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { AutoTagOptionsField } from "@/features/moderation/auto-tag-options";
import { autoTagsEnabled, type AutoTagOptions } from "@/lib/exchange/auto-tags";
import { autoTagOwnPrompts, type AutoTagOutcome, type AutoTagProgress } from "@/lib/supabase/admin-auto-tags";
import { bulkDeletePrompts, bulkSetVisibility, fetchDeleteImpact, fetchOwnPromptsForManage, type DeleteImpact, type ManageRow, type ManageStatus } from "@/lib/supabase/admin-bulk-prompts";
import { fetchAllTags } from "@/lib/supabase/tags";

type StatusFilter = "all" | ManageStatus;
type Action = "publish" | "hide" | "delete";
type Running = Action | "tag";
type ImpactState = { status: "loading" } | { status: "failed" } | { status: "ready"; impact: DeleteImpact };

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
 * Moderatör aracı: KENDİ promptlarını (etikete göre; örn. toplu yüklediklerini) listeleyip seçerek yayınlar, gizler, siler ya da etiketler
 * (docs/history/251-*, 252-*). Her yazma `admin_bulk_*` RPC'sinden geçer (yalnız çağıranın kendi promptları). Silme önce etkisini sayar
 * (beğeni/yorum/kayıt/alıntı…); etkileşimi olanlar varsayılan olarak ATLANIR, "etkileşimi olanları da sil" açıkça seçilirse onlarla birlikte
 * silinir. Yayınlama/silme onay ister; "İlk N'i seç" akışı küçük gruplar hâlinde (damla damla) yayınlamak içindir.
 */
export function BulkManageCard() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const stopRef = useRef(false);
  const impactRequest = useRef(0);
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
  const [running, setRunning] = useState<Running | null>(null);
  const [progress, setProgress] = useState<ChunkOutcome | null>(null);
  const [outcome, setOutcome] = useState<{ action: Action; force: boolean; result: ChunkOutcome } | null>(null);
  const [impact, setImpact] = useState<ImpactState | null>(null);
  const [force, setForce] = useState(false);
  const [tagPanel, setTagPanel] = useState(false);
  const [tagOptions, setTagOptions] = useState<AutoTagOptions>({ automatic: true, suggested: false });
  const [tagProgress, setTagProgress] = useState<AutoTagProgress | null>(null);
  const [tagOutcome, setTagOutcome] = useState<AutoTagOutcome | null>(null);

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
    const forced = action === "delete" && force;
    setPending(null);
    setImpact(null);
    setOutcome(null);
    setTagOutcome(null);
    setRunning(action);
    setProgress({ done: 0, total: selectedIds.length, affected: 0, skipped: 0, stoppedAt: null, error: null });
    const options = { onProgress: setProgress, shouldStop: () => stopRef.current };
    const result = action === "delete" ? await bulkDeletePrompts(selectedIds, { ...options, force: forced }) : await bulkSetVisibility(selectedIds, action === "publish", options);
    setOutcome({ action, force: forced, result });
    setForce(false);
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
    if (action === "delete") {
      setForce(false);
      const token = ++impactRequest.current;
      setImpact({ status: "loading" });
      setPending("delete");
      fetchDeleteImpact(selectedIds).then(
        (result) => token === impactRequest.current && setImpact({ status: "ready", impact: result }),
        () => token === impactRequest.current && setImpact({ status: "failed" }),
      );
    } else if (action === "publish" && selectedIds.length > PUBLISH_CONFIRM_ABOVE) setPending(action);
    else void execute(action);
  }

  function cancelPending() {
    impactRequest.current += 1;
    setPending(null);
    setImpact(null);
    setForce(false);
  }

  async function runAutoTag() {
    if (!user || selectedIds.length === 0 || busy || !autoTagsEnabled(tagOptions)) return;
    stopRef.current = false;
    setOutcome(null);
    setTagOutcome(null);
    setRunning("tag");
    setTagProgress({ done: 0, total: selectedIds.length, tagged: 0, added: 0, created: 0 });
    const catalog = await fetchAllTags();
    const result = await autoTagOwnPrompts(selectedIds, user.id, catalog, tagOptions, { onProgress: setTagProgress, shouldStop: () => stopRef.current });
    setTagOutcome(result);
    setTagProgress(null);
    setRunning(null);
  }

  const percent = progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  const tagPercent = tagProgress && tagProgress.total > 0 ? Math.round((tagProgress.done / tagProgress.total) * 100) : 0;
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
                    {pending === "delete" && impact?.status === "loading" && (
                      <p className="text-caption text-text-secondary" data-testid="manage-impact-loading">
                        {t("exchange.manage.impactLoading")}
                      </p>
                    )}
                    {pending === "delete" && impact?.status === "failed" && (
                      <p role="alert" className="text-caption text-danger" data-testid="manage-impact-failed">
                        {t("exchange.manage.impactFailed")}
                      </p>
                    )}
                    {pending === "delete" && impact?.status === "ready" &&
                      (impact.impact.engaged === 0 ? (
                        <p className="text-caption text-text-secondary" data-testid="manage-impact-none">
                          {t("exchange.manage.impactNone")}
                        </p>
                      ) : (
                        <div className="space-y-2" data-testid="manage-impact">
                          <p className="text-small font-semibold text-text">{t("exchange.manage.impactEngaged", impact.impact as unknown as Record<string, number>)}</p>
                          <p className="text-caption text-text-secondary" data-testid="manage-impact-goes">
                            {t("exchange.manage.impactGoes", impact.impact as unknown as Record<string, number>)}
                          </p>
                          <p className="text-caption text-text-secondary" data-testid="manage-impact-emptied">
                            {t("exchange.manage.impactEmptied", impact.impact as unknown as Record<string, number>)}
                          </p>
                          <label className="flex cursor-pointer items-start gap-2 text-small text-text">
                            <input type="checkbox" checked={force} onChange={(event) => setForce(event.target.checked)} className="mt-1 accent-primary" data-testid="manage-force" />
                            <span>
                              <span className="block font-semibold">{t("exchange.manage.forceLabel")}</span>
                              <span className="block text-caption text-text-secondary">{t("exchange.manage.forceHint")}</span>
                            </span>
                          </label>
                        </div>
                      ))}
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" variant="danger" onClick={() => void execute(pending)} disabled={pending === "delete" && impact?.status !== "ready"} data-testid="manage-confirm-yes">
                        {t(pending === "delete" ? (force ? "exchange.manage.confirmDeleteForce" : "exchange.manage.confirmDelete") : "exchange.manage.confirmPublish")}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={cancelPending} data-testid="manage-cancel">
                        {t("exchange.manage.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Button type="button" size="sm" onClick={() => request("publish")} disabled={busy || selectedIds.length === 0} data-testid="manage-publish">
                        <Eye size={14} />
                        {t("exchange.manage.publish", { count: selectedIds.length })}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => request("hide")} disabled={busy || selectedIds.length === 0} data-testid="manage-hide">
                        <EyeOff size={14} />
                        {t("exchange.manage.hide")}
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => setTagPanel((open) => !open)} disabled={busy || selectedIds.length === 0} aria-expanded={tagPanel} data-testid="manage-tag-open">
                        <Tags size={14} />
                        {t("exchange.autotag.open")}
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
                    {tagPanel && (
                      <div className="space-y-2 rounded-lg border border-border-soft p-3" data-testid="manage-tag-panel">
                        <AutoTagOptionsField value={tagOptions} onChange={setTagOptions} disabled={busy} testId="manage-autotag" />
                        <p className="text-caption text-text-muted">{t(autoTagsEnabled(tagOptions) ? "exchange.autotag.existingKept" : "exchange.autotag.pickOne")}</p>
                        <Button type="button" size="sm" onClick={() => void runAutoTag()} disabled={busy || selectedIds.length === 0 || !autoTagsEnabled(tagOptions)} data-testid="manage-tag-run">
                          {running === "tag" && <Loader2 size={14} className="animate-spin" />}
                          {t("exchange.autotag.run", { count: selectedIds.length })}
                        </Button>
                      </div>
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

      {tagProgress && (
        <div className="space-y-1" data-testid="manage-tag-progress">
          <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={tagPercent} className="h-2 w-full overflow-hidden rounded-full bg-surface-soft">
            <div className="h-full bg-primary transition-[width] duration-200" style={{ width: `${tagPercent}%` }} />
          </div>
          <p className="text-caption text-text-secondary">{t("exchange.autotag.progress", { done: tagProgress.done, total: tagProgress.total })}</p>
        </div>
      )}

      {tagOutcome && (
        <div className="space-y-1 text-small" data-testid="manage-tag-outcome">
          <p className="text-text">{t("exchange.autotag.done", { tagged: tagOutcome.tagged, added: tagOutcome.added, created: tagOutcome.created })}</p>
          {tagOutcome.stoppedAt !== null && (
            <p className="text-warning" data-testid="manage-tag-partial">
              {t("exchange.manage.partial", { done: tagOutcome.done, total: tagOutcome.total })}
            </p>
          )}
          {tagOutcome.error && (
            <p role="alert" className="text-danger" data-testid="manage-tag-error">
              {tagOutcome.error}
            </p>
          )}
        </div>
      )}

      {outcome && (
        <div className="space-y-1 text-small" data-testid="manage-outcome">
          <p className="text-text">{t(outcome.action === "delete" && outcome.force ? "exchange.manage.doneDeletedForce" : doneKey[outcome.action], { affected: outcome.result.affected, skipped: outcome.result.skipped })}</p>
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
