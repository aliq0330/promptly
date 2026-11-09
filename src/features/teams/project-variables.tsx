"use client";

import { useState } from "react";
import { Pencil } from "@/components/icons/pencil";
import { Plus } from "@/components/icons/plus";
import { Trash2 } from "@/components/icons/trash-2";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteVariable, type ProjectVariable } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { effectiveVariables, projectRoleAtLeast, type ProjectRole } from "@/lib/team-projects";
import { cn } from "@/lib/utils";
import { VariableDialog } from "./project-dialogs";

/**
 * Proje / dosya değişkenleri (docs/history/362-*). `fileId` verilirse dosyadaki + projeden gelen değişkenler birlikte gösterilir;
 * aynı ad iki yerde varsa DOSYADAKİ geçerlidir ("projeyi ezer" etiketi). Düzenleyici+ yazar; değişkenler onay kapsamı dışındadır.
 */
export function ProjectVariablesPanel({
  projectId,
  fileId,
  variables,
  role,
  onChanged,
}: {
  projectId: string;
  fileId: string | null;
  variables: ProjectVariable[];
  role: ProjectRole | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ProjectVariable | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = projectRoleAtLeast(role, "edit");
  const effective = effectiveVariables(variables, fileId);
  const byKey = (name: string, scope: "file" | "project") => variables.find((v) => v.name.toLowerCase() === name.toLowerCase() && (scope === "file" ? v.fileId === fileId : v.fileId === null)) ?? null;

  const remove = async (variable: ProjectVariable) => {
    setError(null);
    try {
      await deleteVariable(variable.id);
      onChanged();
    } catch (e) {
      setError((e as TeamActionError).message);
    }
  };

  return (
    <div className="space-y-3 rounded-xl border border-border-soft bg-surface p-4" data-testid="project-variables" data-variable-scope={fileId ? "file" : "project"}>
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t(fileId ? "tp.variable.fileTitle" : "tp.variable.projectTitle")}</h3>
        {canWrite && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-variable-add>
            <Plus size={12} aria-hidden />
            {t("tp.variable.add")}
          </button>
        )}
      </div>
      {effective.length === 0 ? (
        <p className="text-small text-text-muted">{t(fileId ? "tp.variable.emptyFile" : "tp.variable.emptyProject")}</p>
      ) : (
        <ul className="space-y-2">
          {effective.map((variable) => {
            const own = byKey(variable.name, variable.scope);
            return (
              <li key={`${variable.scope}-${variable.name}`} className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-2" data-variable-row={variable.name}>
                <span className="font-mono text-small font-semibold text-secondary">{`{${variable.name}}`}</span>
                <span className="min-w-0 flex-1 truncate text-small text-text">{variable.value || <span className="text-text-muted">{t("tp.variable.noValue")}</span>}</span>
                {fileId && (
                  <span className={cn("inline-flex h-5 shrink-0 items-center rounded-full px-2 text-[11px] font-semibold", variable.scope === "file" ? "bg-primary-soft text-primary" : "bg-surface text-text-muted")}>
                    {t(variable.scope === "file" ? "tp.variable.fromFile" : "tp.variable.fromProject")}
                  </span>
                )}
                {canWrite && own && variable.scope === (fileId ? "file" : "project") && (
                  <>
                    <button type="button" onClick={() => setEditing(own)} aria-label={t("tp.variable.edit")} className="grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-surface">
                      <Pencil size={13} aria-hidden />
                    </button>
                    <button type="button" onClick={() => void remove(own)} aria-label={t("tp.variable.delete")} className="grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-surface">
                      <Trash2 size={13} aria-hidden />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {fileId && effective.some((variable) => variable.overrides) && <p className="text-caption text-text-muted">{t("tp.variable.overrideNote")}</p>}
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
      {editing && (
        <VariableDialog
          projectId={projectId}
          fileId={fileId}
          variable={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
        />
      )}
    </div>
  );
}
