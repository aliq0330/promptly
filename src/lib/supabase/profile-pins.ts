import { supabase } from "./client";

/**
 * "Profilde sabitle" (docs/history/480-*): kişi kendi yayınladığı içeriği profilinin ilgili bölümünün en üstüne sabitler (en çok 3, raptiye işaretiyle).
 * Yazma YALNIZ `set_profile_pin` RPC'sidir (tabloya istemci yazamaz); okuma RLS'tir: sahibi her zaman, başkası yalnız hedefi okunabilen satırları görür.
 */
export type PinKind = "prompt" | "request" | "workflow" | "preset" | "skill";

export interface ProfilePin {
  kind: PinKind;
  id: string;
  createdAt: string;
}

/** Kişi başına en çok sabit; sunucu da aynı sınırı zorlar (`set_profile_pin`). */
export const PROFILE_PIN_LIMIT = 3;

const COLUMN: Record<PinKind, string> = {
  prompt: "prompt_id",
  request: "request_id",
  workflow: "workflow_id",
  preset: "preset_id",
  skill: "skill_id",
};

export const pinKey = (kind: PinKind, id: string): string => `${kind}-${id}`;

interface PinRow {
  prompt_id: string | null;
  request_id: string | null;
  workflow_id: string | null;
  preset_id: string | null;
  skill_id: string | null;
  created_at: string;
}

/** Sabitleri en son sabitlenen başta döndürür. */
export async function fetchProfilePins(userId: string): Promise<ProfilePin[]> {
  const { data, error } = await supabase
    .from("profile_pins")
    .select("prompt_id, request_id, workflow_id, preset_id, skill_id, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(PROFILE_PIN_LIMIT + 2);
  if (error) throw new Error(error.message);
  const pins: ProfilePin[] = [];
  for (const row of (data ?? []) as unknown as PinRow[]) {
    for (const kind of Object.keys(COLUMN) as PinKind[]) {
      const id = row[COLUMN[kind] as keyof PinRow];
      if (id) pins.push({ kind, id, createdAt: row.created_at });
    }
  }
  return pins;
}

/** Sabitler ya da kaldırır; işlemden sonra sabit olup olmadığını döner. Sunucu kodları (`pin_limit`, `content_not_found`) fırlatılan hatanın iletisindedir. */
export async function setProfilePin(kind: PinKind, id: string, pinned: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("set_profile_pin", { p_kind: kind, p_id: id, p_pinned: pinned });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
