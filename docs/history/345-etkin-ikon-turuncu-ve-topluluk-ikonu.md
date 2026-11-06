# 345 — Etkin ikon turuncu ikinci ton + tek Topluluk ikonu (2026-11-06)

Kullanıcı: ikonlar iki renkli olabilir mi (bir tarafı turuncu)? Dört biçim önizlendi (Şimdiki · her ikonda turuncu · mavi+turuncu · yalnız etkin ikonda); **dördüncüsü seçildi**.

## Kural
- Normal ikon: tek renk, ikinci ton aynı rengin yarı saydamı (343). **Etkin ikon: ikinci ton `heart` turuncusu** (`icon-accent`, `globals.css`):
  `.icon-accent [opacity] { fill: var(--color-heart); opacity: 1 }` — ikinci katmanı `opacity=".5"` özniteliği işaretler (Solar duotone + bizim `CUSTOM` çizimlerimiz + hareketli ikonlar).
- Turuncu "senin olan" demektir (342): seçili sekme, kaydedilmiş. Mavi "yapabileceğin şey" kalır; turuncu düğme/hata değildir.
- Uygulanan yerler: mobil alt menüde etkin sekme (ana şekil metin rengi + turuncu ton; `text-primary` kalktı), kenar çubuğu/ray etkin girişi, kaydedilmiş yer imi (`BookmarkIcon` dolu hâli turuncu).
- Beğeni: tepki verilince zaten seçilen tepki emojisi görünür (265/334), kalp ikonu turuncu yapılmadı.
- Yeni etkin-durum yüzeyi yazarken ikona `icon-accent` ver; ana şekil rengini `text-text` yap.

## Topluluk ikonu tek
- Alt menüdeki hareketli `CommunityIcon` başka bir şekildi (iki kişi); filtrelerde/aramada/Keşfet'te `Users` (üç kişi). Artık hepsi `Users` şekli: `CommunityIcon` (alt menü), `nav-items.ts` (kenar çubuğu/ray, iki yerde).
- 344'teki Users↔UsersRound hedef takasının yan etkisi düzeltildi: Takip ettiklerim (`/following`) `UsersRound`; DNA "kitle" ve taksonomi "users" `UsersRound` (kişi/üye = iki kişi, topluluk = üç kişi).

## Sınırlar / denenmedi
- Gerçek telefonda görünüm denenmedi (yerel statik derlemede 390 px, açık + koyu tema ekran görüntüsü alındı).
- Hareketli ikonların animasyonu turuncu tonla ekranda oynatılıp görülmedi.
- Etkin sekme/çip gibi başka etkin durumlar (SectionNav seçili, Tabs) bu turda dokunulmadı.
