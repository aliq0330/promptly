/**
 * Bildirim merkezinin "Topluluklar" sekmesi (docs/history/205-*): topluluk bildirimlerinin kendi türü yoktur (sunucu `system`
 * ya da gönderi etkileşiminde `like`/`comment`/`comment_reply` yazar), bu yüzden sekmeyi bildirimin GİTTİĞİ adres belirler:
 *  - topluluk sayfası (`/communities…`, eski `/groups…`): davet, başvuru sonucu, duyuru, etkinlik, kural, çıkarılma ve topluluk
 *    gönderisine gelen beğeni/yorum (`_community_post_href`);
 *  - `system` + `/messages/local?id=<topluluk>`: topluluğun sohbetine bağlanan bildirimler (katılım isteği, rol, sohbet ayarı).
 *    Birebir mesaj bildirimleri `message`/`message_request` türündedir, bu kurala girmez.
 * Toplulukta oluşturulmuş içeriğe gelen beğeni içeriğin kendi adresine gider; adresten ayırt edilemediği için "Gönderiler"de kalır.
 */
const COMMUNITY_PAGE = /^\/(communities|groups)(?=[/?#]|$)/;

export function isCommunityNotification(type: string, targetHref: string): boolean {
  if (COMMUNITY_PAGE.test(targetHref)) return true;
  return type === "system" && targetHref.startsWith("/messages/local");
}
