Promptly'nin kendi tepki emojileri (docs/history/334-*; 265'teki Telegram TGS dosyalarının yerini aldı — dış kaynak ya da lisans koşulu yok).

- `<tepki>.svg`  emojinin dinlenme karesi (statik poster; kartlarda, listelerde, özetlerde `<img>`).

Elle düzenlenmez: çizim ve animasyon `src/lib/reaction-art.ts`'tedir, posterler ondan üretilir:

    node scripts/build-reaction-posters.mjs

Hareketli emoji (`playReactionIn`) ve emojinin çevresinde patlayan efekt (`playReactionEffect`, `src/features/reactions/reaction-fx.ts`)
tarayıcıda kodla çizilir; ayrı animasyon dosyası yoktur.
