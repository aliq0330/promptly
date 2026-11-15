import { supabase } from "./client";

/**
 * Skill uzmanlık alanları (docs/history/399-*): `skill_categories` tablosu (herkese açık okuma, yazma yalnız sahip rolü). Yeni alan tabloya satırdır, istemci dağıtımı gerekmez.
 * Okuma bir kez önbelleğe alınır; hata/boşlukta bilinen sekiz alan kullanılır (arayüz tabloya bağlı DEĞİL: eski veritabanında da çalışır).
 */
export interface SkillCategoryRow {
  id: string;
  labelTr: string;
  labelEn: string;
  position: number;
}

let cache: { rows: SkillCategoryRow[]; at: number } | null = null;
let inflight: Promise<SkillCategoryRow[] | null> | null = null;
const TTL_MS = 5 * 60 * 1000;

export function cachedSkillCategories(): SkillCategoryRow[] | null {
  return cache && Date.now() - cache.at < TTL_MS ? cache.rows : null;
}

/** Tablo okunamazsa `null` (çağıran bilinen alanlara döner). */
export async function fetchSkillCategories(): Promise<SkillCategoryRow[] | null> {
  const fresh = cachedSkillCategories();
  if (fresh) return fresh;
  inflight ??= (async () => {
    try {
      const { data, error } = await supabase.from("skill_categories").select("id, label_tr, label_en, position").order("position", { ascending: true }).limit(100);
      if (error || !data) return null;
      const rows = (data as { id: string; label_tr: string; label_en: string; position: number }[]).map((row) => ({ id: row.id, labelTr: row.label_tr, labelEn: row.label_en, position: row.position }));
      if (rows.length === 0) return null;
      cache = { rows, at: Date.now() };
      return rows;
    } catch {
      return null;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}
