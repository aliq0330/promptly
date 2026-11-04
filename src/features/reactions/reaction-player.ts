import { prefersReducedMotion } from "@/lib/motion";
import { REACTION_ART } from "@/lib/reaction-art";
import type { ReactionKey } from "@/lib/reactions";
import { publicAssetUrl } from "@/lib/utils";
import { buildReactionEffect, drawReactionEffect, EFFECT_ORIGIN_X, EFFECT_ORIGIN_Y, effectOriginX, prepareEffectSprites } from "./reaction-fx";

/*
 * Promptly'nin kendi tepki emojileri ve efektleri (docs/history/334-*; 265'teki Telegram TGS + lottie-web oynatıcısının yerini alır).
 * - Statik görünüm: `public/reactions/<tepki>.svg` (düz `<img>`, dinlenme karesi; `scripts/build-reaction-posters.mjs` `lib/reaction-art.ts`'ten üretir).
 * - Emoji animasyonu: aynı çizim satır içi SVG olarak kabın içine konur, her karede `REACTION_ART[tepki].pose(t)` yazılır.
 * - Efekt: emojinin çevresindeki kare kutuda tuval (`reaction-fx.ts`); çıkartmalar ilk efektte bir kez hazırlanır.
 * Sayfa açılışında hiçbir şey yüklenmez ya da çizilmez; dış dosya/kütüphane yoktur.
 */

export type ReactionAssetKind = "poster";

/** `poster` = emojinin dinlenme karesi (SVG). */
export function reactionAssetUrl(key: ReactionKey, kind: ReactionAssetKind = "poster"): string {
  void kind;
  return publicAssetUrl(`/reactions/${key}.svg`);
}

/** Hareketi azaltmayı seçen izleyicide hiçbir şey oynamaz; statik poster kalır, tepki yine kaydedilir. */
export function canAnimateReactions(): boolean {
  return typeof window !== "undefined" && !prefersReducedMotion();
}

export interface ReactionPlayback {
  destroy(): void;
}

let instance = 0;

/** Emojinin kendi animasyonunu `container` içinde bir kez oynatır; bitince (ya da başlayamazsa) `onDone`. Erken durdurmak için tutamaç döner. */
export function playReactionIn(container: HTMLElement, key: ReactionKey, kind: "emoji", onDone?: () => void): ReactionPlayback {
  void kind;
  const art = REACTION_ART[key];
  const prefix = `rx${(instance += 1)}_`;
  container.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" overflow="visible" aria-hidden="true" focusable="false">${art.markup(prefix, art.pose(0))}</svg>`;
  const refs = new Map<string, Element>();
  container.querySelectorAll("[data-r]").forEach((el) => refs.set(el.getAttribute("data-r") ?? "", el));
  let frame = 0, destroyed = false;
  const start = performance.now();
  const finish = () => {
    if (destroyed) return;
    destroyed = true;
    cancelAnimationFrame(frame);
    container.textContent = "";
    onDone?.();
  };
  const step = (now: number) => {
    if (destroyed) return;
    const t = Math.min((now - start) / 1000, art.duration);
    for (const [ref, attrs] of Object.entries(art.pose(t))) {
      const el = refs.get(ref);
      if (el) for (const [name, value] of Object.entries(attrs)) el.setAttribute(name, value);
    }
    if (t >= art.duration) finish();
    else frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return {
    destroy() {
      if (destroyed) return;
      destroyed = true;
      cancelAnimationFrame(frame);
      container.textContent = "";
    },
  };
}

/** Efekt kutusunun kenarı (px); dar ekranda ekran genişliğine sığar. Telegram efektiyle aynı ölçü ve çıkış noktası (265). */
const EFFECT_MAX = 156;
let effectLayer: HTMLDivElement | null = null;

function getEffectLayer(): HTMLDivElement {
  if (effectLayer?.isConnected) return effectLayer;
  const layer = document.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.setAttribute("data-reaction-effects", "");
  // Her pencerenin (z-70) üstünde, hiçbir şeyin önünde değil: efekt süstür, işaretçi içinden geçer.
  layer.style.cssText = "position:fixed;inset:0;z-index:100;pointer-events:none;overflow:hidden";
  document.body.appendChild(layer);
  effectLayer = layer;
  return layer;
}

/**
 * Tepki efekti: `anchor`'dan (tepkinin simgesi — kutunun ortası değil, efektin çıkış noktası onun üstüne oturur) ~3 sn patlar ve kendini
 * kaldırır; sayfa kayarken çıpayı izler. Animasyon kapalıysa sessizce hiçbir şey yapmaz.
 */
export function playReactionEffect(key: ReactionKey, anchor: Element | null): void {
  if (!anchor || !canAnimateReactions()) return;
  const size = Math.min(EFFECT_MAX, document.documentElement.clientWidth - 24);
  const box = document.createElement("div");
  box.style.cssText = `position:absolute;width:${size}px;height:${size}px`;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(size * dpr);
  canvas.height = Math.round(size * dpr);
  canvas.style.cssText = "display:block;width:100%;height:100%";
  box.appendChild(canvas);
  getEffectLayer().appendChild(box);
  // Efekt sola açılır (Telegram'daki gibi); emoji ekranın sol kenarındaysa (telefonda gönderinin tepki düğmesi) yerleşim aynalanır, sağa açılır.
  const start0 = anchor.getBoundingClientRect(), cx0 = start0.left + start0.width / 2, viewport = document.documentElement.clientWidth;
  const mirrored = cx0 < size * EFFECT_ORIGIN_X && viewport - cx0 > cx0;
  const originX = effectOriginX(mirrored);
  const place = () => {
    if (!anchor.isConnected) return;
    const rect = anchor.getBoundingClientRect();
    box.style.left = `${rect.left + rect.width / 2 - size * originX}px`;
    box.style.top = `${rect.top + rect.height / 2 - size * EFFECT_ORIGIN_Y}px`;
  };
  place();
  let frame = 0, done = false;
  const cleanup = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("scroll", place, true);
    box.remove();
  };
  window.addEventListener("scroll", place, true);
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    cleanup();
    return;
  }
  prepareEffectSprites()
    .then(() => {
      const effect = buildReactionEffect(key, size, Math.floor(Math.random() * 1e9), mirrored);
      if (!effect || done) {
        cleanup();
        return;
      }
      const start = performance.now();
      const step = (now: number) => {
        if (done) return;
        const t = (now - start) / 1000;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, size, size);
        if (t >= effect.duration) {
          cleanup();
          return;
        }
        drawReactionEffect(effect, ctx, t);
        frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    })
    .catch((err) => {
      console.error("playReactionEffect", err);
      cleanup();
    });
}
