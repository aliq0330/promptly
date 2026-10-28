# 267 — Mesajlar: WhatsApp tarzı düz liste + sohbet seçimi

**Durum: uygulandı (repoda). Yalnız istemci kodu, migration yok.** Kullanıcı WhatsApp (iOS) sohbet listesi ekran görüntülerini verdi ve Promptly Mesajlar sayfasının aynı biçimde olmasını istedi; mockup (3 ekran: liste · `⋯` menüsü · seçim) onaylandı, "Arşivle · Okundu · Sil çubuğu ekranın altında `position: fixed` kalsın" kararıyla uygulandı.

## Kullanıcı gözüyle
- **Düz liste:** kutu/kenarlık yok; telefonda satırlar sayfa kenarına kadar uzanır. Avatar 56 px, ad kalın, zaman sağda, önizleme en çok iki satır; ayırıcı çizgi yalnız metin sütunundan başlar. Okunmamış satırda ad/önizleme/zaman kalınlaşır, sağda sayaç rozeti. `sm`+ sayfada liste hafif kartlı çerçeve kalır; iki bölmeli masaüstü panelinde çerçevesiz.
- **`⋯` menüsü** (kontrol satırında, "+" yanında; yalnız Sohbetler/Arşivlenenler görünümünde): **Sohbet seç** · **Tümü okundu**.
- **Seçim modu:** başlık ✓ (seçimi bitir) + "N sohbet seçildi"; satırların soluna seçim halkası kayarak açılır, seçili satır `primary-soft` zeminli, dokununca seçilir/bırakılır (sohbet açılmaz). Telefonda üst ve alt uygulama menüsü gizlenir (`html[data-chat-select]`), yerine **ekranın altına sabit** Arşivle · Okundu · Sil çubuğu gelir (liste altından kayar; hiçbiri seçili değilken soluk ve basılamaz). Masaüstü iki bölmeli panelde çubuk panelin içinde `sticky bottom` (tüm ekrana yayılmaz).
- **Arşivle** (Arşivlenenler görünümünde "Arşivden çıkar") · **Okundu** · **Sil** = kişisel listeden kaldır (grup/topluluk sohbetinde "listemden kaldır"; onay penceresi tek tek sohbetteki metinlerle aynı, sayı başlıkta). Sonuç toast'ı; kısmi hatada başarısızlar seçili kalır ve uyarı çıkar (sessiz başarı yok).

## Kodda
- `features/messages/conversation-row.tsx` (düz satır + `selection` prop'u: satır bağlantı yerine `role="checkbox"` düğmesi), `conversation-list.tsx` (`selection`, telefonda `-mx-3` tam genişlik), yeni `conversation-selection.tsx` (`ConversationsMoreMenu`, `SelectionHeader`, `SelectionActionBar`, `useSelectionChrome`), `conversations-pane.tsx` (seçim durumu, `applyBulk`: 6'şarlı gruplarla, `Promise.allSettled`; alt çubuk telefonda `Portal` ile `body`'ye çizilir — üst atalardaki animasyon `transform`'u `fixed`'i bozmasın).
- Mevcut yazma yolları yeniden kullanıldı: `archiveConversation` / `unarchiveConversation` / `deleteConversation` (kendi üyelik satırı, "0 satır" = hata). Yeni: provider `markConversationRead` — birebirde `mark_conversation_read` (yalnız sayaç; okundu imleci ilerlemez, karşı tarafa "okundu" gitmez; `clearConversationUnread` hatayı fırlatır), grupta sayı okundu imlecinden hesaplandığı için `mark_conversation_read_up_to(son mesaj zamanı)`. Yerel sayaç yalnız sunucu onayından sonra sıfırlanır.
- `globals.css`: `html[data-chat-select]` → alt menü (`[data-app-nav]`) gizli; `< md` iken üst menü de gizli.
- i18n: `messages.moreActionsAria/selectChats/markAllRead/markRead/selectionCount/selectionDone/selectionBarAria/bulk*Toast/bulkDeleteTitle/nothingUnreadToast/bulkPartialFailed` (TR+EN eklendi; İngilizce sayı eksiz yazıldı: "3 selected", çoğul mekanizması yok).
- Test: `tests/messaging-ui/run-chat-select.mjs` (10 senaryo; `mock.mjs` `mark_conversation_read` artık sayacı sıfırlar + çağrıyı `db.unreadResets`'e yazar, `db.failMarkRead`).

## Bilinçli sınırlar / açık
- **Okundu tikleri (✓✓) ve 📷/prompt simgeli önizleme YOK:** listede son mesajın göndereni, karşı tarafın okundu imleci ve mesaj türü verisi yok (`Conversation.lastMessage` yalnız metin). Eklemek `fetchConversationsForUser`'a ek veri/RPC ister (okundu bilgisi gizlilik kuralları dahil) — ayrı iş.
- Gruplarda "Okundu" okundu imlecini ilerletir (grup okunmamış sayısı oradan hesaplanıyor); mesaj gönderen "Mesaj bilgisi"nde bu kişiyi "okudu" görebilir. Birebirde böyle bir sızıntı yok.
- Mesaj istekleri görünümünde seçim yok (kabul/ret akışı ayrı); paylaşım akışında (`?sharePromptId=` vb.) `⋯` menüsü yok. Uzun basarak seçim başlatma ve "tümünü seç" yok. "Tümü okundu" yalnız gelen kutusunu kapsar (arşiv/istek hariç).
- Aralıklı pre-existing: `run-community-home` 4. senaryo (keyset sayfalama) bu değişiklikten bağımsız olarak değişiklik öncesi derlemede de 37/38.
- **Doğrulama:** `npx tsc --noEmit` temiz, `npm run lint` 0 hata, `npm test` 544/544, `npm run build` temiz; `run-chat-select` 10/10, `run` 24/24, `run-groups` 36/36, `run-chat` 38/38, `run-communities` 66/66, `run-search-notifications` 11/11. Gerçek Supabase'e / gerçek telefona / iOS Safari'ye (alt çubuk + güvenli alan) karşı denenmedi; grup okundu yolu ağ taklidinde sınanmadı.
