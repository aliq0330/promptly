# 471 — Klavye açıkken pencerenin arka planı normaldekiyle aynı

Kullanıcı: "Normalde modal açıkken arka plan opaklığı neyse o olsun."

`Modal` klavye açıkken arka plandaki hafif bulanıklığı (`backdrop-blur-[2px]`) kaldırıyordu (377-*); karartı (`bg-scrim`,
%45) aynıydı ama sayfa net göründüğü için arka plan farklı duruyordu. Artık bulanıklık klavye açıkken de kalır; görünür alanın
altındaki şeridi boyayan belgeye bağlı karartı (470-*) da aynı bulanıklığı taşır. Alt güvenli alan dolgusunun kalkması ve kartın
klavyenin 8 px üstünde durması değişmedi.

Test: `run-spaces` 30 klavye kapalıyken ve açıkken katmanın `background-color` ve `backdrop-filter` değerlerinin aynı olduğunu,
şerit karartısının da aynı bulanıklıkta olduğunu denetler; `run-team-projects` 45i geçti. tsc/lint/test/build temiz. Gerçek iOS'ta
denenmedi (iOS'ta `backdrop-filter` klavye açılırken kaydırma performansını etkileyebilir; sorun çıkarsa ölçülmeli).
