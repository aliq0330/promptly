Telegram hareketli emoji varlıkları (docs/history/265-*) — kaynak: github.com/saeedtahmtan/telemoji (Telegram'ın Animated Emoji paketi; Telegram'ın koşullarına tabidir).

- `<tepki>.svg`   emojinin dinlenme karesi (Lottie 0. kare, statik poster; kartlarda ve listelerde `<img>`)
- `<tepki>.tgs`   hareketli emoji (gzip'li Lottie; seçicide ve düğmede oynar)
- `<tepki>-fx.tgs` emoji efekti (emojinin etrafında patlayan büyük animasyon; `tgs/reactions/U+0031_U+20E3_N`)

Tepki → efekt dosyası: love→4, fire→14, wow→21, clap→22, haha→11, idea→16 (Telegram'da ampul efekti yok: 💡 yıldız efektini kullanır).
Hepsi `src/lib/reactions.ts` içinde adlandırılır; yenisi eklenirse oradan eklenir.
