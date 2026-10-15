"use client";

import { restorePresetVersion, restoreRequestVersion, restoreWorkflowVersion } from "@/lib/supabase/content-versions";
import { diffRequestFields, requestCopyText, type RequestFieldDiff } from "@/lib/version-history";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { PresetVersion, RequestVersion, WorkflowVersion } from "@/types";
import { PresetDiffView, TextFieldsDiffView, WorkflowDiffView } from "./version-diffs";
import { VersionHistoryPanel } from "./version-history-panel";

const REQUEST_FIELD_LABEL_KEYS: Record<RequestFieldDiff["key"], TranslationKey> = {
  title: "forms.title",
  description: "forms.shortDescription",
  creativeDirection: "request.creativeDirection",
  preferredTool: "request.preferredTool",
};

/** Prompt İsteği adapter of the shared version list: text diffs, copy of the creative direction (description when empty). */
export function RequestHistoryPanel({ requestId, versions, isOwner }: { requestId: string; versions: RequestVersion[]; isOwner: boolean }) {
  const { t } = useTranslation();
  return (
    <VersionHistoryPanel
      title={t("history.titleRequest")}
      contentId={requestId}
      versions={versions}
      isOwner={isOwner}
      copyText={requestCopyText}
      onRestore={isOwner ? (version) => restoreRequestVersion(version) : undefined}
      restoreConfirmKey="history.restoreConfirmRequest"
      renderComparison={(older, newer) => <TextFieldsDiffView diffs={diffRequestFields(older, newer)} labelKeyFor={(key) => REQUEST_FIELD_LABEL_KEYS[key]} />}
    />
  );
}

/** Workflow adapter: step/connection diffs, no copy action (no single primary text), server-side restore RPC. */
export function WorkflowHistoryPanel({ workflowId, versions, isOwner }: { workflowId: string; versions: WorkflowVersion[]; isOwner: boolean }) {
  const { t } = useTranslation();
  return (
    <VersionHistoryPanel
      title={t("history.titleWorkflow")}
      contentId={workflowId}
      versions={versions}
      isOwner={isOwner}
      onRestore={isOwner ? (version) => restoreWorkflowVersion(version) : undefined}
      restoreConfirmKey="history.restoreConfirmWorkflow"
      announceNextVersion
      renderComparison={(older, newer) => <WorkflowDiffView older={older} newer={newer} />}
    />
  );
}

/** Hazır Ayar adapter: field/option diffs, no copy action, server-side restore RPC. */
export function PresetHistoryPanel({ presetId, versions, isOwner }: { presetId: string; versions: PresetVersion[]; isOwner: boolean }) {
  const { t } = useTranslation();
  return (
    <VersionHistoryPanel
      title={t("history.titlePreset")}
      contentId={presetId}
      versions={versions}
      isOwner={isOwner}
      onRestore={isOwner ? (version) => restorePresetVersion(version) : undefined}
      restoreConfirmKey="history.restoreConfirmPreset"
      announceNextVersion
      renderComparison={(older, newer) => <PresetDiffView older={older} newer={newer} />}
    />
  );
}
