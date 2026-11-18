/**
 * Bildirim sesi (docs/history/435-*): dosya yok, Web Audio ile üretilen iki kısa, yumuşak nota (≈ 0,35 sn, düşük ses). Tarayıcı kullanıcı etkileşimi olmadan
 * sesi engellerse ya da ses bağlamı yoksa sessizce vazgeçilir (kart yine çıkar). Hareketi azalt ile ilgisi yoktur; açma/kapama yalnız Ayarlar'dadır (varsayılan KAPALI).
 */
let context: AudioContext | null = null;

export function playNotificationChime(): void {
  if (typeof window === "undefined") return;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    context ??= new Ctor();
    const ctx = context;
    if (ctx.state === "suspended") void ctx.resume().catch(() => undefined);
    if (ctx.state === "closed") return;
    const now = ctx.currentTime;
    [660, 880].forEach((frequency, index) => {
      const start = now + index * 0.14;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 0.22);
    });
  } catch {
    // Ses çalınamadı: kart yine görünür.
  }
}
