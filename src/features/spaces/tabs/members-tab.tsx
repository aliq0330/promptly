"use client";

import { SpaceMembersSx } from "../space-sx";

/**
 * Üyeler ve erişim (docs/history/213-*, 482-*): her boyutta AYNI ayar sayfası (`SpaceMembersSx`) — üye listesi, rol değiştirme/çıkarma,
 * kullanıcı adıyla davet, bekleyen davetleri geri alma, "Space'ten ayrıl". Telefonda tam ekran sayfa; tablet/masaüstünde sekmenin altında
 * okuma sütunu (başlık çubuğu yok). Gerçek zamanlı ortak düzenleme YOK: değişiklikler kaydedilir.
 */
export function MembersTab() {
  return <SpaceMembersSx root />;
}
