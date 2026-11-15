import { supabase } from "./client";
import { SKILL_FILES_BUCKET } from "./skill-package";
import { resizeImageToCoverBlob } from "@/lib/utils";

/**
 * Skill kapak görseli (docs/history/399-*): özel `skill-files` bucket'ında `{skill}/cover/{uuid}.jpg`; yol `skills.cover_path`'te durur. Yükleme ortak görsel işlemcisinden geçer
 * (ağır fotoğraf reddedilmez, küçültülür); eski kapak yeni yazıldıktan SONRA silinir (yazma başarısızsa eski kapak kalır). Okuma kısa ömürlü imzalı adrestir (önbellekli).
 */
const COVER_WIDTH = 1200;
const COVER_ASPECT = 4 / 3;
const SIGN_SECONDS = 3600;
const urlCache = new Map<string, { url: string; at: number }>();

export async function uploadSkillCover(skillId: string, userId: string, file: File, previousPath: string | null): Promise<string> {
  const { blob } = await resizeImageToCoverBlob(file, COVER_WIDTH, COVER_ASPECT);
  const path = `${skillId}/cover/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await supabase.storage.from(SKILL_FILES_BUCKET).upload(path, blob, { contentType: "image/jpeg", upsert: false });
  if (uploadError) throw new Error(uploadError.message);
  const { data, error } = await supabase.from("skills").update({ cover_path: path }).eq("id", skillId).eq("author_id", userId).select("id").maybeSingle();
  if (error || !data) {
    await supabase.storage.from(SKILL_FILES_BUCKET).remove([path]);
    throw new Error(error?.message || "skill_not_found");
  }
  if (previousPath) await supabase.storage.from(SKILL_FILES_BUCKET).remove([previousPath]);
  return path;
}

export async function removeSkillCover(skillId: string, userId: string, path: string): Promise<void> {
  const { data, error } = await supabase.from("skills").update({ cover_path: null }).eq("id", skillId).eq("author_id", userId).select("id").maybeSingle();
  if (error || !data) throw new Error(error?.message || "skill_not_found");
  await supabase.storage.from(SKILL_FILES_BUCKET).remove([path]);
}

/** Kapağın kısa ömürlü imzalı adresi; okunamazsa `null` (kart varsayılan görünüme döner). */
export async function signSkillCover(path: string): Promise<string | null> {
  const cached = urlCache.get(path);
  if (cached && Date.now() - cached.at < (SIGN_SECONDS - 300) * 1000) return cached.url;
  const { data, error } = await supabase.storage.from(SKILL_FILES_BUCKET).createSignedUrl(path, SIGN_SECONDS);
  if (error || !data?.signedUrl) return null;
  urlCache.set(path, { url: data.signedUrl, at: Date.now() });
  return data.signedUrl;
}
