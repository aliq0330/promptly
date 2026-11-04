/**
 * Ekran klavyesi açıkken tam ekran bir panelin oturacağı alan (docs/history/332-*).
 *
 * iOS Safari'de klavye açılınca düzen görünümü (`window.innerHeight`) küçülmez; görünür alan (`visualViewport`) küçülür ve çoğu
 * zaman sayfayı yukarı kaydırır (`offsetTop > 0`). `fixed` bir panel `top: 0` ile kalırsa başlığı ekranın üstünde kaybolur; altını
 * `innerHeight - height - offsetTop` ile klavyeye göre çekmek de `innerHeight`'in klavyeyle değiştiği ya da tarayıcı çubuklarını
 * kapsadığı sürümlerde (iOS 26'nın yüzen adres çubuğu) yazma alanıyla klavye arasında boşluk bırakır. Bu yüzden panel doğrudan görünür
 * alana oturtulur: `top = offsetTop`, `height = visualViewport.height` — hangi tarayıcı ne derse desin panelin altı görünür alanın
 * altıdır.
 *
 * Klavye yokken `null` (panel kendi CSS'ine döner): adres çubuğunun büyüyüp küçülmesi klavye sayılmasın diye eşik var.
 */
export const KEYBOARD_MIN_PX = 120;

export interface KeyboardFrame {
  top: number;
  height: number;
}

export function keyboardFrame(params: { innerHeight: number; viewportHeight: number; viewportOffsetTop: number }): KeyboardFrame | null {
  const { innerHeight, viewportHeight, viewportOffsetTop } = params;
  if (!(viewportHeight > 0) || !(innerHeight > 0)) return null;
  const shrunk = innerHeight - viewportHeight;
  const covered = innerHeight - viewportHeight - viewportOffsetTop;
  if (shrunk <= KEYBOARD_MIN_PX && covered <= KEYBOARD_MIN_PX) return null;
  return { top: Math.max(0, Math.round(viewportOffsetTop)), height: Math.round(viewportHeight) };
}
