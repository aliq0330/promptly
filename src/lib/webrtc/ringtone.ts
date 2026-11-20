/**
 * Çalma sesi (docs/history/449-*): Web Audio ile üretilir — ses DOSYASI/harici kaynak yok. Tarayıcı kullanıcı etkileşimi olmadan
 * sesi engellerse (autoplay politikası) sessizce çalmaz; çağrı UI'ı yine görünür. `incoming` çift vuruşlu zil, `ringback` arayanın
 * duyduğu tek tonluk "çalıyor" sesidir. Dönen fonksiyon sesi durdurur ve kaynakları bırakır.
 */
export type RingtoneKind = "incoming" | "ringback";

export function startRingtone(kind: RingtoneKind): () => void {
  if (typeof window === "undefined") return () => {};
  const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return () => {};
  let ctx: AudioContext | null = null;
  let timer: ReturnType<typeof setInterval> | null = null;
  try {
    ctx = new Ctor();
  } catch {
    return () => {};
  }
  const audio = ctx;

  const beep = (at: number, freq: number, length: number, volume: number) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume, at + 0.02);
    gain.gain.linearRampToValueAtTime(0, at + length);
    osc.connect(gain).connect(audio.destination);
    osc.start(at);
    osc.stop(at + length + 0.02);
  };

  const cycle = () => {
    if (audio.state === "suspended") void audio.resume().catch(() => {});
    if (audio.state !== "running") return;
    const t = audio.currentTime;
    if (kind === "incoming") {
      beep(t, 880, 0.35, 0.12);
      beep(t + 0.45, 660, 0.35, 0.12);
    } else {
      beep(t, 440, 1.0, 0.06);
    }
  };

  cycle();
  timer = setInterval(cycle, kind === "incoming" ? 2_500 : 3_500);
  return () => {
    if (timer) clearInterval(timer);
    timer = null;
    void audio.close().catch(() => {});
  };
}
