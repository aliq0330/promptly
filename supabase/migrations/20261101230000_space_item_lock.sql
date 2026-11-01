-- Space nesne kilidi (docs/history/307-*): kilitli nesne taşınamaz, boyutlanamaz, düzenlenemez, silinemez — yanlışlıkla bozulmasın.
-- Kilidi açıp kapatmak `can_edit_space` yetkisi (sahip/düzenleyici) ister; kilit bir YETKİ DEĞİL güvenlik ağıdır (kilidi yine bir düzenleyici açabilir).
-- Yalnızca ekleyici (expand): yeni sütun + tetikleyici. Sunucu kuralı arayüzden bağımsızdır: istemci hatası/eski sürüm kilitliyi bozamaz.
--
--   * UPDATE: eski satır kilitliyse `locked` dışındaki (ve updated_at/updated_by dışındaki) her değişiklik `space_item_locked` ile reddedilir.
--     Değişmeyen değerler (toplu `space_save_layout` aynı konumu yeniden yazar) sorun değildir: yalnızca GERÇEK değişim engellenir.
--     Kilitlemek ve kilit açmak serbesttir; kilit açılırken başka alan da değişiyorsa o değişim reddedilir (önce aç, sonra düzenle).
--   * DELETE: kilitli nesne silinemez. Kaskad silmeler (Space ya da hesap silinirken) `pg_trigger_depth() > 1` ile geçer.

alter table public.space_items add column if not exists locked boolean not null default false;

create or replace function public.space_items_lock_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.locked and pg_trigger_depth() <= 1 then
      raise exception 'space_item_locked';
    end if;
    return old;
  end if;
  if old.locked and (to_jsonb(new) - 'locked' - 'updated_at' - 'updated_by') is distinct from (to_jsonb(old) - 'locked' - 'updated_at' - 'updated_by') then
    raise exception 'space_item_locked';
  end if;
  return new;
end;
$$;
revoke all on function public.space_items_lock_guard() from public, anon, authenticated;

drop trigger if exists space_items_lock_guard on public.space_items;
create trigger space_items_lock_guard before update or delete on public.space_items
  for each row execute function public.space_items_lock_guard();
