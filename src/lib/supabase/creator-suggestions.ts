import { supabase } from "./client";
import { mapProfileRow, type ProfileRow } from "./mappers";
import { PROFILE_SELECT } from "./profiles";
import { chunk } from "./paged";
import { parseCreatorReasonKind, type CreatorReasonKind } from "@/lib/creator-suggestions";
import type { UserProfile } from "@/types";

/**
 * "Takip edilecek kişiler" (docs/history/285-*): people the signed-in user may want to follow, ranked on the server by their own signals
 * (`suggest_creators`: followed people's follows, authors of what they liked, followed tags and AI tools, a recency/popularity fallback).
 * The RPC returns ids + the reason; the profiles are read from `profiles` (public). Dismissing a person (✕) is stored (`dismiss_creator_suggestion`).
 */
export interface SuggestedCreator {
  profile: UserProfile;
  reason: { kind: CreatorReasonKind; ref: string | null; count: number };
}

interface SuggestionRow {
  id: string;
  reason_kind: string;
  reason_ref: string | null;
  reason_count: number | null;
}

/** The ranked suggestions (best first). Throws on a failed request — the strip then simply is not drawn. */
export async function fetchSuggestedCreators(limit: number): Promise<SuggestedCreator[]> {
  const { data, error } = await supabase.rpc("suggest_creators", { p_limit: limit });
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as SuggestionRow[];
  if (rows.length === 0) return [];

  const profiles = new Map<string, UserProfile>();
  await Promise.all(
    chunk(
      rows.map((row) => row.id),
      100,
    ).map(async (ids) => {
      const { data: found, error: profileError } = await supabase.from("profiles").select(PROFILE_SELECT).in("id", ids).limit(100);
      if (profileError) throw new Error(profileError.message);
      for (const row of (found ?? []) as ProfileRow[]) profiles.set(row.id, mapProfileRow(row));
    }),
  );

  const suggestions: SuggestedCreator[] = [];
  for (const row of rows) {
    const profile = profiles.get(row.id);
    // A profile that can no longer be read (deleted between the two requests) is just left out.
    if (!profile) continue;
    suggestions.push({ profile, reason: { kind: parseCreatorReasonKind(row.reason_kind), ref: row.reason_ref, count: row.reason_count ?? 0 } });
  }
  return suggestions;
}

/** "Bunu önerme": the person never comes back as a suggestion for this viewer. */
export async function dismissCreatorSuggestion(creatorId: string): Promise<void> {
  const { error } = await supabase.rpc("dismiss_creator_suggestion", { p_creator: creatorId });
  if (error) throw new Error(error.message);
}
