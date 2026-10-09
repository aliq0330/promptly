import { supabase } from "./client";

/**
 * Storage nesnelerini DB satırlarından bağımsız olarak temizleme yardımcıları.
 *
 * Bir prompt/istek/sonuç silindiğinde ya da görselleri değiştirildiğinde DB
 * satırları (cascade ile) gider ama Storage'daki dosya kendiliğinden gitmez.
 * Bu yardımcılar, silme/değiştirme akışlarının ARDINDAN dosyaları "en iyi
 * çaba" ile kaldırır: asıl işlem zaten başarılı olduğundan burada çıkan bir
 * hata kullanıcıya gösterilmez, yalnızca loglanır (kaçan dosyaları
 * `cleanup-orphan-storage` Edge Function'ı süpürür).
 *
 * Silme yetkisi bucket RLS'inden gelir (yalnızca kendi `{user_id}/…`
 * klasörü) — başkasına ait bir yol verilirse Storage onu sessizce atlar.
 */

const PUBLIC_MARKER = "/storage/v1/object/public/";

/** `…/object/public/<bucket>/<path>?v=1` biçimli bir genel URL'den yolu çıkarır; başka bucket'a aitse ya da tanınmazsa `null`. */
export function storagePathFromUrl(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const at = url.indexOf(PUBLIC_MARKER);
  if (at === -1) return null;
  const rest = url.slice(at + PUBLIC_MARKER.length);
  if (!rest.startsWith(`${bucket}/`)) return null;
  const path = rest.slice(bucket.length + 1).split("?")[0].split("#")[0];
  if (!path) return null;
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

/** Verilen URL'lerden `bucket`'a ait olanların Storage nesnelerini kaldırır (en iyi çaba; hata fırlatmaz). */
export async function removeStorageObjectsByUrl(bucket: string, urls: Array<string | null | undefined>): Promise<void> {
  const paths = Array.from(new Set(urls.map((u) => storagePathFromUrl(u, bucket)).filter((p): p is string => Boolean(p))));
  if (paths.length === 0) return;
  try {
    const { error } = await supabase.storage.from(bucket).remove(paths);
    if (error) console.error("removeStorageObjectsByUrl", bucket, error.message);
  } catch (err) {
    console.error("removeStorageObjectsByUrl", bucket, err);
  }
}
