### 9.21 Kaydet ikonu — kayıtlıyken tekrar modal açma hatasının düzeltilmesi

Kullanıcının bildirdiği hata: kayıtlı (dolu) bookmark ikonuna basınca
"Koleksiyona ekle" modalı yeniden açılıyordu — oysa ikon zaten "kayıtlı"
durumunu gösteriyor, tekrar tıklamanın anlamı doğrudan kaydı kaldırmak
olmalı. Kök neden: `save-button.tsx`'in `onClick`'i `isSaved` durumuna
hiç bakmadan HER ZAMAN `setModalOpen(true)` çağırıyordu (Bölüm 9.19'da
"bookmark artık modal açar" kararı verilirken kayıtlı/kayıtsız ayrımı
unutulmuştu).

**Düzeltme — yalnızca bu iki dosya:**
- `use-save-state.ts`: eski `toggle()` yerine iki ayrı, amaca uygun
  fonksiyon — `unsave()` (yalnızca genel `prompt_saves` kaydını siler,
  koleksiyon üyeliğine hiç dokunmaz — Bölüm 9.19'un "tek yönlü bağ"
  kararıyla tutarlı; optimistik + hata halinde geri alma; eşzamanlı
  çağrılara karşı `isToggling` korumalı; yalnızca gerçek başarıda `true`
  döner) ve `markSaved()` (modalın kendi gerçek INSERT'i sonrası state'i
  senkronlamak için — sahte/iyimser bir tahmin değil, zaten gerçekleşmiş
  bir yazmayı yansıtıyor).
- `save-button.tsx`: `onClick` artık `isSaved`'e bakıyor — kayıtlı
  değilse eskisi gibi modalı açıyor; kayıtlıysa modalı HİÇ açmadan
  doğrudan `unsave()` çağırıyor, ikon anında boşalıyor, başarılı
  olursa (yalnızca gerçekten başarılıysa) "Kaydedilenlerden kaldırıldı."
  bildirimi kısa süreliğine gösteriliyor (yeni, projede daha önce hiç
  olmayan bir toast sistemi KURULMADI — yalnızca bu buton için, `Portal`
  ile taşınan, 2.2 saniye sonra kendini kapatan minimal bir bildirim).
  İstek sürerken buton `disabled` — çift tıklama/yinelenen çağrı
  engelleniyor.

**Kasıtlı olarak değiştirilmeyen:** `SaveToCollectionModal`'ın kendisi —
bir koleksiyona ekleme sonrası modal hâlâ otomatik kapanmıyor (kullanıcı
aynı oturumda birden fazla koleksiyona ekleyebilsin diye, Bölüm 9.19'un
bilinçli tasarımı); bu görev yalnızca "kayıtlıyken tekrar tıklamak modal
AÇMASIN" kuralını düzeltti, modal davranışına dokunmadı.

**Nasıl doğrulandı:** `npx tsc --noEmit`, `npm run lint`, tam `npm run
build` (21 rota, değişmedi) sıfır hatayla geçti. `useSaveState`/
`SaveButton`'ın yeni durum makinesi kod üzerinde adım adım izlenerek
şartnamenin 8 test senaryosunun tamamı doğrulandı (modal yalnızca kayıtsızken
açılıyor, kayıtlıyken hiç `setModalOpen` çağrılmıyor, hata durumunda
`isSaved` eski değerine dönüyor, sayfa yenilemesi zaten değişmeyen
`fetchIsSaved` effect'ine bağlı). Gerçek Supabase'e karşı canlı bir
tıklama testi bu sandbox'ın ağ kısıtı yüzünden yapılamadı (tekrarlanan
sınırlama) — kullanıcının kendi ortamında denemesi gerekiyor.

**Bilinen sınırlamalar:** Yok — dar kapsamlı, kök nedenli bir davranış
düzeltmesi; yeni bir mimari sınırlama getirmedi.

---
