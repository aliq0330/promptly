import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/runtime";

/**
 * Ortak koleksiyon (docs/history/386-*): üyelik, davet ve ortak yönetimi. Yazmanın TEK yolu SECURITY DEFINER RPC'lerdir
 * (istemci `collection_members` / `collection_invitations` tablolarına yazamaz); kurallar (sahip, sınır, engel, hız) sunucudadır.
 * Hata kodları (`collection_*`) `server-errors.ts` ile okunur cümleye çevrilir.
 */

export type CollectionMemberRole = "owner" | "member" | "invited";

export interface CollectionMember {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  role: CollectionMemberRole;
  /** Yalnız `invited`: davetin kimliği (geri çekmek için). */
  invitationId: string | null;
  /** Bu kişinin koleksiyona eklediği içerik sayısı (sahip için: kendi eklediği + sahipsiz kalanlar). */
  itemCount: number;
  since: string;
}

export interface CollectionInvitation {
  id: string;
  collectionId: string;
  collectionName: string;
  visibility: "public" | "private";
  itemCount: number;
  owner: { id: string; username: string; displayName: string; avatarUrl: string | null };
  createdAt: string;
}

export interface UnshareableItem {
  itemId: string;
  contentType: "prompt" | "workflow" | "preset" | "community_post";
  title: string | null;
  reason: "community" | "not_public";
}

function failure(error: { message?: string } | null, fallback = "common.actionFailedRetry"): Error {
  return new Error(error?.message || translateForRuntime(fallback as never));
}

/** Ortak çalışmayı aç/kapat (yalnız sahip). Açarken ortak olamayacak içerik varsa `collection_has_unshareable_items` fırlatır. */
export async function setCollectionShared(collectionId: string, shared: boolean): Promise<void> {
  const { error } = await supabase.rpc("set_collection_shared", { p_collection: collectionId, p_shared: shared });
  if (error) throw failure(error);
}

/** Ortak yapmayı engelleyen içerikler (sahip için): topluluk gönderileri ve herkese açık/yayında olmayanlar. */
export async function fetchUnshareableItems(collectionId: string): Promise<UnshareableItem[]> {
  const { data, error } = await supabase.rpc("collection_unshareable_items", { p_collection: collectionId });
  if (error) throw failure(error);
  return ((data ?? []) as { item_id: string; content_type: UnshareableItem["contentType"]; title: string | null; reason: UnshareableItem["reason"] }[]).map((row) => ({
    itemId: row.item_id,
    contentType: row.content_type,
    title: row.title,
    reason: row.reason,
  }));
}

/** Ortak çalışmayı açmadan önce çıkarılacak içerik satırı (sahibin kendi satırı; ekleyeni boş olduğundan sahip silebilir). */
export async function removeCollectionItemById(itemId: string): Promise<void> {
  const { error } = await supabase.from("collection_items").delete().eq("id", itemId);
  if (error) throw failure(error);
}

/** Kullanıcı adıyla davet (yalnız sahip). Davet kimliğini döner. */
export async function inviteCollectionMember(collectionId: string, username: string): Promise<string> {
  const { data, error } = await supabase.rpc("invite_collection_member", { p_collection: collectionId, p_username: username.trim().replace(/^@/, "") });
  if (error) throw failure(error);
  return data as string;
}

export async function respondCollectionInvitation(invitationId: string, accept: boolean): Promise<string> {
  const { data, error } = await supabase.rpc("respond_collection_invitation", { p_invitation: invitationId, p_accept: accept });
  if (error) throw failure(error);
  return data as string;
}

export async function revokeCollectionInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase.rpc("revoke_collection_invitation", { p_invitation: invitationId });
  if (error) throw failure(error);
}

/** Bana gelen bekleyen davetler. Oturumsuzsa ya da hata olursa boş (davet şeridi hiç çizilmez). */
export async function fetchMyCollectionInvitations(): Promise<CollectionInvitation[]> {
  try {
    const { data, error } = await supabase.rpc("my_collection_invitations");
    if (error || !data) return [];
    return (data as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      collectionId: row.collection_id as string,
      collectionName: row.collection_name as string,
      visibility: row.visibility as "public" | "private",
      itemCount: (row.item_count as number) ?? 0,
      owner: {
        id: row.owner_id as string,
        username: row.owner_username as string,
        displayName: (row.owner_display_name as string) || (row.owner_username as string),
        avatarUrl: (row.owner_avatar_url as string | null) ?? null,
      },
      createdAt: row.created_at as string,
    }));
  } catch (err) {
    console.error("fetchMyCollectionInvitations", err);
    return [];
  }
}

/** Sahip + ortaklar (+ sahip için bekleyen davetler). Koleksiyonu okuyamayan ya da ortak olmayan koleksiyonda boş döner; hatada FIRLATIR. */
export async function fetchCollectionMembers(collectionId: string): Promise<CollectionMember[]> {
  const { data, error } = await supabase.rpc("collection_members_list", { p_collection: collectionId });
  if (error) throw failure(error);
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    userId: row.user_id as string,
    username: row.username as string,
    displayName: (row.display_name as string) || (row.username as string),
    avatarUrl: (row.avatar_url as string | null) ?? null,
    role: row.role as CollectionMemberRole,
    invitationId: (row.invitation_id as string | null) ?? null,
    itemCount: (row.item_count as number) ?? 0,
    since: row.since as string,
  }));
}

/**
 * Sahip çıkarır ya da kişinin kendisi ayrılır. `removeItems`: kişinin eklediği içerikler koleksiyondan da kalkar; değilse koleksiyonda
 * kalır ve sahibe geçer (ekleyeni boşalır).
 */
export async function removeCollectionMember(collectionId: string, userId: string, removeItems: boolean): Promise<void> {
  const { error } = await supabase.rpc("remove_collection_member", { p_collection: collectionId, p_user: userId, p_remove_items: removeItems });
  if (error) throw failure(error);
}

/** Üye olduğum (sahibi olmadığım) ortak koleksiyonların kimlikleri — yalnız KENDİ üyelik satırlarım okunur (RLS), ≤ 50. */
export async function fetchMemberCollectionIds(userId: string): Promise<string[]> {
  try {
    const { data, error } = await supabase.from("collection_members").select("collection_id").eq("user_id", userId);
    if (error || !data) return [];
    return (data as { collection_id: string }[]).map((row) => row.collection_id);
  } catch (err) {
    console.error("fetchMemberCollectionIds", err);
    return [];
  }
}

/**
 * Kişinin sahip ya da ortak olduğu, ÇAĞIRANIN okuyabildiği koleksiyonların kimlikleri (profil listesi; ziyaretçi de çağırabilir).
 * İşlev henüz yoksa ya da hata verirse `null` döner: çağıran eski (yalnız sahibinin herkese açık koleksiyonları) sorguya düşer.
 */
export async function fetchProfileCollectionIds(userId: string, limit = 100): Promise<string[] | null> {
  try {
    const { data, error } = await supabase.rpc("profile_collections", { p_user: userId, p_limit: limit, p_offset: 0 });
    if (error || !data) return null;
    return (data as { id: string }[]).map((row) => row.id);
  } catch (err) {
    console.error("fetchProfileCollectionIds", err);
    return null;
  }
}
