-- ci:allow-destructive
-- Kullanılmayan "her yerden kaldır" RPC'leri + eski kendi-beğeni satırları (docs/history/287-*).
--
-- 1) `remove_prompt|workflow|preset_from_saved_everywhere`: toplu "tüm koleksiyonlardan çıkar" işlemi. Arayüz bunu bilerek kaldırdı
--    (docs/history/168-*: kaydedilme üyeliği yalnız kaydet penceresinden ya da bir koleksiyonun kendi "Koleksiyondan kaldır"ından değişir) ve
--    istemci/Edge Function/betikler bu RPC'leri çağırmaz (src, scripts, supabase/functions tarandı). `drop function` yalnız bu üçünü siler.
-- 2) Sahibinin kendi içeriğini beğendiği satırlar: `enforce_like_rules` bunu yeni kayıtta reddeder (`self_like_not_allowed`), ama kural
--    canlıya girmeden önce yazılmış satırlar kalmıştı (canlıda 2 prompt beğenisi). Silme beğeni sayacını ve tepki sayılarını mevcut
--    tetikleyicilerle düşürür; bildirimi temizler. Temiz bir veritabanında hiçbir satır eşleşmez (etkisiz).

drop function if exists public.remove_prompt_from_saved_everywhere(uuid);
drop function if exists public.remove_workflow_from_saved_everywhere(uuid);
drop function if exists public.remove_preset_from_saved_everywhere(uuid);

delete from public.prompt_likes l using public.prompts t where l.prompt_id = t.id and t.author_id = l.user_id;
delete from public.prompt_likes l using public.prompt_requests t where l.request_id = t.id and t.author_id = l.user_id;
delete from public.prompt_likes l using public.workflows t where l.workflow_id = t.id and t.creator_id = l.user_id;
delete from public.prompt_likes l using public.presets t where l.preset_id = t.id and t.creator_id = l.user_id;
delete from public.prompt_likes l using public.community_posts t where l.community_post_id = t.id and t.author_id = l.user_id;
delete from public.prompt_likes l using public.content_quotes t where l.quote_id = t.id and t.author_id = l.user_id;
