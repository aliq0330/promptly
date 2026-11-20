/**
 * Arama için ICE sunucuları — TEK, merkezi, değiştirilebilir yer (docs/history/449-*).
 *
 * İlk sürüm yalnız ücretsiz STUN kullanır (maliyet 0 TL). STUN yalnızca iki tarafın kendi genel adresini öğrenmesine yarar; medya yine
 * doğrudan tarayıcıdan tarayıcıya akar. TURN (iki taraf da simetrik NAT/kurumsal güvenlik duvarı arkasındaysa gereken aktarıcı) YOKTUR: bu
 * durumlarda bağlantı kurulamaz ve arama "bağlantı kurulamadı" ile biter. Sonradan TURN eklemek yalnızca bu diziye bir giriş eklemektir
 * (`{ urls: "turn:…", username, credential }`); kodun geri kalanı bu diziden bağımsızdır.
 */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: "stun:stun.l.google.com:19302" }];

export function getIceServers(): RTCIceServer[] {
  return ICE_SERVERS;
}
