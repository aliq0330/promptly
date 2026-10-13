### 9.118 Masonry'de ilk kartların üstten hizası

Kart/Odak ızgaralarında (`PromptGrid`, `FeedGrid`, `RequestList`, `FocusGrid`) öğeler `animate-rise-in` (8px aşağıdan kayma) kullanıyordu; mobil Safari'de CSS sütunlarındaki ilk kartlar animasyon sırasında farklı ofsetlerde kalıp üstten hizasız görünüyordu. Izgara öğeleri artık yalnızca opaklık geçişi olan yeni `animate-grid-in` kullanıyor (kayma yok, `backwards` dolum → transform/stacking context kalmaz, menü sorunu geri gelmez). Diğer sayfa girişleri `rise-in` olarak kaldı. Migration yok. tsc/lint temiz; gerçek iOS Safari'de denenmedi.
