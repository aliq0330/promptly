### 9.18 Türetme ekranındaki iki düz-yazı cümlesinin de "Türet" terminolojisine geçmesi

Kullanıcının, `/create?remix=<id>` sayfasındaki "Bu türetme profilimde
görünsün mü?" seçicisinin ekran görüntüsüyle birlikte gelen isteği üzerine
— Bölüm 9.16'nın bilinçli olarak dokunmadığı (ve Bölüm 9.17'nin
"Bilinen sınırlamalar"ında "düz-yazı cümleleri kapsam dışı" diye
gerekçelendirdiği) iki cümle de artık "Türet" terminolojisine geçti:

1. `create-prompt-form.tsx`'teki remix-modu "Bu türetme profilimde
   görünsün mü?" seçicisinin İKİ radyo açıklaması da (hem "Profilimde
   paylaş" hem "Profilimde paylaşma" seçeneği) "remix listesinde/
   haritasında" ifadesini artık projenin kendi güncel sekme adlarına
   (Bölüm 9.16'nın "Türetilen promptlar" sekmesi, Bölüm 9.17'nin "Prompt
   geçmişi" sekmesi) referans verecek şekilde değiştirdi: "Türetilen
   promptlar listesinde/Prompt geçmişinde görünmeye devam eder" — anlam
   hiç değişmedi (kaynağın kendi remix listesi/haritasında bu türetmenin
   hâlâ göründüğü gerçeği aynı), yalnızca hangi sekmeden bahsedildiği artık
   kullanıcının ekranda gerçekten gördüğü isimlerle eşleşiyor.
2. Kaynak prompttan/istekten form alanlarını önceden dolduran bilgi
   bandındaki "&ldquo;{başlık}&rdquo; içeriğinin remixi olarak dolduruldu"
   cümlesi, kullanıcının verdiği tam metinle "&ldquo;{başlık}&rdquo;
   içeriğin türetilen promptu olarak dolduruldu" oldu — cümlenin geri
   kalanı (" — dilediğin gibi düzenleyebilirsin, köken bağlantısı
   korunuyor.") değişmedi.

**Kapsam notu:** Bu iki cümle, Bölüm 9.16'nın "Kapsam dışı bırakılan"
notunda VE Bölüm 9.17'nin "Bilinen sınırlamalar"ında AÇIKÇA isim
verilerek ("`post-context.tsx`'teki 'Remixlenen çalışma' kutu başlığı,
`create-prompt-form.tsx`'teki '...içeriğinin remixi olarak dolduruldu'
bilgi bandı") kasıtlı olarak dokunulmamış örnekler olarak
işaretlenmişti — "Remixlenen çalışma" kutu başlığı zaten Bölüm 9.17'de
ayrı bir talep üzerine değiştirilmişti, bu görev aynı kararın İKİNCİ
yarısını (bilgi bandı + iki radyo açıklaması) tersine çeviriyor. Bu, tek
bir hatalı örnek değil, gerçek bir kullanıcı talebi — bu yüzden yeni bir
"düz-yazı cümlelerini de değiştir" genel kuralı İCAT EDİLMEDİ, yalnızca
kullanıcının ekran görüntüsüyle işaret ettiği ÜÇ CÜMLE değiştirildi. Diğer
düz-yazı cümlelerdeki "remix" kelimesi (ör. kod içi Türkçe yorumlar, bu
üçünün dışındaki başka metinler) kasıtlı olarak DOKUNULMADI — şartname
yalnızca bu ekrandaki metinleri işaret etti.

**Değiştirilen dosya:** yalnızca `src/features/prompts/create-prompt-
form.tsx` — üç düz metin değişikliği, hiçbir mantık/state/prop
değişmedi (`showOnProfile`/`isRemixMode` koşulları, form gönderimi,
önizleme hep aynı kaldı, yalnızca görüntülenen cümleler değişti).

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (20 rota, değişmedi) sıfır hatayla geçti. Kod tabanında "remix
listesinde/haritasında" veya "remixi olarak dolduruldu" ifadesinin başka
bir yerde kalmadığı `grep` ile doğrulandı (sıfır eşleşme). Ağ seviyesinde
taklit edilmiş Supabase REST yanıtlarıyla Playwright'ta yeni, 5 senaryolu
bir test dosyasıyla (`remix-wording-test.mjs`) doğrulandı: eski "remix
listesinde/haritasında" metninin hiç kalmadığı; "Profilimde paylaş"
açıklamasının "Türetilen promptlar listesinde" ifadesini içerdiği;
açıklamaların "Prompt geçmişinde" ifadesini içerdiği; eski "içeriğinin
remixi olarak dolduruldu" metninin hiç kalmadığı; bilgi bandının artık
"içeriğin türetilen promptu olarak dolduruldu" gösterdiği — hepsi sıfır
JS hatasıyla geçti. Ayrıca Bölüm 9.14/9.15/9.16/9.17'nin regresyon
paketleri (rename-icon-test: 13/13, remix-tabs-rename-test: 24/24,
remix-merge-map-test: 42/42, notification-center-test: 32/32) ve 19
rotalık genel dayanıklılık taraması sıfır regresyonla yeniden
çalıştırıldı.

Gerçek bir Supabase projesine karşı canlı doğrulama yine bu sandbox'ın ağ
kısıtı yüzünden yapılamadı (Bölüm 17'den beri tekrarlanan, dürüstçe
belirtilen aynı sınırlama) — hiçbir yeni migration gerekmedi (bu görev
tamamen frontend metin değişikliği), bu yüzden kullanıcının Dashboard'da
yapması gereken ekstra bir adım yok.

**Bilinen sınırlamalar:** Yok — bu, önceki iki bölümün (9.16/9.17) bilinçli
kapsam dışı bıraktığı iki cümleyi kullanıcının yeni talebiyle değiştiren,
kapsamı net bir düzeltme; yeni bir mimari sınırlama getirmedi.

---
