# 274 — "Benzer promptlar" sıralaması: tek puan, zayıf bölüm ve yaygın sözcük eşleşme sayılmaz

**Durum:** uygulandı (tek `create or replace` migration, istemci değişikliği yok). `20261005100000_related_prompts_weighted.sql` yerel PostgreSQL'de sınandı (`related-prompts.sql` 14/14; eski fonksiyonla koşulunca 5 kontrol kırılıyor). Önce/sonra karşılaştırması canlı veriyle salt-okunur yapıldı; canlı durumu için CLAUDE.md §9'a bak.

## Sorun
Prompt detayındaki "Benzer promptlar" (`/prompts/local?id=`, `related_prompts` RPC'si, 790000) sözlüksel sıralıyordu: önce `dna_hits`, sonra ortak etiket, sonra kategori. `dna_hits` her bölüm türündeki herhangi bir ortak anahtar sözcüğü sayıyordu; bu yüzden `format` gibi biçim bölümlerinde ya da "only / never / light / white" gibi çok yaygın bir sözcükte eşleşen alakasız prompt, ortak etiketi ve aynı kategorisi olanların önüne geçiyordu. Canlıda "Chibi matruşka bebekler" (sanat) için ilk dört sonuç: Whispers of Noir (writing), The Midnight Informant (seo), The Room That Forgot Gravity (writing), Photography Trip Planning (nature) — aynı kategoride 87 prompt varken.

## Değişen (yalnız `related_prompts`, aynı imza `id, dna_hits, tag_hits`)
- `dna_hits` yalnız TANIMLAYICI bölümleri sayar; `output, format, language, negative, platform, constraints, custom` eşleşme değildir (`lib/relations/dna-similarity.ts` `WEAK_TYPES` ile aynı liste).
- Kaynağın, yayındaki promptların %5'inden fazlasının DNA'sında geçen sözcükleri (`df × 20 > n`) eşleşme değildir; sayım `prompt_dna_sections.tokens` GIN dizininden (`@>`).
- Sıra tek puandır: `min(dna_hits,4)·2 + min(tag_hits,3)·3 + aynı kategori 3 + aynı alt kategori 2`; eşitlikte aynı yazar, aynı içerik türü, beğeni, id (öncekiyle aynı).
- Aday kuralı aynı (dna > 0, etiket > 0 ya da aynı kategori; tek başına "aynı yazar/tür" yetmez). Ek olarak `community_id is null` süzülür (topluluğa özgü içerik zaten `private`, savunma).

## Önce / sonra (canlı veri, 60 rastgele kaynak prompt, ilk 4 sonuç)
| ölçü | eski | yeni |
|---|---|---|
| aynı kategoride olan sonuç (4'te) | 2,10 | 3,60 |
| hiç aynı-kategori sonucu olmayan kaynak | 16 / 60 | 2 / 60 |
| ortak etiket toplamı (4'te) | 11,80 | 11,93 |
| eski ile ortak sonuç (4'te) | — | 1,12 |

Örnekler: "Chibi matruşka bebekler" → artık Sevimli chibi anahtarlık, Tatlı örgü bebek, 3D oyun karakteri, diorama (hepsi aynı kategori, 2 ortak etiket). "Renkli vektör sanat şehir posteri" → eskiden ilk sıradaki kodlama kategorili "Password Policy…" gitti, yerine Car poster geldi. "Hikâye anlatıcı" → aynı kategori 4/4 (eskiden 4. sonuç "SafeKids Video Analyzer", research).

## Doğrulama
- `supabase/tests/related-prompts.sql` 14 kontrol, `FAILED=0`: imza aynı; kaynak listede yok; iki ortak etiketli aynı-kategori ilk sırada; yalnız biçim bölümünde ya da yalnız yaygın sözcükte ortak olan aday olmaz; ışıkta ortak olan aday olur (`dna_hits=1`); sıra c1,c5,c3; "yalnız aynı yazar" aday değil; gizli/taslak dönmez; `p_limit` 0→1, 100→≤12; anon/authenticated EXECUTE; olmayan kaynak boş. Eski fonksiyonla 3, 4, 5, 7, 10 numaralı kontroller kırılır.
- `node scripts/apply-migrations.mjs --check` temiz. İstemci değişmediği için `tsc/lint/build` etkilenmez; yeni kullanıcıya görünür metin yok (İngilizce karşılık gerekmez).

## Bilinçli sınırlar
- Ağırlıklar (2 / 3 / 3 / 2) ve %5 eşiği elle seçildi, 60 prompt örneğiyle doğrulandı; gerçek tıklama verisiyle ayarlanmadı.
- Yaygınlık sayımı çağrı başına yapılır (kaynağın sözcükleri kadar GIN sorgusu); canlıda 3 154 prompt / ~20 bin bölümle sınandı, çok büyüyünce sözcük sıklığı önceden hesaplanmış bir tabloya taşınabilir.
- **Aynı zayıflık hâlâ var:** İlişki Haritası'nın aday seçimi (`dna_similar_candidates`, ilk 40'ı ortak bölüm SAYISINA göre, eşitlikte kimliğe göre alır; biçim bölümleri ve yaygın sözcükler dahil). Ayrı bir iştir; bu migration ona dokunmaz.
- `related_requests` / workflow / hazır ayar aynı kalıbı kullanır ama DNA yoktur; etkilenmedi.
