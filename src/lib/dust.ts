import { prefersReducedMotion } from "./motion";

/**
 * Silinen pano nesnesinin yerinde küçük bir toz bulutu (docs/history/335-*): `.mi-dust` parçacıkları öğenin merkezinden saçılır.
 * Parçacıklar `position: fixed` ile gövdeye eklenir (pano tuvali kırpar ve dönüştürür), animasyon bitince kendilerini siler.
 * Hareketi azalt açıkken hiçbir şey eklenmez. Dönen işlev: öğeye `mi-poof` verir, geri almak için çağrılır.
 */
export function poofElement(el: HTMLElement | null, particles = 9): () => void {
  if (!el || typeof document === "undefined" || prefersReducedMotion()) return () => undefined;
  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < particles; i++) {
    const dust = document.createElement("i");
    dust.className = "mi-dust";
    const angle = (i / particles) * Math.PI * 2 + Math.random() * 0.6;
    const distance = 28 + Math.random() * 26;
    dust.style.cssText = `position:fixed;z-index:70;left:${cx}px;top:${cy}px;--dx:${Math.cos(angle) * distance}px;--dy:${Math.sin(angle) * distance}px`;
    dust.setAttribute("aria-hidden", "true");
    document.body.appendChild(dust);
    dust.addEventListener("animationend", () => dust.remove(), { once: true });
  }
  el.classList.add("mi-poof");
  return () => el.classList.remove("mi-poof");
}
