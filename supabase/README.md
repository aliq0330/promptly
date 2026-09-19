# Promptly — Supabase migrations

Bu klasördeki `migrations/*.sql` dosyaları, `src/types/index.ts`'teki mock
veri modelini birebir yansıtan gerçek Postgres şemasını oluşturur
(CLAUDE.md Bölüm 18). Dosyalar sırayla (dosya adındaki zaman damgasına
göre) uygulanmalıdır.

**Bu migration'lar bu depodan otomatik olarak uygulanmadı.** Claude Code'un
çalıştığı ortamın ağ politikası, gerçek Supabase projesinin veritabanına
(ham Postgres bağlantısı) doğrudan erişimi engelliyor — bu yüzden
migration'lar yalnızca yerel, geçici bir Postgres 16 örneğine karşı test
edildi (bkz. aşağıdaki "Nasıl doğrulandı" bölümü), gerçek projenize hiç
uygulanmadı.

## Nasıl uygularsınız

**Seçenek A — Supabase Dashboard (kod/CLI kurulumu gerektirmez):**

1. [Supabase Dashboard](https://supabase.com/dashboard) → projeniz → sol
   menüden **SQL Editor**'ü açın.
2. `migrations/` klasöründeki her dosyayı **dosya adındaki sıraya göre**
   (20260919120000, 20260919120100, ... 20260919120600) tek tek açıp
   içeriğini SQL Editor'e yapıştırıp **Run**'a basın.
3. Her dosya başarıyla çalıştıktan sonra bir sonrakine geçin. Bir hata
   alırsanız durdurun ve hatayı paylaşın.

**Seçenek B — Supabase CLI (yerel kurulum varsa):**

```bash
supabase link --project-ref xqxybhjcyrvaroknucdq
supabase db push
```

## Bu migration'lar ne oluşturuyor

- `profiles` — her `auth.users` satırına 1:1 eşlenen genel profil bilgisi.
  Yeni bir kullanıcı kayıt olduğunda (`supabase.auth.signUp`, CLAUDE.md
  Bölüm 17) bir trigger otomatik olarak bir `profiles` satırı oluşturur;
  kullanıcı adı e-postanın `@` öncesindeki kısmından türetilir, çakışırsa
  rastgele bir sayı eklenir.
- `tags`, `prompt_requests`, `prompts`, `prompt_media`, `prompt_tags`,
  `prompt_request_tags` — içerik modeli. **Not:** ayrı bir
  `prompt_request_responses` tablosu YOK — CLAUDE.md'nin prompt-istek
  modülü (Bölüm 9/10) zaten bir isteğe verilen yanıtın gerçekte
  `origin_type = 'request_response'` olan bir `prompts` satırı olduğuna
  karar verdi; bu şema o kararı izliyor.
- `prompt_likes`, `prompt_saves`, `prompt_comments`, `follows` — sosyal
  etkileşimler, artı `profiles`/`prompts`/`prompt_requests` üzerindeki
  sayaçları (`like_count`, `follower_count`, `remix_count`,
  `response_count` vb.) güncel tutan trigger'lar.
- `conversations`, `conversation_members`, `messages`, `notifications` —
  mesajlaşma ve bildirimler.
- `reports`, `blocks` — CLAUDE.md §6'nın planladığı moderasyon tabloları
  (Bölüm 22'nin uygulama mantığı henüz yok, yalnızca şema hazır).

Her tabloda **RLS (Row Level Security) oluşturulduğu anda açık** — henüz
hiçbir politika yazılmadı (CLAUDE.md Bölüm 19'un işi). Bu, tabloların
"varsayılan olarak kapalı" olduğu, yani politika eklenene kadar
`anon`/`authenticated` anahtarlarıyla (uygulamanın kullandığı anahtar)
hiçbir satırın okunamadığı/yazılamadığı anlamına gelir — güvenli tarafta
kalan bilinçli bir tercih.

## Nasıl doğrulandı

Gerçek projeye erişim engellendiğinden, bu SQL dosyaları yerel, tek
kullanımlık bir Postgres 16 örneğine (Supabase'in kullandığı aynı major
sürüm) `auth.users` için minimal bir taklit tabloyla uygulandı ve şunlar
gerçekten test edildi:

- Yeni `auth.users` satırı → `profiles` satırının otomatik oluşması ve
  kullanıcı adı çakışmasının doğru çözülmesi.
- Beğenme/beğenmekten vazgeçme → `prompts.like_count`'un artıp azalması.
- Yorum ekleme → `prompts.comment_count`'un artması.
- Takip etme → hem takip edilenin `follower_count`'unun hem takip edenin
  `following_count`'unun artması.
- Remix oluşturma → orijinal promptun `remix_count`'unun artması.
- Bir isteğe yanıt oluşturma → isteğin `response_count`'unun artması,
  yanıt seçme → `selected_response_prompt_id`'nin güncellenmesi.
- Geçersiz veriler (aynı yorumda hem `prompt_id` hem `request_id`, kendi
  kendini takip/engelleme, `source_prompt_id` olmadan remix, geçersiz
  `content_type`, yinelenen kullanıcı adı) beklendiği gibi reddedildi.
- Her tabloda RLS'nin gerçekten açık olduğu doğrulandı.

Bu, SQL'in doğru ve tutarlı olduğunu kanıtlar — ama **gerçek Supabase
projenize karşı hiç çalıştırılmadı**, bu adım yukarıdaki talimatlarla size
kalıyor.
