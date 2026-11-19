# 441 — "Görselden yardım" tamamen kaldırıldı

**Durum:** uygulandı (istemci + Edge Function kaynağı; migration yok). Kullanıcı kararı: Gemini Vision ile görselden prompt/değişken/istek önerisi özelliği ürünün parçası olmayacak.

## Kalkanlar
- Prompt formundaki "Görselden yardım" kutusu (`image-help-panel.tsx`: Prompt öner / Değişken öner) ve `PromptTextEditor`'ın `visionFile` prop'u + `handleVisionApply`.
- İstek formundaki "Görselden yardım" satırı (`request-vision-assist.tsx`).
- Yalnız bunlar kullandığı için: `lib/prompt-variable-vision.ts`, `lib/generator-vision-mapping.ts`, `lib/image-analysis-types.ts`, `lib/supabase/image-analysis.ts`, `readBlobAsBase64` (`utils.ts`), katalog testindeki vision testleri.
- Çeviri: 47 `vision.*` anahtarı + `compose.toolHelp` (yalnız `vision.show`/`vision.hide` kaldı, taksonomi seçicisi kullanıyor).
- Edge Function `analyze-image`: `supabase/functions/analyze-image/`, `supabase/config.toml` girdisi, `scripts/deploy-functions.sh` ve `deploy-functions.yml` seçeneği silindi.

## Elle yapılacak
Canlıda `analyze-image` (v5) hâlâ DEPLOY'LU: Supabase Dashboard → Edge Functions → `analyze-image` → sil (ve artık kullanılmayan `GEMINI_API_KEY` secret'ı). Kaynak silindi, otomatik kaldırılmaz.

## Dokunulmayanlar
Eski tarihçe notları (`045`, `046`, `145`, `149`, `216`) olduğu gibi kalır. Generator alan tipleri (`GeneratorFieldType`, hazır alan kütüphanesi) başka yerde kullanıldığı için durur.
