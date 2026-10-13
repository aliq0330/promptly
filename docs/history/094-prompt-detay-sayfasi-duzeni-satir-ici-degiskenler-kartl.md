### 9.94 Prompt detay sayfası düzeni + satır içi değişkenler; kartlarda prompt metni yok

- **Görsel konumu:** `/prompts/local`'da gönderinin çıktı görseli (+ küçük resim şeridi, lightbox) artık başlık/açıklama/yazar bloğunun hemen altında; sonra köken kutuları, aksiyon çubuğu, prompt metni.
- **Değişkenler satır içinde:** "Promptu kişiselleştir" modalı (`personalize-modal.tsx`) silindi. Promptta değişken varsa prompt bloğunun içinde, metnin üstünde `PromptVariableInputs` alanları (varsayılan değerle dolu) çıkar; yazdıkça gösterilen metin anında `resolvePromptText` ile güncellenir. Kopyala/Çalıştır çözümlenmiş metni kullanır; bloktaki "Şablonu Kopyala" ham `{token}` şablonunu, "Varsayılanlara dön" değerleri sıfırlar. Değerler yalnızca yerel durumdur, şablon asla değişmez.
- **Kartlar:** `PromptCard` artık prompt metni kutusunu (`PromptPreviewBox`) göstermiyor; prompt yalnızca detay sayfasında görünür (başlık + açıklama + varsa çıktı önizlemesi kalır). `PromptPreviewBox` yalnızca `/dev` sayfasında kullanılıyor.
- Yeni metin yok (mevcut `variable.*`/`prompt.*` anahtarları). Migration yok. Doğrulama: tsc/lint/build temiz; tarayıcıda denenmedi.
