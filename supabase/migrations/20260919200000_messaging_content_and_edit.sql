-- Promptly — Mesajlaşma Faz A: içerik paylaşımı, yanıtlama, düzenleme,
-- benden-sil / herkesten-sil.
--
-- Kapsam kararı (kullanıcının detaylı mesajlaşma şartnamesinin 7 fazından
-- ilki — bkz. sohbet geçmişindeki plan): yalnızca bu fazın konuları.
-- Gizlilik/mesaj istekleri/engelleme (Faz B) ve Realtime (Faz C) burada
-- YOK — ayrı migration'lara bırakıldı.

-- === messages: yeni sütunlar ================================================

alter table public.messages
  alter column body drop not null,
  add column shared_prompt_id uuid references public.prompts (id) on delete set null,
  add column shared_request_id uuid references public.prompt_requests (id) on delete set null,
  add column reply_to_message_id uuid references public.messages (id) on delete set null,
  add column edited_at timestamptz,
  add column deleted_at timestamptz;

-- Tamamen boş bir mesaj olamaz (ne metin ne paylaşılan içerik) ve bir mesaj
-- aynı anda hem bir prompt hem bir isteği paylaşamaz — `prompt_comments`
-- (Bölüm 18) tam olarak aynı "tam olarak bir hedef" desenini zaten
-- kullanıyordu. `deleted_at is not null` istisnası şart: "herkesten sil"
-- aşağıda tam olarak `body`/`shared_*`'i BİRLİKTE boşaltan bir UPDATE
-- olarak uygulanıyor — istisna olmasaydı bu güvenli silme deseninin
-- kendisi bu CHECK'e çarpıp başarısız olurdu (yerel testte gerçekten
-- yakalandı, bkz. supabase/README.md).
alter table public.messages
  add constraint messages_has_content
    check (deleted_at is not null or body is not null or shared_prompt_id is not null or shared_request_id is not null),
  add constraint messages_shared_content_exclusive
    check (shared_prompt_id is null or shared_request_id is null);

-- === benden-sil: kişiye özel, mesaj satırını hiç etkilemeyen gizleme ========
-- Bir üyenin "benden sil" dediği mesaj diğer üye(ler) için tamamen olduğu
-- gibi kalır — bu yüzden `messages` üzerinde bir sütun değil, ayrı bir
-- ilişki tablosu gerekiyor (aynı satırın bir kullanıcı için "gizli", başka
-- bir kullanıcı için "görünür" olması tek bir sütunla ifade edilemez).
create table public.message_hidden_for (
  message_id uuid not null references public.messages (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  hidden_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.message_hidden_for enable row level security;

create policy "Users can view their own hidden-message markers"
  on public.message_hidden_for for select
  using (auth.uid() = user_id);

create policy "Users can hide a message for themselves"
  on public.message_hidden_for for insert
  to authenticated
  with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.messages m
      where m.id = message_hidden_for.message_id
        and public.is_conversation_member(m.conversation_id)
    )
  );

-- === Düzenleme / herkesten-sil RLS =========================================
-- `messages`'ın önceden hiç UPDATE politikası yoktu (yalnızca SELECT/
-- INSERT) — bu yüzden ne düzenleme ne "herkesten sil" (bir UPDATE olarak
-- uygulanıyor, aşağıya bakınız) şu ana kadar hiç mümkün değildi.
--
-- Süre sınırı: gönderiden sonraki 15 dakika — bu, kod tarafında icat
-- edilmiş bir ürün varsayılanı (WhatsApp/Telegram'ın da kullandığı yaygın
-- bir pencere), şartname yalnızca "izin verilen süre ve koşullarda" diyip
-- kesin bir değer vermiyordu. Değiştirilmesi gerekirse tek satır.
create policy "Senders can edit or soft-delete their own recent messages"
  on public.messages for update
  using (auth.uid() = sender_id)
  with check (auth.uid() = sender_id and created_at > now() - interval '15 minutes');

create or replace function public.handle_message_body_edit()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

create trigger messages_before_update_track_edit
  before update on public.messages
  for each row
  execute function public.handle_message_body_edit();
