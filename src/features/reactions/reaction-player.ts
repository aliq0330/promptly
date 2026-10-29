import { prefersReducedMotion } from "@/lib/motion";
import type { ReactionKey } from "@/lib/reactions";
import { publicAssetUrl } from "@/lib/utils";

/*
 * Telegram hareketli emojileri (docs/history/265-*): `public/reactions/` altındaki TGS dosyaları (gzip'li Lottie) lottie-web (yalnız SVG
 * oluşturucu, "light" derleme) ile oynatılır. Hiçbiri sayfa açılışında yüklenmez: kütüphane ve dosyalar ilk kez bir tepki seçici açılınca /
 * bir tepki verilince indirilir, sonra bellekte kalır. Statik görünüm (poster) düz `<img>`dir — oynatıcıya ihtiyaç duymaz.
 */

type Lottie = typeof import("lottie-web/build/player/lottie_light").default;

export type ReactionAssetKind = "poster" | "emoji" | "effect";

/** `poster` = emojinin dinlenme karesi (SVG), `emoji` = hareketli emoji (TGS), `effect` = emojinin etrafında patlayan Telegram efekti (TGS). */
export function reactionAssetUrl(key: ReactionKey, kind: ReactionAssetKind): string {
  return publicAssetUrl(`/reactions/${key}${kind === "effect" ? "-fx.tgs" : kind === "emoji" ? ".tgs" : ".svg"}`);
}

let lottieLoad: Promise<Lottie> | null = null;
function loadLottie(): Promise<Lottie> {
  if (!lottieLoad) {
    lottieLoad = import("lottie-web/build/player/lottie_light").then((module) => module.default);
    lottieLoad.catch(() => {
      lottieLoad = null;
    });
  }
  return lottieLoad;
}

const dataCache = new Map<string, Promise<unknown>>();

/** One TGS file → its Lottie JSON (cached; a failed download is not cached, so the next try asks again). */
function loadAnimationData(key: ReactionKey, kind: "emoji" | "effect"): Promise<unknown> {
  const url = reactionAssetUrl(key, kind);
  let pending = dataCache.get(url);
  if (!pending) {
    pending = fetch(url)
      .then((response) => {
        if (!response.ok || !response.body) throw new Error(`reaction asset ${response.status}`);
        return new Response(response.body.pipeThrough(new DecompressionStream("gzip"))).json();
      })
      .catch((err) => {
        dataCache.delete(url);
        throw err;
      });
    dataCache.set(url, pending);
  }
  return pending;
}

/** Animations need `DecompressionStream` (Chrome 80+, Safari 16.4+, Firefox 113+) and a viewer who has not asked for less motion; otherwise the static poster stays. */
export function canAnimateReactions(): boolean {
  return typeof window !== "undefined" && typeof DecompressionStream !== "undefined" && typeof structuredClone === "function" && !prefersReducedMotion();
}

export interface ReactionPlayback {
  destroy(): void;
}

/** Plays one reaction animation once inside `container`; `onDone` runs when it ends (or could not start). Returns a handle to stop it early. */
export function playReactionIn(container: HTMLElement, key: ReactionKey, kind: "emoji" | "effect", onDone?: () => void): ReactionPlayback {
  let destroyed = false;
  let animation: { destroy(): void } | null = null;
  const finish = () => {
    if (destroyed) return;
    destroyed = true;
    animation?.destroy();
    animation = null;
    onDone?.();
  };
  Promise.all([loadLottie(), loadAnimationData(key, kind)])
    .then(([lottie, data]) => {
      if (destroyed) return;
      const item = lottie.loadAnimation({ container, renderer: "svg", loop: false, autoplay: true, animationData: structuredClone(data) });
      animation = item;
      item.addEventListener("complete", finish);
    })
    .catch((err) => {
      console.error("playReactionIn", err);
      finish();
    });
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      animation?.destroy();
      animation = null;
    },
  };
}

const EFFECT_MAX = 156;
/** Where the burst leaves from inside Telegram's 512 px effect canvas (the emoji sits right of centre): measured from the effect files, as a fraction of the box. */
const EFFECT_ORIGIN_X = 0.78;
const EFFECT_ORIGIN_Y = 0.5;
let effectLayer: HTMLDivElement | null = null;

function getEffectLayer(): HTMLDivElement {
  if (effectLayer?.isConnected) return effectLayer;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-reaction-effects", "");
  // Above every dialog (z-70), never in the way: the burst is decoration, the pointer goes through it.
  layer.style.cssText = "position:fixed;inset:0;z-index:100;pointer-events:none;overflow:hidden";
  document.body.appendChild(layer);
  effectLayer = layer;
  return layer;
}

/**
 * The Telegram "emoji effect": the big burst leaves from `anchor` (the reaction's icon — the burst's own origin, not the box centre, sits on it)
 * for about three seconds, over the page, and removes itself. It follows the anchor while the page scrolls. Quietly does nothing where animations are off.
 */
export function playReactionEffect(key: ReactionKey, anchor: Element | null): void {
  if (!anchor || !canAnimateReactions()) return;
  const size = Math.min(EFFECT_MAX, document.documentElement.clientWidth - 24);
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;width:${size}px;height:${size}px`;
  getEffectLayer().appendChild(box);
  const place = () => {
    if (!anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    box.style.left = `${rect.left + rect.width / 2 - size * EFFECT_ORIGIN_X}px`;
    box.style.top = `${rect.top + rect.height / 2 - size * EFFECT_ORIGIN_Y}px`;
  };
  place();
  window.addEventListener("scroll", place, true);
  let safety = 0;
  const cleanup = () => {
    window.clearTimeout(safety);
    window.removeEventListener("scroll", place, true);
    playback.destroy();
    box.remove();
  };
  const playback = playReactionIn(box, key, "effect", cleanup);
  safety = window.setTimeout(cleanup, 4500);
}
