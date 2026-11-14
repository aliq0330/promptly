/**
 * Ortak koleksiyonda kim ne yapabilir (docs/history/386-*) — veritabanındaki kuralların İSTEMCİ AYNASI. Karar HER ZAMAN sunucudadır
 * (RLS + `collection_items` tetikleyicileri + RPC'ler); bu işlevler yalnız arayüzün gösterdiği düğmeleri belirler. `collection-permissions.test.ts`
 * migration metnini okuyup ikisinin ayrışmadığını denetler.
 *
 * Roller: `owner` (koleksiyonu oluşturan), `member` (ortak; görüntüleyici rolü YOK), `visitor` (ortak olmayan; okuma yalnız herkese açıksa).
 */
export type CollectionRole = "owner" | "member" | "visitor";

export const COLLECTION_MEMBER_LIMIT = 9; // sahip hariç; üye + bekleyen davet
export const COLLECTION_JOINED_LIMIT = 50;

export function collectionRole(input: { ownerId: string; userId: string | null | undefined; isMember: boolean }): CollectionRole {
  if (input.userId && input.userId === input.ownerId) return "owner";
  if (input.userId && input.isMember) return "member";
  return "visitor";
}

/** İçerik ekler: sahip ya da ortak, yalnız ortak koleksiyonda (sahip kendi sıradan koleksiyonuna da ekler). */
export function canAddItems(role: CollectionRole, isShared: boolean): boolean {
  return role === "owner" || (role === "member" && isShared);
}

/**
 * Bir içeriği yalnız onu EKLEYEN çıkarır; `added_by` boş satırı (eski satır, ayrılan/çıkarılan ortağın bırakılanı) sahibe aittir.
 * Sahip bile başkasının eklediğini çıkaramaz. Sıradan (ortak olmayan) koleksiyonda `added_by` hep boştur → yalnız sahip.
 */
export function canRemoveItem(input: { role: CollectionRole; userId: string | null | undefined; addedBy: string | null | undefined }): boolean {
  if (!input.userId || input.role === "visitor") return false;
  if (input.addedBy) return input.addedBy === input.userId;
  return input.role === "owner";
}

/** Ad, görünürlük, ortak çalışmayı aç/kapat, davet, ortak çıkarma, silme: yalnız sahip. */
export function canManageCollection(role: CollectionRole): boolean {
  return role === "owner";
}

/** Ortaklıktan ayrılma: yalnız ortak (sahip silebilir ama ayrılamaz). */
export function canLeaveCollection(role: CollectionRole): boolean {
  return role === "member";
}

/** Koleksiyonu takip eder: ortak olmayan, herkese açık koleksiyonda. */
export function canFollowCollection(role: CollectionRole, visibility: "public" | "private"): boolean {
  return role === "visitor" && visibility === "public";
}

/** Davet edilebilir yer var mı (üye + bekleyen davet ≤ 9; sahiple 10 kişi). */
export function hasInviteRoom(memberCount: number, pendingCount: number): boolean {
  return memberCount + pendingCount < COLLECTION_MEMBER_LIMIT;
}

/** Ortak koleksiyona girebilecek içerik türleri (topluluk başvuru gönderisi girmez; İstek koleksiyona hiç girmez). */
export const SHAREABLE_ENTRY_TYPES = ["prompt", "workflow", "preset"] as const;
