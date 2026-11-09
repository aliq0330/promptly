import { teamLink } from "./teams.ts";

/**
 * Ekip projeleri v2 — rol ve onay yardımcıları (docs/history/362-*). SQL'deki `_team_project_role`, `space_items_area_review_*`
 * tetikleyicileri ve `team_review_*` RPC'lerinin AYNASIDIR: bu dosya yalnız GÖSTERİM kararı verir (hangi düğme görünsün); gerçek yetki
 * her çağrıda sunucuda uygulanır. Birim testi: `team-projects.test.ts`.
 */

/** Proje rolü: görüntüleyici < düzenleyici < lider. */
export type ProjectRole = "view" | "edit" | "lead";
/** Arayüzde gösterim sırası (yüksekten düşüğe). */
export const PROJECT_ROLES: readonly ProjectRole[] = ["lead", "edit", "view"];

export function isProjectRole(value: unknown): value is ProjectRole {
  return value === "view" || value === "edit" || value === "lead";
}

export function projectRoleRank(role: ProjectRole | null | undefined): number {
  return role === "lead" ? 3 : role === "edit" ? 2 : role === "view" ? 1 : 0;
}

export function projectRoleAtLeast(role: ProjectRole | null | undefined, min: ProjectRole): boolean {
  return projectRoleRank(role) >= projectRoleRank(min);
}

/** Konuk en çok düzenleyici olabilir (SQL: `_team_project_role` konuk sınırı). */
export function clampProjectRoleForGuest(role: ProjectRole): ProjectRole {
  return role === "lead" ? "edit" : role;
}

/** Onay durumu: taslak → bekliyor → onaylı | değişiklik istendi (taslağa döner). */
export type ReviewState = "draft" | "pending" | "approved" | "changes";
export const REVIEW_STATES: readonly ReviewState[] = ["draft", "pending", "approved", "changes"];

export function isReviewState(value: unknown): value is ReviewState {
  return typeof value === "string" && (REVIEW_STATES as readonly string[]).includes(value);
}

/** Kişi, ekleyen mi (`created_by`) — ekleyen kendi taslağını yönetir. */
export interface ReviewSubject {
  state: ReviewState;
  createdBy: string | null;
}

/** Düzenleyici + lider alana ekleyebilir; görüntüleyici ekleyemez. */
export function canAddToArea(role: ProjectRole | null | undefined): boolean {
  return projectRoleAtLeast(role, "edit");
}

/** Lider karar verir ve her şeyi siler/değiştirir; ekip sahibi/yöneticisi sunucuda örtük liderdir. */
export function canReview(role: ProjectRole | null | undefined): boolean {
  return role === "lead";
}

/**
 * Öğenin METNİNİ (başlık/metin/not) kim değiştirebilir? Lider her zaman; düzenleyici yalnız KENDİ taslağını / değişiklik istenenini.
 * Bekleyen ve onaylı öğenin içeriği lider dışında kilitlidir (onaylıda "değişiklik öner"). Konum/boyut/renk serbesttir (yerleşim).
 */
export function canEditItemContent(role: ProjectRole | null | undefined, item: ReviewSubject, userId: string | null): boolean {
  if (role === "lead") return true;
  if (!projectRoleAtLeast(role, "edit")) return false;
  return item.createdBy !== null && item.createdBy === userId && (item.state === "draft" || item.state === "changes");
}

/** Silme kuralı içerik düzenlemeyle aynıdır (SQL: `space_items_area_review_delete`). */
export function canDeleteItem(role: ProjectRole | null | undefined, item: ReviewSubject, userId: string | null): boolean {
  return canEditItemContent(role, item, userId);
}

/** "Onaya gönder" düğmesi: ekleyen kendi taslağını / değişiklik istenenini gönderir (lider gerekmez, onun öğeleri onaylı başlar). */
export function canSubmitItem(role: ProjectRole | null | undefined, item: ReviewSubject, userId: string | null): boolean {
  if (!projectRoleAtLeast(role, "edit") || role === "lead") return false;
  return item.createdBy !== null && item.createdBy === userId && (item.state === "draft" || item.state === "changes");
}

/** "Geri çek": bekleyen öğeyi ekleyen taslağa alır. */
export function canWithdrawItem(role: ProjectRole | null | undefined, item: ReviewSubject, userId: string | null): boolean {
  return projectRoleAtLeast(role, "edit") && item.state === "pending" && item.createdBy !== null && item.createdBy === userId;
}

/** Onaylı öğe için düzenleyici "değişiklik öner" der (lider doğrudan düzenler). */
export function canProposeChange(role: ProjectRole | null | undefined, item: ReviewSubject): boolean {
  return role === "edit" && item.state === "approved";
}

/** Rozet tonu (renk tek başına anlam taşımaz: etiket metni de gösterilir). */
export const REVIEW_STATE_TONE: Record<ReviewState, "neutral" | "warning" | "success" | "danger"> = {
  draft: "neutral",
  pending: "warning",
  approved: "success",
  changes: "danger",
};

/** Çalışma alanı adresi: `/teams/local?id=&tab=projects&project=&file=&board=&review=` (statik export: kimlik sorgu parametresindedir). */
export function projectLink(
  teamId: string,
  projectId?: string | null,
  extra: { file?: string | null; board?: string | null; review?: boolean; sub?: string | null } = {},
): string {
  return teamLink(teamId, "projects", {
    project: projectId ?? null,
    file: extra.file ?? null,
    board: extra.board ?? null,
    review: extra.review ? "1" : null,
    sub: extra.sub ?? null,
  });
}

/** Değişken değeri çözümü: kullanıcı yazdığı > dosya değişkeni > proje değişkeni (SQL/arayüz aynı sıra; adlar büyük/küçük harf duyarsız). */
export interface ProjectVariableLike {
  fileId: string | null;
  name: string;
  value: string;
}

export function effectiveVariables(all: readonly ProjectVariableLike[], fileId: string | null): { name: string; value: string; scope: "file" | "project"; overrides: boolean }[] {
  const project = new Map<string, ProjectVariableLike>();
  const file = new Map<string, ProjectVariableLike>();
  for (const variable of all) {
    const key = variable.name.toLowerCase();
    if (variable.fileId === null) project.set(key, variable);
    else if (variable.fileId === fileId) file.set(key, variable);
  }
  const out: { name: string; value: string; scope: "file" | "project"; overrides: boolean }[] = [];
  for (const [key, variable] of file) out.push({ name: variable.name, value: variable.value, scope: "file", overrides: project.has(key) });
  for (const [key, variable] of project) if (!file.has(key)) out.push({ name: variable.name, value: variable.value, scope: "project", overrides: false });
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Metindeki `{ad}` jetonlarını doldur: `user` > dosya > proje; değeri olmayan jeton AYNEN kalır (kopyada eksik değer sessizce silinmesin).
 * Jeton biçimi prompt değişkenleriyle aynıdır: `{ad}` (harf/rakam/alt çizgi, harf ya da alt çizgiyle başlar).
 */
export function fillProjectVariables(text: string, all: readonly ProjectVariableLike[], fileId: string | null, user: Readonly<Record<string, string>> = {}): string {
  const values = new Map(effectiveVariables(all, fileId).map((v) => [v.name.toLowerCase(), v.value]));
  for (const [name, value] of Object.entries(user)) if (value !== "") values.set(name.toLowerCase(), value);
  return text.replace(/\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (match, name: string) => values.get(name.toLowerCase()) ?? match);
}
