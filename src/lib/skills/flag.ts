/**
 * Skill girişlerinin görünürlüğü (docs/history/388-*). Skill çekirdeği yarım bir özelliktir (dosya, arama, beğeni, yorum sonraki
 * dilimler, `docs/yapilacaklar.md`); bu yüzden menü girişleri `NEXT_PUBLIC_SKILLS_ENABLED=true` derleme değişkeni arkasındadır.
 * Rotalar (`/skills`, `/skills/create`, `/skills/local`) adresle her zaman açılır; yalnız Oluştur menüsündeki satır gizlenir.
 * Açılış için yapılacaklar listesindeki son madde: değişkeni deploy ortamına ekle.
 */
export const SKILLS_MENU_ENABLED = process.env.NEXT_PUBLIC_SKILLS_ENABLED === "true";

/** Skill'lerin TEK liste yüzeyi: Keşfet → Skill'ler (docs/history/418-*). Eski `/skills` adresi buraya yönlenir. */
export const SKILLS_LIST_HREF = "/discover?section=skills";
