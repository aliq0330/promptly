import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import { MessageImageError, type PreparedMessageImage } from "./message-images";
import type { CommentMedia } from "@/types";

/**
 * Yorum fotoğrafları (docs/history/308-*): özel `comment-media` bucket'ı, yol `{yazar}/{uuid}.{uzantı}`. Okuma = yorumu okuyabilen herkes (Storage
 * politikası `prompt_comments` RLS'ine yaslanır), yükleme yalnız kendi klasörü. Dosya adı ASLA kullanıcı girdisinden türetilmez; yazma ve hazırlama
 * (gerçek tür, boyut, küçültme) mesaj fotoğraflarıyla AYNI kuraldan geçer (`prepareMessageImage`). Veritabanında yol bir kimliktir, adres değil.
 */
export const COMMENT_MEDIA_BUCKET = "comment-media";

const EXTENSION: Record<PreparedMessageImage["mime"], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

/** Hazırlanmış fotoğrafı yazarın kendi klasörüne yükler; yoruma yazılacak `media` değerini döndürür. */
export async function uploadCommentPhoto(userId: string, image: PreparedMessageImage): Promise<Extract<CommentMedia, { kind: "photo" }>> {
  const path = `${userId}/${crypto.randomUUID()}.${EXTENSION[image.mime]}`;
  const { error } = await supabase.storage.from(COMMENT_MEDIA_BUCKET).upload(path, image.blob, { contentType: image.mime, cacheControl: "3600", upsert: false });
  if (error) throw new MessageImageError("upload", translateForRuntime("messages.imageUploadFailed"));
  return { kind: "photo", path, width: image.width, height: image.height };
}

/** En iyi çaba: yoruma hiç bağlanmayan (gönderim başarısız) ya da silinen yorumun dosyası. Hata fırlatmaz; kalan dosyayı yetim süpürücü toplar. */
export async function removeCommentPhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  try {
    await supabase.storage.from(COMMENT_MEDIA_BUCKET).remove(paths);
  } catch (err) {
    console.error("removeCommentPhotos", err);
  }
}

// --- imzalı adresler ------------------------------------------------------------

const SIGNED_URL_TTL_SECONDS = 60 * 60;
/** Gerçek bitişten biraz önce yeniden imzala: uzun açık kalan sayfada kırık görsel olmasın. */
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const urlCache = new Map<string, { url: string; expiresAt: number }>();

export function getCachedCommentMediaUrl(path: string): string | null {
  const hit = urlCache.get(path);
  return hit && hit.expiresAt - REFRESH_MARGIN_MS > Date.now() ? hit.url : null;
}

/** Önbellekte olmayan yollar için TEK toplu istek; çözülemeyen yol sonuçta yoktur (arayüz yer tutucu gösterir). */
export async function resolveCommentMediaUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const missing: string[] = [];
  for (const path of paths) {
    const cached = getCachedCommentMediaUrl(path);
    if (cached) result.set(path, cached);
    else missing.push(path);
  }
  if (missing.length > 0) {
    try {
      const { data, error } = await supabase.storage.from(COMMENT_MEDIA_BUCKET).createSignedUrls(missing, SIGNED_URL_TTL_SECONDS);
      if (!error && data) {
        for (const item of data) {
          if (item.path && item.signedUrl) {
            urlCache.set(item.path, { url: item.signedUrl, expiresAt: Date.now() + SIGNED_URL_TTL_SECONDS * 1000 });
            result.set(item.path, item.signedUrl);
          }
        }
      }
    } catch (err) {
      console.error("resolveCommentMediaUrls", err);
    }
  }
  return result;
}
