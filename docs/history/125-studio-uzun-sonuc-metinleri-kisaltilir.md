### 9.125 Studio: uzun sonuç metinleri kısaltılır

Studio'da metin sonuçları (Sonuçlar kartı 8 satır, Geçmiş kartı 5 satır) kısaltılır; metne ya da "Daha fazla göster"e tıklayınca tamamı açılır, tekrar tıklayınca kapanır (`features/studio/clamped-text.tsx`, yalnızca gerçekten taşan metinde bağlantı çıkar). Geçmişteki kısaltma bir CSS çakışması yüzünden (`line-clamp` + `block`) hiç çalışmıyordu; düzeltildi. Yeni metin yok, migration yok. Playwright 7/7.
