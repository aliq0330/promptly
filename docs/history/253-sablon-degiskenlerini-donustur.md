# 253 — Moderatör: `${Ad:Varsayılan}` şablon değişkenlerini gerçek değişkene çevirme

**Durum: uygulandı (repoda); canlıya UYGULANMADI — `main`'e birleşince `deploy.yml` migration'ı uygular, sonra istemci yayınlanır.**

## Neden
prompts.chat gibi kaynaklardan gelen promptlarda değişkenler `${Mother Language:Turkish}` / `${Ad}` biçimindedir. Promptly ise `{Ad}` jetonu +
`prompt_variables` satırı kullanır; bu yüzden içe aktarılan metinler düz yazı kalıyor, düzenleyicide boşluklu ad geçersiz olduğu için
turuncu "tanımsız değişken" çipine dönüşüyor ve tanımlanamıyordu (bkz. aynı turdaki düzenleyici düzeltmesi: çip → "Metne çevir" / "Düzenle").
Kullanıcı isteği: moderatörden **tek tuşla** bütün promptlardaki bu yazımları değişkene çevirmek; **tümü** (başkalarının promptları da)
ayrı bir **seçenek** olsun, varsayılan kendi promptlar.

## Ne yapıldı
- `20260928100000_admin_template_variables.sql` (yalnızca ekleyici/değiştirici, `drop` yok):
  - `_template_var_convert(text, text[])` — tek dönüştürücü (iç; kimseye EXECUTE yok). Yalnız ad kalıbına uyan `${…}`: ad boşlukları `_` (≤ 40
    karakter), ilk `:`den sonrası varsayılan (≤ 500). **Kod gibi görünenler dokunulmaz:** `( ) [ ] < > = ? ! & | * / \ " ; + \` , @ # % ^ ~ $`
    içeren ya da 60 karakteri aşan ad (`${a ? b : c}`, `${f(x)}`, `${a + b}`). Aynı prompttaki aynı ad (büyük/küçük harf duyarsız) tek değişken;
    ilk boş olmayan varsayılan kazanır, farklı ikinci varsayılan `conflicts` sayılır; promptta zaten tanımlı değişken varsa onun adı/satırı kullanılır.
  - `admin_template_variables_candidates(scope, limit)` — salt-okunur önizleme (en çok 1000 aday + toplam). Önizleme ile yazma AYNI dönüştürücüyü çağırır.
  - `admin_convert_template_variables(ids, scope)` — çağrı başına ≤ 200 kimlik, atomik, `for update`; metni yazar + yeni `prompt_variables` satırlarını ekler;
    yeniden çalıştırmak zararsız (dönüşen metinde `${…}` kalmaz). Denetim kaydı `bulk_convert_template_variables` (kapsam, adet, değişken, çakışma).
  - `scope`: `own` (yalnız çağıranın KENDİ promptları; varsayılan) · `all` (herkesinki). İkisinde de topluluğa özgü (`community_id`) ve silinmiş prompt hariç.
  - `record_prompt_edit()` aynı imzayla `create or replace`: `promptly.bulk_template_convert` işlem-yerel işareti açıkken yazara "promptunu düzenledi" bildirimi
    GİTMEZ. `content_edits` (önceki metin) ve `prompt_versions` (sürüm geçmişi) normal tetikleyicilerle yazılır → yazar eski metne sürüm geçmişinden dönebilir.
- Arayüz: Moderasyon → "Şablon değişkenlerini dönüştür" (`template-variables-card.tsx`, `admin-template-variables.ts`). Kapsam radyosu (Kendi promptlarım [varsayılan] /
  Tüm promptlar [turuncu uyarı]) → **Tara** (hiçbir şey yazmaz; her prompt için `{Ad} = Varsayılan` çipleri, zaten tanımlı olanlar soluk, çakışma uyarısı) →
  seçim (varsayılan hepsi) → **Dönüştür**. Kendi promptlar için onay yok (tek tuş); **Tüm promptlar** için açık onay penceresi (başkasının metnini değiştirir, bildirim
  gitmez, sürüm geçmişinde kalır). 100'erli parçalar, ilerleme + Durdur, yarıda kalma uyarısı, bitince otomatik yeniden tarama. Taramadan sonra kapsam radyosu
  değişse bile o taramanın kapsamı kullanılır.
- `scripts/smoke-test.mjs`: iki yeni RPC yoklaması (ziyaretçiye kapalı).
- İngilizce karşılıklar (`translations-exchange.ts`, `exchange.template.*`) eklendi.

## Kararlar / bilinçli sınırlar
- **Bildirim yok:** 1000'lerce yazara "promptunu düzenledi" gitmesin diye toplu dönüşümde kapalı (işaret yalnız bu işlemde). İstenirse işaret kaldırılarak açılır.
- **Kod benzeri `${…}`** için sezgi: `${user.name}` gibi noktalı/alt çizgili adlar dönüşür (önizlemede satır satır işaretini kaldırabilirsin). Kod bloğu içindeki `${x}` ayrıca
  tanınmaz; moderatör önizlemeden çıkarır.
- Değişken türü hep `text`; `${Ad:A|B|C}` gibi seçenekli yazımlar seçim türüne ÇEVRİLMEZ (varsayılan olarak tüm `A|B|C` yazılır).
- İçe aktarma yoluna (yeni yüklemeler) eklenmedi: yeni toplu yüklemeden sonra bu kart yeniden çalıştırılır.
- Eski sürüm (`prompt_versions`) kaydı `source = 'owner_edit'` olarak yazılır (CHECK yeni bir kaynak değerine izin vermez; `drop constraint` gerektirirdi).

## Doğrulama
- `supabase/tests/admin-template-variables.sql` 29/29 (dönüştürücü: ad/varsayılan/Türkçe harf/tekrar/çakışma/var olan değişken/uzunluk/CHECK uyumu/kod benzeri; yetki;
  önizleme = uygulama; kendi kapsam yalnız kendi; `all` başkasınınkini çevirir, silinmiş ve topluluk dışarıda; idempotent; sürüm + düzenleme kaydı; bildirim işareti sızmaz;
  denetim kaydı). Mutasyon denemesi: işaret koşulu kaldırılınca 33/34 yakalandı. Diğer 31 SQL dosyası temiz veritabanında `FAILED=0`.
- `run-exchange` 35/35 (31–35: varsayılan kapsam + tek tuş, `all` onayı ve Vazgeç, seçim, 250 → 100'erli 3 çağrı, yarıda kalma + İngilizce + telefon). Mutasyon: `all` onayı
  kapatılınca 32 yakalandı.
- Gerçek Supabase'e / gerçek prompts.chat verisiyle / oturumla DENENMEDİ.
