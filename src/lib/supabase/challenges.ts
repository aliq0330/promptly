import { supabase } from "./client";
import { pickActiveChallenge, type WeeklyChallenge } from "@/lib/challenge";

/** Weekly themes (`public.weekly_challenges`, migration 20260919870000). Reads are public; writes are moderator-only RPCs. */
interface ChallengeRow {
  id: string;
  title_tr: string;
  title_en: string;
  description_tr: string;
  description_en: string;
  tag_slug: string;
  starts_at: string;
  ends_at: string;
  tags: { slug: string; label: string } | { slug: string; label: string }[] | null;
}

const CHALLENGE_SELECT = "id, title_tr, title_en, description_tr, description_en, tag_slug, starts_at, ends_at, tags ( slug, label )";

function mapChallengeRow(row: ChallengeRow): WeeklyChallenge {
  const tag = Array.isArray(row.tags) ? row.tags[0] : row.tags;
  return {
    id: row.id,
    titleTr: row.title_tr,
    titleEn: row.title_en,
    descriptionTr: row.description_tr,
    descriptionEn: row.description_en,
    tagSlug: row.tag_slug,
    tagLabel: tag?.label ?? row.tag_slug,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  };
}

/**
 * The theme running right now (most recently started when several overlap), or
 * null. The banner is optional decoration, so ANY failure — network, a database
 * without the migration — quietly means "no theme" rather than an error.
 */
export async function fetchActiveChallenge(now: Date = new Date()): Promise<WeeklyChallenge | null> {
  try {
    const iso = now.toISOString();
    const { data, error } = await supabase
      .from("weekly_challenges")
      .select(CHALLENGE_SELECT)
      .lte("starts_at", iso)
      .gt("ends_at", iso)
      .order("starts_at", { ascending: false })
      .limit(5);
    if (error) return null;
    return pickActiveChallenge(((data ?? []) as unknown as ChallengeRow[]).map(mapChallengeRow), now);
  } catch {
    return null;
  }
}

/** Every non-archived theme, newest first — for the moderator panel. Throws on failure so the panel can offer a retry. */
export async function fetchChallenges(): Promise<WeeklyChallenge[]> {
  const { data, error } = await supabase.from("weekly_challenges").select(CHALLENGE_SELECT).order("starts_at", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as ChallengeRow[]).map(mapChallengeRow);
}

export interface SaveChallengeInput {
  /** Omit to create. */
  id?: string;
  titleTr: string;
  titleEn: string;
  descriptionTr: string;
  descriptionEn: string;
  /** The tag's name; it is created (same rules as any tag) when it does not exist yet. */
  tagLabel: string;
  startsAt: string;
  endsAt: string;
}

export async function saveChallenge(input: SaveChallengeInput): Promise<string> {
  const { data, error } = await supabase.rpc("admin_save_challenge", {
    p_id: input.id ?? null,
    p_title_tr: input.titleTr,
    p_title_en: input.titleEn,
    p_description_tr: input.descriptionTr,
    p_description_en: input.descriptionEn,
    p_tag_label: input.tagLabel,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
  });
  if (error) throw new Error(error.message);
  return String(data);
}

export async function archiveChallenge(id: string): Promise<void> {
  const { error } = await supabase.rpc("admin_archive_challenge", { p_id: id });
  if (error) throw new Error(error.message);
}
