"use client";

import { useCallback } from "react";
import { DraftsButton } from "./drafts-button";
import { deleteDraft, fetchOwnDrafts, type DraftKind } from "@/lib/supabase/drafts";

/** The "Taslaklar" header entry for one content type — see DraftsButton. */
export function KindDraftsButton({ kind, compact = false }: { kind: DraftKind; compact?: boolean }) {
  const load = useCallback((userId: string) => fetchOwnDrafts(kind, userId), [kind]);
  const onDelete = useCallback((id: string) => deleteDraft(kind, id), [kind]);
  return <DraftsButton load={load} onDelete={onDelete} compact={compact} />;
}
