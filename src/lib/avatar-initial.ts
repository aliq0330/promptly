/**
 * Hazır profil resmi (docs/history/427-*): renkli zemin üstünde kullanıcı adının baş harfi, tarayıcıda çizilir ve fotoğraf gibi yüklenir
 * (`uploadAvatar`) — sunucuda üretim yok. Yalnız tarayıcıda çalışır (`canvas`).
 */
export async function renderInitialAvatar(letter: string, color: string): Promise<File> {
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  const font = `700 ${Math.round(size * 0.5)}px "Bricolage Grotesque Variable", system-ui, sans-serif`;
  try {
    await document.fonts?.load(font, letter);
  } catch {
    /* font could not be preloaded — the system font draws the letter instead */
  }
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = "#ffffff"; // beyaz harf: AVATAR_COLORS hepsiyle ≥ 4.5:1
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(letter, size / 2, size / 2 + size * 0.03);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("canvas export failed");
  return new File([blob], "avatar.png", { type: "image/png" });
}
