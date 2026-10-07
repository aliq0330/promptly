"use client";

import { useState } from "react";
import { GitCompare, History, RotateCcw, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import { diffSnapshots, type StudioSnapshot } from "@/lib/studio-diff";
import { formatRelativeTime } from "@/lib/utils";
import { versionName } from "./compare-pane";
import type { StudioVersion } from "./studio-model";

/** Version list: every saved draft state, newest first. Local to this Studio session — see CLAUDE.md. */
export function VersionsPane({
  versions,
  draft,
  unsaved,
  onSave,
  onCompare,
  onRestore,
}: {
  versions: StudioVersion[];
  draft: StudioSnapshot;
  unsaved: boolean;
  onSave: (label: string) => void;
  onCompare: (id: string) => void;
  onRestore: (id: string) => void;
}) {
  const { t, language } = useTranslation();
  const [label, setLabel] = useState("");
  const ordered = [...versions].reverse();

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(event) => {
          event.preventDefault();
          onSave(label.trim());
          setLabel("");
        }}
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">{t("studio.versionLabel")}</span>
          <input
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={60}
            placeholder={t("studio.versionLabelPlaceholder")}
            className="h-11 w-full min-w-0 rounded-md border border-border bg-background px-3 text-body text-text placeholder:text-text-muted focus:border-primary"
          />
        </label>
        <Button type="submit" disabled={!unsaved} className="h-11 shrink-0">
          <Save className="h-4 w-4" aria-hidden />
          {t("studio.saveVersion")}
        </Button>
      </form>
      {!unsaved && versions.length > 0 && <p className="text-caption text-text-muted">{t("studio.versionUpToDate")}</p>}

      <ol className="space-y-2">
        {ordered.map((version) => {
          const previous = versions.find((v) => v.number === version.number - 1);
          const changes = previous ? diffSnapshots(previous.snapshot, version.snapshot).length : 0;
          const isCurrent = JSON.stringify(version.snapshot) === JSON.stringify(draft);
          return (
            <li key={version.id} className="rounded-lg border border-border-soft bg-surface p-3">
              <div className="flex flex-wrap items-center gap-2">
                <History className="h-4 w-4 shrink-0 text-text-muted" aria-hidden />
                <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{versionName(version, t)}</span>
                {isCurrent && <Badge variant="accent">{t("studio.currentVersion")}</Badge>}
              </div>
              <p className="mt-1 text-caption text-text-secondary">
                {formatRelativeTime(version.createdAt, language)}
                {previous && ` · ${t("studio.changeCount", { count: changes })}`}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => onCompare(version.id)} className="h-10">
                  <GitCompare className="h-4 w-4" aria-hidden />
                  {t("studio.compare")}
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => onRestore(version.id)} disabled={isCurrent} className="h-10">
                  <RotateCcw className="h-4 w-4" aria-hidden />
                  {t("studio.openAsDraft")}
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
