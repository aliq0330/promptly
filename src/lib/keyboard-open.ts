/**
 * Ekran klavyesi açık mı? (docs/history/377-*) Karar saftır, birim testlidir: görünür alan klavye eşiğinden fazla küçülmüş VE odak bir yazma
 * alanındaysa. Yalnız görünür alanın küçülmesi (adres çubuğu, yüzen araç çubuğu) klavye sayılmaz; yazma alanı dışındaki odak da (düğme) sayılmaz.
 */
import { keyboardFrame } from "./keyboard-frame.ts";

export const TEXT_ENTRY_SELECTOR = 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="color"]), [contenteditable=""], [contenteditable="true"]';

export function isKeyboardOpen(params: { innerHeight: number; viewportHeight: number; viewportOffsetTop: number; focusedIsTextEntry: boolean }): boolean {
  if (!params.focusedIsTextEntry) return false;
  return keyboardFrame(params) !== null;
}
