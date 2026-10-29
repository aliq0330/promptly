import { supabase } from "./client";
import { chunk } from "./paged";

/**
 * "İlgimi çekiyor / çekmiyor" (docs/history/275-*): the viewer's explicit answer about a post. It teaches "Sana özel" only (`for_you_page`) —
 * Keşfet's ranking is unchanged. A prompt, request, workflow or preset; one answer per person per post. Writes go through the
 * `set_content_interest` RPC only (the table has no client write policy); `null` takes the answer back.
 */
export type InterestValue = "interested" | "not_interested";
export type InterestKind = "prompt" | "request" | "workflow" | "preset";
export interface InterestTarget {
  kind: InterestKind;
  id: string;
}

export const interestKey = (target: InterestTarget): string => `${target.kind}-${target.id}`;

const TARGET_COLUMN: Record<InterestKind, string> = {
  prompt: "prompt_id",
  request: "request_id",
  workflow: "workflow_id",
  preset: "preset_id",
};

/** Stores (or, with `null`, removes) the viewer's answer; resolves to the stored value. */
export async function setContentInterest(target: InterestTarget, value: InterestValue | null): Promise<InterestValue | null> {
  const { data, error } = await supabase.rpc("set_content_interest", { p_kind: target.kind, p_id: target.id, p_value: value });
  if (error) throw new Error(error.message);
  return (data as InterestValue | null) ?? null;
}

/** The viewer's own answers for the posts on screen (ids in parts of 100, RLS: own rows only). Key = `kind-id`. */
export async function fetchContentInterests(targets: InterestTarget[]): Promise<Record<string, InterestValue>> {
  const answers: Record<string, InterestValue> = {};
  const kinds = Object.keys(TARGET_COLUMN) as InterestKind[];
  await Promise.all(
    kinds.flatMap((kind) => {
      const ids = targets.filter((target) => target.kind === kind).map((target) => target.id);
      const column = TARGET_COLUMN[kind];
      return chunk(ids, 100).map(async (part) => {
        const { data, error } = await supabase.from("content_interest").select(`${column}, value`).in(column, part);
        if (error) throw new Error(error.message);
        for (const row of (data ?? []) as unknown as Record<string, string>[]) answers[`${kind}-${row[column]}`] = row.value as InterestValue;
      });
    }),
  );
  return answers;
}
