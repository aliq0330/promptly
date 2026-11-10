import type { BoardItem, BoardState, MemberProjectRoles, TeamActivity } from "./supabase/team-center.ts";
import { projectLink } from "./team-projects.ts";

/**
 * Ekip "Merkez" görünümlerinin SAF yardımcıları (docs/history/366-*): onay panosu paketleme/sütunlama, etkinlik cümlesi anahtarı,
 * üye proje rolü özeti ve öğe bağlantısı. Birim testi: `team-center.test.ts`.
 */

export interface BoardColumn {
  state: BoardState;
  /** Paketler tek satıra indirilmiş sayı (workflow'un 4 adım kartı = 1). */
  rows: BoardItem[];
}

export const BOARD_STATES: readonly BoardState[] = ["pending", "changes", "approved"];

/**
 * Onay panosu sütunları: bekleyen · değişiklik istenen · bugün onaylanan. Aynı paket (`unit`) ve aynı durumdaki öğeler TEK kart olur
 * (ilki temsilcidir; karar sunucuda paketin tamamına işler). Sıra: sunucudan gelen (en yeni üstte).
 */
export function groupBoard(items: readonly BoardItem[], projectId: string | "all" = "all"): BoardColumn[] {
  return BOARD_STATES.map((state) => {
    const seen = new Set<string>();
    const rows: BoardItem[] = [];
    for (const item of items) {
      if (item.state !== state) continue;
      if (projectId !== "all" && item.projectId !== projectId) continue;
      const key = item.unit ? `${item.spaceId}:${item.unit}:${state}` : item.id;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push(item);
    }
    return { state, rows };
  });
}

/** Panodaki proje süzgeci: görünen satırları olan projeler (sayıyla), ada göre. */
export function boardProjects(items: readonly BoardItem[]): { id: string; title: string; count: number }[] {
  const map = new Map<string, { id: string; title: string; count: number }>();
  for (const item of items) {
    if (item.state === "approved") continue;
    const entry = map.get(item.projectId) ?? { id: item.projectId, title: item.projectTitle, count: 0 };
    entry.count += 1;
    map.set(item.projectId, entry);
  }
  return [...map.values()].sort((a, b) => a.title.localeCompare(b.title));
}

/** Kartın açacağı adres: dosyadaysa dosya sayfası, değilse alan (Ortak/ek pano) sayfası; `item` çekmeceyi açar. */
export function boardItemHref(teamId: string, item: Pick<BoardItem, "projectId" | "fileId" | "spaceId" | "id">): string {
  return item.fileId
    ? projectLink(teamId, item.projectId, { file: item.fileId, item: item.id })
    : projectLink(teamId, item.projectId, { board: item.spaceId, item: item.id });
}

/** Etkinlik satırının çeviri anahtarı soneki (`tc.activity.<sonek>`). */
export function activityKeySuffix(activity: Pick<TeamActivity, "kind" | "itemKind">): "added" | "approved" | "changes" | "file" | "joined" {
  return activity.kind;
}

/** Üye kartının "3 projede lider" özeti: sıfır olmayan roller, lider > düzenleyici > görüntüleyici. */
export function memberRoleSummary(roles: Pick<MemberProjectRoles, "leadCount" | "editCount" | "viewCount"> | null | undefined): { role: "lead" | "edit" | "view"; count: number }[] {
  if (!roles) return [];
  const out: { role: "lead" | "edit" | "view"; count: number }[] = [];
  if (roles.leadCount > 0) out.push({ role: "lead", count: roles.leadCount });
  if (roles.editCount > 0) out.push({ role: "edit", count: roles.editCount });
  if (roles.viewCount > 0) out.push({ role: "view", count: roles.viewCount });
  return out;
}

/** Ekip sekmeleri için onay sayacı: lider bekleyen kararları, diğerleri değişiklik istenen kendi öğelerini sayar. */
export function approvalBadge(items: readonly BoardItem[]): number {
  const lead = items.filter((item) => item.state === "pending" && item.canDecide).length;
  if (lead > 0) return lead;
  return items.filter((item) => item.state === "changes" && item.mine).length;
}
