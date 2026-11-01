/**
 * "Kullanım Koşulları güncellendi" bandının kararı (docs/history/300-*). Saf ve bağımlılıksız: `node --test` ile doğrudan sınanır.
 *
 * Kural: bant, bu sürümü henüz görmemiş (bu tarayıcıda "tamam"a basmamış / koşullar sayfasını açmamış) VE koşullar yürürlüğe girmeden önce
 * hesap açmış kişiye gösterilir. Yürürlükten sonra kayıt olan kişi kayıt ekranında ("Devam ederek … kabul etmiş olursun") yeni metni zaten
 * bağlantısıyla gördü. Hesap tarihi bilinmiyorsa güvenli taraf: göster.
 */
export interface TermsNoticeInput {
  /** `TERMS_VERSION` — koşullar önemli ölçüde değişince artırılır, bant herkese yeniden çıkar. */
  version: string;
  /** Bu tarayıcıda en son görülen/okunan sürüm (yoksa null). */
  seenVersion: string | null;
  /** Oturum açan kişinin hesabının açılış zamanı (ISO). */
  accountCreatedAt: string | null | undefined;
  /** `TERMS_EFFECTIVE_AT` — bu sürümün yayına girdiği an (ISO). */
  effectiveAt: string;
}

export function shouldShowTermsNotice(input: TermsNoticeInput): boolean {
  if (input.seenVersion === input.version) return false;
  const created = Date.parse(input.accountCreatedAt ?? "");
  const effective = Date.parse(input.effectiveAt);
  if (!Number.isNaN(created) && !Number.isNaN(effective) && created >= effective) return false;
  return true;
}
