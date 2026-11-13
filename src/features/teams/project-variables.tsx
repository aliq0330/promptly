"use client";

import { useState } from "react";
import { Pencil } from "@/components/icons/pencil";
import { Plus } from "@/components/icons/plus";
import { Trash2 } from "@/components/icons/trash-2";
import { useTranslation } from "@/lib/i18n/language-provider";
import { deleteVariable, type ProjectVariable } from "@/lib/supabase/team-projects";
import type { TeamActionError } from "@/lib/supabase/teams";
import { effectiveVariables, projectRoleAtLeast, type ProjectRole } from "@/lib/team-projects";
import { VariableDialog } from "./project-dialogs";

/**
 * Dosya değişkenleri (docs/history/362-*; proje ortak değişkenleri 368 ile kalktı). Yalnız dosyanın kendi değişkenleri gösterilir ve yazılır;
 * eski proje düzeyi değerler veritabanında durur ama kullanılmaz. Düzenleyici+ yazar; değişkenler onay kapsamı dışındadır.
 */
export function ProjectVariablesPanel({
  projectId,
  fileId,
  variables,
  role,
  onChanged,
}: {
  projectId: string;
  fileId: string;
  variables: ProjectVariable[];
  role: ProjectRole | null;
  onChanged: () => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<ProjectVariable | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canWrite = projectRoleAtLeast(role, "edit");
  const effective = effectiveVariables(variables, fileId);
  const byKey = (name: string) => variables.find((v) => v.name.toLowerCase() === name.toLowerCase() && v.fileId === fileId) ?? null;

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
    <div className="space-y-3 rounded-lg border border-border-soft bg-surface p-4" data-testid="project-variables" data-variable-scope="file">
      <div className="flex items-center gap-2">
        <h3 className="min-w-0 flex-1 text-body font-bold text-text">{t("tp.variable.fileTitle")}</h3>
        {canWrite && (
          <button type="button" onClick={() => setEditing("new")} className="inline-flex h-8 items-center gap-1 rounded-full bg-primary-soft px-3 text-caption font-semibold text-primary" data-variable-add>
            <Plus size={12} aria-hidden />
            {t("tp.variable.add")}
          </button>
        )}
      </div>
      {effective.length === 0 ? (
        <p className="text-small text-text-muted">{t("tp.variable.emptyFile")}</p>
      ) : (
        <ul className="space-y-2">
          {effective.map((variable) => {
            const own = byKey(variable.name);
            return (
              <li key={`${variable.scope}-${variable.name}`} className="flex items-center gap-2 rounded-lg bg-surface-soft px-3 py-2" data-variable-row={variable.name}>
                <span className="font-mono text-small font-semibold text-secondary">{`{${variable.name}}`}</span>
                <span className="min-w-0 flex-1 truncate text-small text-text">{variable.value || <span className="text-text-muted">{t("tp.variable.noValue")}</span>}</span>
                {canWrite && own && (
                  <>
                    <button type="button" onClick={() => setEditing(own)} aria-label={t("tp.variable.edit")} className="grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-surface">
                      <Pencil size={12} aria-hidden />
                    </button>
                    <button type="button" onClick={() => void remove(own)} aria-label={t("tp.variable.delete")} className="grid h-7 w-7 place-items-center rounded-full text-text-muted hover:bg-surface">
                      <Trash2 size={12} aria-hidden />
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
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
