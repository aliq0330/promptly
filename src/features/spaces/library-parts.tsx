"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { CircleCheck } from "@/components/icons/circle-check";
import { CircleDashed } from "@/components/icons/circle-dashed";
import { Pencil } from "@/components/icons/pencil";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { TrashIcon } from "@/components/ui/motion-icons";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { normalizeVariableName } from "@/lib/prompt-variables";
import { libraryVariableProblem, planLibraryFill, type LibraryVariableProblem } from "@/lib/space-library";
import { SPACE_VARIABLES_MAX, SPACE_VARIABLE_NAME_MAX, SPACE_VARIABLE_VALUE_MAX } from "@/lib/spaces";
import { fetchSpaceVariables, removeSpaceVariable, saveSpaceVariable, type SpaceVariable } from "@/lib/supabase/spaces";
import { cn, formatRelativeTime } from "@/lib/utils";
import { CopyTextButton } from "./space-items";
import { SpaceDialog } from "./space-modals";

/**
 * Ekip kütüphanesi parçaları (docs/history/348-*): onay rozeti, ekip ortak değişkenleri ve "Doldur ve kopyala" penceresi.
 * Kurallar saf `lib/space-library.ts`'tedir; gerçek yetki veritabanındadır (yalnız sahip onaylar, yalnız düzenleyici değişken yazar).
 */

export function ApprovalBadge({ state, approvedAt }: { state: "approved" | "pending"; approvedAt?: string | null }) {
  const { t, language } = useTranslation();
  const approved = state === "approved";
  const Icon = approved ? CircleCheck : CircleDashed;
  return (
    <span
      data-approval={state}
      title={approved && approvedAt ? t("spaces.library.approvedTitle", { time: formatRelativeTime(approvedAt, language) }) : undefined}
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-caption font-medium",
        approved ? "bg-success/12 text-success" : "bg-surface-soft text-text-muted",
      )}
    >
      <Icon size={12} aria-hidden />
      {approved ? t("spaces.library.approved") : t("spaces.library.pending")}
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Ortak değişkenler
// ---------------------------------------------------------------------------------------------

export interface LibraryVariables {
  variables: SpaceVariable[];
  /** `{ad}` → ekibin değeri (planLibraryFill'e verilir). */
  shared: Record<string, string>;
  loading: boolean;
  failed: boolean;
  save: (name: string, value: string) => Promise<void>;
  remove: (name: string) => Promise<void>;
}

/** Bir ekip kütüphanesinin ortak değişkenlerini yükler ve yazar. `enabled` yalnızken (üye değil / ekip kütüphanesi değil) hiç istek atılmaz. */
export function useLibraryVariables(spaceId: string, enabled: boolean): LibraryVariables {
  const [variables, setVariables] = useState<SpaceVariable[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    fetchSpaceVariables(spaceId)
      .then((list) => {
        if (!alive) return;
        setVariables(list);
        setFailed(false);
      })
      .catch(() => alive && setFailed(true))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [spaceId, enabled]);

  const save = useCallback(
    async (name: string, value: string) => {
      await saveSpaceVariable(spaceId, name, value);
      setVariables((list) => {
        const next = list.some((v) => v.name === name)
          ? list.map((v) => (v.name === name ? { ...v, value, updatedAt: new Date().toISOString() } : v))
          : [...list, { name, value, updatedAt: new Date().toISOString() }];
        return next.sort((a, b) => a.name.localeCompare(b.name));
      });
    },
    [spaceId],
  );

  const remove = useCallback(
    async (name: string) => {
      await removeSpaceVariable(spaceId, name);
      setVariables((list) => list.filter((v) => v.name !== name));
    },
    [spaceId],
  );

  const shared = useMemo(() => Object.fromEntries(variables.map((v) => [v.name, v.value])), [variables]);
  return { variables, shared, loading, failed, save, remove };
}

const PROBLEM_KEY: Record<Exclude<LibraryVariableProblem, null>, TranslationKey> = {
  name: "spaces.library.vars.errName",
  value: "spaces.library.vars.errValue",
  duplicate: "spaces.library.vars.errDuplicate",
};

export function LibraryVariablesPanel({ library, canEdit }: { library: LibraryVariables; canEdit: boolean }) {
  const { t } = useTranslation();
  const nameId = useId();
  const valueId = useId();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const existing = library.variables.map((v) => v.name);
  const full = !editing && library.variables.length >= SPACE_VARIABLES_MAX;

  function reset() {
    setName("");
    setValue("");
    setEditing(null);
    setProblem(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const found = libraryVariableProblem(name, value, existing, editing);
    if (found) {
      setProblem(t(PROBLEM_KEY[found]));
      return;
    }
    setBusy(true);
    setProblem(null);
    try {
      await library.save(normalizeVariableName(name), value);
      reset();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function remove(variable: SpaceVariable) {
    setProblem(null);
    try {
      await library.remove(variable.name);
      if (editing === variable.name) reset();
    } catch (err) {
      setProblem(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  return (
    <section data-testid="library-variables" className="space-y-3 rounded-lg border border-border-soft bg-surface p-4 shadow-xs">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-h3 font-semibold text-text">{t("spaces.library.vars.title")}</h2>
        <span className="text-caption text-text-muted">{t("spaces.library.vars.count", { count: library.variables.length, max: SPACE_VARIABLES_MAX })}</span>
      </div>
      <p className="text-small text-text-secondary">{t("spaces.library.vars.intro")}</p>
      <p className="rounded-md bg-surface-soft px-3 py-2 text-caption text-text-secondary">{t("spaces.library.vars.secretWarning")}</p>

      {library.failed ? (
        <p role="alert" className="text-small text-danger">
          {t("spaces.library.vars.loadError")}
        </p>
      ) : library.loading ? null : library.variables.length === 0 ? (
        <p className="text-small text-text-muted">{canEdit ? t("spaces.library.vars.emptyEditor") : t("spaces.library.vars.empty")}</p>
      ) : (
        <ul className="divide-y divide-border-soft rounded-md border border-border-soft">
          {library.variables.map((variable) => (
            <li key={variable.name} data-library-variable={variable.name} className="flex items-center gap-2 px-3 py-2">
              <code className="prompt-text shrink-0 rounded bg-surface-soft px-1.5 py-0.5 text-caption text-secondary">{`{${variable.name}}`}</code>
              <span className="min-w-0 flex-1 truncate text-small text-text">{variable.value || <span className="text-text-muted">—</span>}</span>
              {canEdit && (
                <span className="flex shrink-0 items-center">
                  <button
                    type="button"
                    onClick={() => {
                      setEditing(variable.name);
                      setName(variable.name);
                      setValue(variable.value);
                      setProblem(null);
                    }}
                    aria-label={t("spaces.library.vars.edit", { name: variable.name })}
                    className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text"
                  >
                    <Pencil size={14} aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(variable)}
                    aria-label={t("spaces.library.vars.delete", { name: variable.name })}
                    className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-danger"
                  >
                    <TrashIcon size={14} />
                  </button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {canEdit && (
        <form onSubmit={submit} noValidate className="grid gap-2 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] sm:items-end">
          <div>
            <label htmlFor={nameId} className={fieldLabelClassName}>
              {t("spaces.library.vars.name")}
            </label>
            <input
              id={nameId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={Boolean(editing)}
              maxLength={SPACE_VARIABLE_NAME_MAX + 2}
              placeholder={t("spaces.library.vars.namePlaceholder")}
              className={cn(fieldInputClassName, "prompt-text")}
            />
          </div>
          <div>
            <label htmlFor={valueId} className={fieldLabelClassName}>
              {t("spaces.library.vars.value")}
            </label>
            <input id={valueId} value={value} onChange={(event) => setValue(event.target.value)} maxLength={SPACE_VARIABLE_VALUE_MAX} className={fieldInputClassName} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={busy || full || !name.trim()}>
              {editing ? t("common.save") : t("spaces.library.vars.add")}
            </Button>
            {editing && (
              <Button type="button" variant="ghost" onClick={reset}>
                {t("common.cancel")}
              </Button>
            )}
          </div>
        </form>
      )}
      {full && canEdit && <p className="text-caption text-text-muted">{t("spaces.error.variableLimit")}</p>}
      {problem && (
        <p role="alert" className="text-small text-danger">
          {problem}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------
// Doldur ve kopyala
// ---------------------------------------------------------------------------------------------

/**
 * Bir prompt metnindeki `{değişken}`leri doldurup kopyalatır. Değeri ekibin ortak değişkeninde olanlar hazır gelir (yazarsan senin değerin
 * geçer); hiçbiri olmayanlar boş bırakılırsa kopyada `{ad}` olarak kalır (sessizce silinmez).
 */
export function FillAndCopyModal({ title, text, shared, onClose }: { title: string; text: string; shared: Record<string, string>; onClose: () => void }) {
  const { t } = useTranslation();
  const [entered, setEntered] = useState<Record<string, string>>({});
  const plan = useMemo(() => planLibraryFill(text, shared, entered), [text, shared, entered]);
  const baseId = useId();

  return (
    <SpaceDialog
      title={`${t("spaces.library.fillTitle")} · ${title}`}
      onClose={onClose}
      wide
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.close")}
          </Button>
          <CopyTextButton text={plan.text} size="md" />
        </>
      }
    >
      <div className="space-y-4" data-testid="library-fill">
        {plan.tokens.length === 0 ? (
          <p className="text-small text-text-secondary">{t("spaces.library.fillNoVariables")}</p>
        ) : (
          <>
            <p className="text-small text-text-secondary">{t("spaces.library.fillIntro")}</p>
            <div className="space-y-3">
              {plan.tokens.map((name, index) => {
                const team = Object.prototype.hasOwnProperty.call(shared, name) ? shared[name] : "";
                return (
                  <div key={name}>
                    <label htmlFor={`${baseId}-${index}`} className={cn(fieldLabelClassName, "flex items-center gap-2")}>
                      <code className="prompt-text text-secondary">{`{${name}}`}</code>
                      {team !== "" && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-caption font-medium text-primary">{t("spaces.library.fromTeam")}</span>}
                    </label>
                    <input
                      id={`${baseId}-${index}`}
                      data-fill-input={name}
                      value={entered[name] ?? ""}
                      onChange={(event) => setEntered((current) => ({ ...current, [name]: event.target.value }))}
                      placeholder={team !== "" ? team : t("spaces.library.fillPlaceholder")}
                      maxLength={SPACE_VARIABLE_VALUE_MAX}
                      className={fieldInputClassName}
                    />
                  </div>
                );
              })}
            </div>
            {plan.missing.length > 0 && (
              <p className="text-caption text-text-muted" data-testid="library-fill-missing">
                {t("spaces.library.fillMissing", { names: plan.missing.map((name) => `{${name}}`).join(", ") })}
              </p>
            )}
          </>
        )}
        <div>
          <p className={fieldLabelClassName}>{t("spaces.library.fillPreview")}</p>
          <pre data-testid="library-fill-preview" className="prompt-text whitespace-pre-wrap break-words rounded-md bg-surface-soft p-3 text-small text-text">
            {plan.text}
          </pre>
        </div>
      </div>
    </SpaceDialog>
  );
}
