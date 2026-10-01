-- Gerçek kaydetme sayısı (Prompt/Generator/Workflow) + beğeni/kaydetme/
-- takip için gerçek zamanlı (Realtime) güncelleme.
--
-- Kullanıcının bildirdiği hata ("karttaki beğeniye bastım 1 oldu, ilgili
-- sayfaya girince 0 görünüyor, yenileyince 1 görünüyor") frontend
-- tarafında, paylaşılan bir "engagement store"a geçilerek düzeltildi (bkz.
-- src/features/content/engagement-store.ts) — bu migration'ın işi yalnızca
-- o store'un ihtiyaç duyduğu iki gerçek backend eksiğini kapatmak:
--   1) Generator'da zaten var olan (ama Bölüm 9.36'nın collection_items'e
--      geçişinden beri hiç güncellenmeyen, ölü generator_saves tablosuna
--      bağlı) `save_count` kolonunun GERÇEK bir trigger'a bağlanması, ve
--      aynı kolonun prompts/workflows için de eklenmesi.
--   2) notifications/messages/conversation_members'ın zaten kullandığı
--      supabase_realtime publication'ına prompts/generators/workflows/
--      prompt_requests/prompt_results/profiles'ın eklenmesi — istemci,
--      bu tabloların UPDATE olaylarını dinleyip like_count/save_count/
--      follower_count'u DOĞRUDAN, authoritative payload'dan okuyarak
--      store'u gerçek zamanlı güncelliyor (prompt_likes/follows/
--      collection_items satır olaylarını dinlemek yerine — bu, hem kendi
--      eylemini "echo" olarak ikinci kez sayma riskini ortadan kaldırıyor
--      hem kaydetmenin per-owner dedup mantığını istemciye hiç
--      taşımadan, zaten doğru hesaplanmış sayacı okumayı sağlıyor).
--
-- === save_count — prompts/workflows'a eklendi, generators'da zaten vardı ===

alter table public.prompts
  add column save_count integer not null default 0 check (save_count >= 0);

alter table public.workflows
  add column save_count integer not null default 0 check (save_count >= 0);

-- === Gerçek, dedup'lu sayaç trigger'ları ====================================
--
-- Mimari not (yerel, atılabilir bir Postgres 16 örneğinde GERÇEKTEN test
-- edilip bulunan iki gerçek hata düzeltilerek buraya ulaşıldı):
--
-- (a) AFTER ROW trigger'lar TEK bir DELETE/INSERT ifadesinin etkilediği
--     TÜM satırlar için, o ifade TAMAMEN bitirdikten SONRA ateşleniyor —
--     yani `remove_prompt_from_saved_everywhere` gibi aynı owner+target
--     için BİRDEN FAZLA satırı TEK bir DELETE ifadesiyle silen bir RPC'de,
--     her satırın kendi AFTER DELETE trigger'ı çalıştığında DİĞER satır(lar)
--     ZATEN silinmiş oluyor — "başka satır var mı" diye satır-bazlı kontrol
--     eden naif bir trigger bu durumda AYNI owner+target için birden fazla
--     kez azaltma yapıp sayaç yanlış sonuca düşüyor (gerçekten yeniden
--     üretilip kanıtlandı). Çözüm: STATEMENT-level trigger'lar + transition
--     table (`old_table`/`new_table`, Postgres 10+) — tüm etkilenen
--     satırları TEK SEFERDE, distinct (owner, target) çiftine göre
--     gruplayıp ifade TAMAMEN bittikten SONRAKİ gerçek tablo durumuna göre
--     karar veriyor; kaç satır aynı çifti etkilerse etkilesin doğru.
-- (b) Bir KOLEKSİYONUN KENDİSİ silinince (ON DELETE CASCADE ile kendi
--     collection_items satırları da siliniyor), cascade'in collection_items
--     üzerindeki AFTER DELETE'i ateşlendiğinde `collections` satırı ARTIK
--     TABLODA YOK (gerçekten doğrulandı — cascade'in iç DELETE'i, dış
--     DELETE'in parent satırı tablodan kaldırmasından SONRA çalışıyor) —
--     bu yüzden collection_items'ın kendi trigger'ı o anda sahibi (owner_id)
--     bulamıyor. Çözüm: AYRI bir `collections` BEFORE DELETE trigger'ı,
--     koleksiyon (ve onun gerçek owner_id'si) HÂLÂ VARKEN, silinmek üzere
--     olan koleksiyonun içindeki her öğe için dedup kararını ÖNCEDEN
--     veriyor; collection_items'ın kendi DELETE trigger'ı, join'in boş
--     döndüğü (owner bulunamayan = cascade kaynaklı) satırları sessizce
--     atlıyor — çifte azaltma olmuyor.

create or replace function public.handle_collections_before_delete_save_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item record;
  v_remaining boolean;
begin
  for v_item in
    select prompt_id, generator_id, workflow_id
    from public.collection_items
    where collection_id = old.id
  loop
    if v_item.prompt_id is not null then
      select exists(
        select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
        where c.owner_id = old.owner_id and c.id <> old.id and ci.prompt_id = v_item.prompt_id
      ) into v_remaining;
      if not v_remaining then
        update public.prompts set save_count = greatest(0, save_count - 1) where id = v_item.prompt_id;
      end if;
    elsif v_item.generator_id is not null then
      select exists(
        select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
        where c.owner_id = old.owner_id and c.id <> old.id and ci.generator_id = v_item.generator_id
      ) into v_remaining;
      if not v_remaining then
        update public.generators set save_count = greatest(0, save_count - 1) where id = v_item.generator_id;
      end if;
    elsif v_item.workflow_id is not null then
      select exists(
        select 1 from public.collection_items ci join public.collections c on c.id = ci.collection_id
        where c.owner_id = old.owner_id and c.id <> old.id and ci.workflow_id = v_item.workflow_id
      ) into v_remaining;
      if not v_remaining then
        update public.workflows set save_count = greatest(0, save_count - 1) where id = v_item.workflow_id;
      end if;
    end if;
  end loop;
  return old;
end;
$$;

create trigger collections_before_delete_save_counts
  before delete on public.collections
  for each row
  execute function public.handle_collections_before_delete_save_counts();

create or replace function public.handle_collection_items_insert_save_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_inserted_count int;
  v_total_count int;
begin
  for v_pair in
    select distinct c.owner_id, nt.prompt_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.prompt_id is not null
  loop
    select count(*) into v_inserted_count from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.prompt_id = v_pair.target_id;
    select count(*) into v_total_count from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.prompt_id = v_pair.target_id;
    if v_total_count - v_inserted_count <= 0 then
      update public.prompts set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, nt.generator_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.generator_id is not null
  loop
    select count(*) into v_inserted_count from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.generator_id = v_pair.target_id;
    select count(*) into v_total_count from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.generator_id = v_pair.target_id;
    if v_total_count - v_inserted_count <= 0 then
      update public.generators set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, nt.workflow_id as target_id
    from new_table nt join public.collections c on c.id = nt.collection_id
    where nt.workflow_id is not null
  loop
    select count(*) into v_inserted_count from new_table nt2 join public.collections c2 on c2.id = nt2.collection_id
      where c2.owner_id = v_pair.owner_id and nt2.workflow_id = v_pair.target_id;
    select count(*) into v_total_count from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.workflow_id = v_pair.target_id;
    if v_total_count - v_inserted_count <= 0 then
      update public.workflows set save_count = save_count + 1 where id = v_pair.target_id;
    end if;
  end loop;

  return null;
end;
$$;

create trigger collection_items_after_insert_save_counts
  after insert on public.collection_items
  referencing new table as new_table
  for each statement
  execute function public.handle_collection_items_insert_save_counts();

create or replace function public.handle_collection_items_delete_save_counts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pair record;
  v_remaining int;
begin
  for v_pair in
    select distinct c.owner_id, ot.prompt_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.prompt_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.prompt_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.prompts set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, ot.generator_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.generator_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.generator_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.generators set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;

  for v_pair in
    select distinct c.owner_id, ot.workflow_id as target_id
    from old_table ot join public.collections c on c.id = ot.collection_id
    where ot.workflow_id is not null
  loop
    select count(*) into v_remaining from public.collection_items ci join public.collections c2 on c2.id = ci.collection_id
      where c2.owner_id = v_pair.owner_id and ci.workflow_id = v_pair.target_id;
    if v_remaining = 0 then
      update public.workflows set save_count = greatest(0, save_count - 1) where id = v_pair.target_id;
    end if;
  end loop;

  return null;
end;
$$;

create trigger collection_items_after_delete_save_counts
  after delete on public.collection_items
  referencing old table as old_table
  for each statement
  execute function public.handle_collection_items_delete_save_counts();

-- Eski, ölü `generator_saves`/`handle_generator_save_change` trigger'ına
-- BİLİNÇLİ OLARAK dokunulmadı (atıl bırakma kararı, Bölüm 9.22/9.36 ile
-- aynı ilke) — hiçbir kod artık `generator_saves`'e yazmadığından zaten
-- hiç tetiklenmiyor, yukarıdaki yeni trigger'lar `generators.save_count`'u
-- artık gerçekten, `collection_items` üzerinden güncelliyor.

-- === Backfill — mevcut gerçek collection_items verisinden doğru sayı ======
-- (generators.save_count bu migration'dan önce her zaman 0'dı — ölü
-- trigger hiç tetiklenmediği için — ama bu backfill her ihtimale karşı
-- genel/idempotent yazıldı, yalnızca "hepsi zaten 0" varsayımına güvenmiyor.)

update public.prompts p set save_count = coalesce((
  select count(distinct c.owner_id)
  from public.collection_items ci join public.collections c on c.id = ci.collection_id
  where ci.prompt_id = p.id
), 0);

update public.generators g set save_count = coalesce((
  select count(distinct c.owner_id)
  from public.collection_items ci join public.collections c on c.id = ci.collection_id
  where ci.generator_id = g.id
), 0);

update public.workflows w set save_count = coalesce((
  select count(distinct c.owner_id)
  from public.collection_items ci join public.collections c on c.id = ci.collection_id
  where ci.workflow_id = w.id
), 0);

-- === Realtime — beğeni/kaydetme/takip sayaçlarını taşıyan "özet" tablolar ==
-- `prompt_likes`/`collection_items`/`follows`'un KENDİSİ publication'a
-- eklenmiyor — istemci bu ham ilişki tablolarını dinleyip kendi deltasını
-- hesaplamak yerine, zaten bu trigger'ların (ve Bölüm 19/9.34'ün var olan
-- `handle_prompt_like_change`/`handle_follow_change` SECURITY DEFINER
-- trigger'larının) doğru hesapladığı like_count/save_count/follower_count
-- kolonlarının UPDATE olayını dinleyip değeri DOĞRUDAN okuyor — hem kendi
-- eyleminin "echo"sunu ayrıca filtrelemeye gerek kalmıyor (idempotent
-- overwrite, delta değil) hem kaydetmenin per-owner dedup mantığı
-- istemciye hiç taşınmıyor.
alter publication supabase_realtime add table
  public.prompts,
  public.generators,
  public.workflows,
  public.prompt_requests,
  public.prompt_results,
  public.profiles;
