import { absoluteUrl } from "@/lib/utils";
import { postPageHref } from "@/lib/communities";
import { composeCommunityPostShareText } from "@/lib/community-post-share";

/**
 * Workflow / hazır ayar paylaşımıyla aynı fikir (`workflow-share-format.ts`, `preset-share-format.ts`): `messages` tablosunda bir topluluk gönderisi
 * için gömme sütunu YOKTUR (ve eklenmedi — yeni mesajlaşma şeması yok), bu yüzden gönderiyi mesaj olarak paylaşmak, gönderinin gerçek başlığını ve
 * gerçek bağlantısını düz metin bloğu olarak mevcut `body`'ye yazar; görüntülenirken aynı tek kaynaktan (`lib/community-post-share.ts`) ayrıştırılıp
 * gerçek bir kart çizilir. Gönderiyi yalnız topluluğu okuyabilen açabilir: kart, okuyamayan alıcıya içeriği değil "erişimin olmalı" gösterir.
 */
export function composeCommunityPostShareBody(note: string, title: string, id: string): string {
  return composeCommunityPostShareText(note, title, absoluteUrl(postPageHref(id)));
}

export { parseCommunityPostShareBody } from "@/lib/community-post-share";
