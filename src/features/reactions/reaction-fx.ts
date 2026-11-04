import { DROPLET_PATH, EASE, flamePath, HEART_PATH, reactionSvg, TEAR_PATH } from "@/lib/reaction-art";
import type { ReactionKey } from "@/lib/reactions";

/*
 * Tepki efektleri (docs/history/334-*): emojinin çevresindeki kare kutuda (çıkış noktası kutunun %78 · %50'si) ~3 sn patlayan "çıkartma"
 * parçacıkları. Telegram'ın efekt dosyalarının yerini alır; dil aynıdır (kontürlü, parlak çizimler kutuda kalır), çizimler bize aittir.
 *
 * Her parçacık zamanın SAF fonksiyonudur (`draw(ctx, yerelZaman)`): aynı tohum + aynı an → aynı kare. Çıkartmalar (kalp, alev, duman, yıldız,
 * kelime balonu…) ilk efektte bir kez çizilip bellekte tutulur; sayfa açılışında hiçbir şey yapılmaz.
 */

export const EFFECT_ORIGIN_X = 0.78;
export const EFFECT_ORIGIN_Y = 0.5;

type Ctx = CanvasRenderingContext2D;
type Sprite = HTMLCanvasElement;
interface Item {
  t0: number;
  life: number;
  layer: number;
  draw(c: Ctx, lt: number): void;
}
export interface ReactionEffect {
  duration: number;
  items: Item[];
}

const TAU = Math.PI * 2;
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

/* ------------------------------------------------------------------ çıkartmalar */

const Q = 2; // çıkartmalar 2 kat çözünürlükte çizilir (yüksek yoğunluklu ekran)
function sprite(w: number, h: number, paint: (c: Ctx) => void): Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(w * Q);
  canvas.height = Math.ceil(h * Q);
  const c = canvas.getContext("2d");
  if (c) {
    c.scale(Q, Q);
    paint(c);
  }
  return canvas;
}
function rgb(hex: string): number[] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
/** `amount` > 0 beyaza, < 0 siyaha doğru karıştırır. */
function shade(hex: string, amount: number): string {
  const target = amount < 0 ? 0 : 255, p = Math.abs(amount);
  return `rgb(${rgb(hex).map((v) => Math.round(v + (target - v) * p)).join(",")})`;
}
function starPath(c: Ctx, cx: number, cy: number, outer: number, inner: number, points: number, rot = 0) {
  c.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 ? inner : outer, a = rot - Math.PI / 2 + (i * Math.PI) / points;
    const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
    if (i) c.lineTo(x, y);
    else c.moveTo(x, y);
  }
  c.closePath();
}

const HEART_COLORS = ["#ff2741", "#ff4fa0", "#a64dff", "#2f6bff", "#12c4d8", "#25c24a", "#ffc414", "#ff7a14"];
function heartSprite(color: string): Sprite {
  return sprite(110, 104, (c) => {
    const path = new Path2D(HEART_PATH);
    c.translate(55 - 45, 53 - 45);
    c.scale(0.9, 0.9);
    const g = c.createRadialGradient(35, 25, 4, 50, 50, 56);
    g.addColorStop(0, shade(color, 0.5));
    g.addColorStop(0.45, color);
    g.addColorStop(1, shade(color, -0.2));
    c.fillStyle = g;
    c.fill(path);
    c.save();
    c.clip(path);
    const gloss = c.createLinearGradient(0, 10, 0, 45);
    gloss.addColorStop(0, "rgba(255,255,255,.42)");
    gloss.addColorStop(1, "rgba(255,255,255,0)");
    c.fillStyle = gloss;
    c.beginPath();
    c.ellipse(30, 26, 20, 12, -0.5, 0, TAU);
    c.fill();
    c.restore();
    c.lineWidth = 7;
    c.lineJoin = "round";
    c.strokeStyle = shade(color, -0.45);
    c.stroke(path);
    c.strokeStyle = "rgba(255,255,255,.95)";
    c.lineCap = "round";
    c.lineWidth = 5;
    c.beginPath();
    c.arc(68, 30, 12, -Math.PI * 0.55, -Math.PI * 0.1);
    c.stroke();
    c.fillStyle = "#fff";
    c.beginPath();
    c.arc(81, 44, 3.4, 0, TAU);
    c.fill();
  });
}
function drawFlame(c: Ctx, t: number, k: number, seed: number) {
  const outer = new Path2D(flamePath(1, t, k, seed)), mid = new Path2D(flamePath(0.76, t, k * 1.1, seed + 2.3)), inner = new Path2D(flamePath(0.5, t, k * 1.2, seed + 4.1));
  let g = c.createLinearGradient(0, 5, 0, 95);
  g.addColorStop(0, "#ff3b1a");
  g.addColorStop(1, "#ff6a1f");
  c.fillStyle = g;
  c.fill(outer);
  c.lineWidth = 3.2;
  c.lineJoin = "round";
  c.strokeStyle = "#b5180b";
  c.stroke(outer);
  g = c.createLinearGradient(0, 25, 0, 95);
  g.addColorStop(0, "#ff7a1a");
  g.addColorStop(1, "#ffa83a");
  c.fillStyle = g;
  c.fill(mid);
  g = c.createLinearGradient(0, 50, 0, 95);
  g.addColorStop(0, "#ffc53a");
  g.addColorStop(1, "#ffe887");
  c.fillStyle = g;
  c.fill(inner);
  g = c.createRadialGradient(50, 84, 0, 50, 84, 16);
  g.addColorStop(0, "rgba(255,253,240,1)");
  g.addColorStop(1, "rgba(255,246,200,0)");
  c.fillStyle = g;
  c.beginPath();
  c.ellipse(50, 84, 16, 11, 0, 0, TAU);
  c.fill();
}
/** Bir alevin titreme kareleri (çizgi film gibi kare kare oynar). */
function flameFrames(seed: number): Sprite[] {
  return Array.from({ length: 6 }, (_, j) =>
    sprite(112, 106, (c) => {
      c.translate(6, 6);
      drawFlame(c, j * 0.15 + seed, 1.35, seed);
    }),
  );
}
function smokeSprite(R: () => number): Sprite {
  return sprite(140, 104, (c) => {
    const puffs = [[42, 64, 24], [68, 50, 28], [96, 62, 23], [58, 76, 20], [84, 78, 19]].map(([x, y, r]) => [x + (R() - 0.5) * 6, y + (R() - 0.5) * 6, r * (0.9 + R() * 0.2)]);
    c.fillStyle = "#d6c39c";
    for (const [x, y, r] of puffs) {
      c.beginPath();
      c.arc(x, y, r + 3.6, 0, TAU);
      c.fill();
    }
    const g = c.createLinearGradient(0, 24, 0, 100);
    g.addColorStop(0, "#fffaf0");
    g.addColorStop(1, "#eedcb8");
    c.fillStyle = g;
    for (const [x, y, r] of puffs) {
      c.beginPath();
      c.arc(x, y, r, 0, TAU);
      c.fill();
    }
    c.fillStyle = "rgba(255,255,255,.85)";
    for (const [x, y, r] of puffs) {
      c.beginPath();
      c.ellipse(x - r * 0.32, y - r * 0.4, r * 0.3, r * 0.2, -0.5, 0, TAU);
      c.fill();
    }
  });
}
function emberSprite(): Sprite {
  return sprite(30, 30, (c) => {
    const g = c.createRadialGradient(13, 12, 1, 15, 15, 11);
    g.addColorStop(0, "#fff6b0");
    g.addColorStop(0.5, "#ffb020");
    g.addColorStop(1, "#ff6a00");
    c.fillStyle = g;
    c.beginPath();
    c.arc(15, 15, 10, 0, TAU);
    c.fill();
    c.lineWidth = 2.6;
    c.strokeStyle = "#c2410c";
    c.stroke();
  });
}
function pathSprite(w: number, h: number, d: string, x: number, y: number, scale: number, fill: (c: Ctx) => CanvasGradient, stroke: string, lineWidth: number, glint: boolean): Sprite {
  return sprite(w, h, (c) => {
    c.translate(x, y);
    c.scale(scale, scale);
    const p = new Path2D(d);
    c.fillStyle = fill(c);
    c.fill(p);
    c.lineWidth = lineWidth;
    c.strokeStyle = stroke;
    c.stroke(p);
    if (glint) {
      c.fillStyle = "rgba(255,255,255,.85)";
      c.beginPath();
      c.ellipse(-2.6, 2, 1.6, 2.6, 0, 0, TAU);
      c.fill();
    }
  });
}
function starSprite(): Sprite {
  return sprite(120, 120, (c) => {
    starPath(c, 60, 62, 48, 23, 5);
    const g = c.createRadialGradient(46, 44, 4, 60, 62, 56);
    g.addColorStop(0, "#fff7c4");
    g.addColorStop(0.45, "#ffd23a");
    g.addColorStop(1, "#f29d00");
    c.fillStyle = g;
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = 8;
    c.strokeStyle = "#cf7a00";
    c.stroke();
    starPath(c, 60, 62, 30, 15, 5);
    c.fillStyle = "rgba(255,250,215,.45)";
    c.fill();
    c.fillStyle = "rgba(255,255,255,.9)";
    c.beginPath();
    c.ellipse(46, 46, 7, 4, -0.7, 0, TAU);
    c.fill();
    c.beginPath();
    c.arc(56, 38, 2.4, 0, TAU);
    c.fill();
  });
}
/** Çizgi roman patlama balonu (sarı büyük / mavi küçük). */
function burstSprite(R: () => number, warm: boolean): Sprite {
  return sprite(160, 160, (c) => {
    const n = warm ? 13 : 11;
    c.beginPath();
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 ? 44 + R() * 6 : 66 + R() * 10, a = -Math.PI / 2 + (i * Math.PI) / n;
      if (i) c.lineTo(80 + Math.cos(a) * r, 80 + Math.sin(a) * r);
      else c.moveTo(80 + Math.cos(a) * r, 80 + Math.sin(a) * r);
    }
    c.closePath();
    const g = c.createLinearGradient(0, 10, 0, 150);
    g.addColorStop(0, warm ? "#fff06a" : "#9fe8ff");
    g.addColorStop(1, warm ? "#ffb51a" : "#3aa6ff");
    c.fillStyle = g;
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = 6.5;
    c.strokeStyle = warm ? "#df6a00" : "#1f6fd6";
    c.stroke();
    starPath(c, 80, 80, 46, 30, n, 0.12);
    c.fillStyle = warm ? "rgba(255,250,210,.75)" : "rgba(230,248,255,.7)";
    c.fill();
  });
}
/** Sitenin başlık yazı tipi (Bricolage Grotesque, `next/font` değişkeni); yoksa kalın sistem yazı tipi. */
function wordFont(size: number): string {
  const family = getComputedStyle(document.documentElement).getPropertyValue("--font-display-face").trim();
  return `700 ${size}px ${family ? `${family}, ` : ""}"Arial Black", system-ui, sans-serif`;
}
/** Kelime balonu: kalın koyu kontür, açık→koyu dolgu, üstte parlama. */
function wordSprite(text: string, color: string): Sprite {
  const fs = 64;
  const probe = document.createElement("canvas").getContext("2d");
  if (probe) probe.font = wordFont(fs);
  const tw = probe?.measureText(text).width ?? fs * text.length * 0.6;
  const w = tw + fs * 0.55, h = fs * 1.3;
  return sprite(w, h, (c) => {
    c.font = wordFont(fs);
    c.textAlign = "center";
    c.textBaseline = "middle";
    const x = w / 2, y = h * 0.54;
    c.lineJoin = "round";
    c.lineWidth = fs * 0.26;
    c.strokeStyle = shade(color, -0.5);
    c.strokeText(text, x, y);
    const fill = document.createElement("canvas");
    fill.width = Math.ceil(w * Q);
    fill.height = Math.ceil(h * Q);
    const f = fill.getContext("2d");
    if (!f) return;
    f.scale(Q, Q);
    f.font = c.font;
    f.textAlign = "center";
    f.textBaseline = "middle";
    const g = f.createLinearGradient(0, y - fs * 0.4, 0, y + fs * 0.4);
    g.addColorStop(0, shade(color, 0.45));
    g.addColorStop(0.55, color);
    g.addColorStop(1, shade(color, -0.12));
    f.fillStyle = g;
    f.fillText(text, x, y);
    f.globalCompositeOperation = "source-atop";
    f.fillStyle = "rgba(255,255,255,.5)";
    f.beginPath();
    f.ellipse(x, y - fs * 0.32, tw * 0.55, fs * 0.13, 0, 0, TAU);
    f.fill();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.drawImage(fill, 0, 0);
  });
}
/** Emojinin bir karesi küçük çıkartma olarak (mini alkış, mini gülen yüz). */
function emojiFrame(key: ReactionKey, t: number, px: number): Promise<Sprite | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(sprite(px / Q, px / Q, (c) => c.drawImage(img, 0, 0, px / Q, px / Q)));
    img.onerror = () => resolve(null);
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(reactionSvg(key, `fx${key}_`, px, t));
  });
}

interface Sprites {
  heart: Sprite[];
  flames: Sprite[][];
  smoke: Sprite[];
  ember: Sprite;
  drop: Sprite;
  tear: Sprite;
  star: Sprite;
  burst: Sprite;
  burst2: Sprite;
  words: Map<string, Sprite>;
  clap: Sprite[];
  haha: Sprite[];
}
let sprites: Sprites | null = null;
let spritesReady: Promise<Sprites> | null = null;
/** Çıkartmalar ilk efektte bir kez hazırlanır (eşzamanlı çizim + iki küçük emoji görseli). */
export function prepareEffectSprites(): Promise<Sprites> {
  if (spritesReady) return spritesReady;
  const R = seeded(7);
  const flameFill = (top: string, bottom: string) => (c: Ctx) => {
    const g = c.createLinearGradient(0, -8, 0, 7);
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    return g;
  };
  const s: Sprites = {
    heart: HEART_COLORS.map(heartSprite),
    flames: [flameFrames(0), flameFrames(1.3), flameFrames(2.7)],
    smoke: [smokeSprite(R), smokeSprite(R), smokeSprite(R)],
    ember: emberSprite(),
    drop: pathSprite(34, 44, DROPLET_PATH, 17, 26, 2.4, flameFill("#ff6a1f", "#ffb03a"), "#b5180b", 1.2, false),
    tear: pathSprite(30, 40, TEAR_PATH, 15, 23, 1.35, (c) => {
      const g = c.createRadialGradient(-2, 2, 1, 0, 2, 10);
      g.addColorStop(0, "#d9f4ff");
      g.addColorStop(0.55, "#5cc4f6");
      g.addColorStop(1, "#2b8fe0");
      return g;
    }, "#1f78c8", 1.6, true),
    star: starSprite(),
    burst: burstSprite(R, true),
    burst2: burstSprite(R, false),
    words: new Map(),
    clap: [],
    haha: [],
  };
  for (const [text, color] of WORDS) s.words.set(text + color, wordSprite(text, color));
  spritesReady = Promise.all([
    Promise.all([emojiFrame("clap", 0.28, 128), emojiFrame("clap", 1.6, 128)]),
    Promise.all([emojiFrame("haha", 1.0417, 128), emojiFrame("haha", 0.9028, 128)]),
  ]).then(([clapFrames, hahaFrames]) => {
    s.clap = clapFrames.filter((f): f is Sprite => f !== null);
    s.haha = hahaFrames.filter((f): f is Sprite => f !== null);
    sprites = s;
    return s;
  });
  return spritesReady;
}
const WORDS: [string, string][] = [
  ["!", "#ff3b30"], ["?!", "#ffcf1f"], ["BRAVO", "#19c3e6"], ["BRAVO!", "#a855f7"],
  ["HAHA", "#19c3e6"], ["HA", "#ff7a1a"], ["HEHE", "#ff4fa0"], ["LOL", "#22c55e"], ["HAHA!", "#2f6bff"],
];

/* ------------------------------------------------------------------ parçacıklar */

export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
type Point = [number, number];
/** Kutuda dağınık, birbirinden ve çıkış noktasından uzak noktalar (çoğu çıkışın açılma yönünde — `dir` 1 = sola, -1 = sağa); yakından uzağa sıralı. */
function layout(R: () => number, S: number, O: Point, dir: number, n: number, minGap: number, minFromOrigin: number, avoid: [number, number, number][] = []): Point[] {
  const m = S * 0.09, pts: Point[] = [];
  for (let tries = 0; pts.length < n && tries < 3000; tries++) {
    const x = lerp(m, S - m, R()), y = lerp(m, S - m, R()), relax = tries > 1500 ? 0.65 : 1;
    if (Math.hypot(x - O[0], y - O[1]) < minFromOrigin * S) continue;
    if (dir * (O[0] - x) < S * 0.04 && R() > 0.35) continue;
    if (pts.some((q) => Math.hypot(q[0] - x, q[1] - y) < minGap * S * relax)) continue;
    if (avoid.some(([ax, ay, ar]) => Math.hypot(ax - x, ay - y) < ar * relax)) continue;
    pts.push([x, y]);
  }
  return pts.sort((a, b) => Math.hypot(a[0] - O[0], a[1] - O[1]) - Math.hypot(b[0] - O[0], b[1] - O[1]));
}

interface StickerOptions {
  t0: number;
  life: number;
  layer?: number;
  from: Point;
  to?: Point;
  /** Uçuş süresi (çıkıştan hedefe); 0 = yerinde belirir. */
  fly?: number;
  ease?: keyof typeof EASE;
  size: number;
  img?: Sprite;
  frames?: Sprite[];
  fps?: number;
  frame0?: number;
  paint?: (c: Ctx, size: number) => void;
  anchorBottom?: boolean;
  rot0?: number;
  rot1?: number;
  spin?: number;
  wobble?: number;
  wobbleF?: number;
  phase?: number;
  vx?: number;
  vy?: number;
  gravity?: number;
  sway?: number;
  swayF?: number;
  pop?: number;
  end?: number;
  fade?: number;
  grow?: number;
  pulse?: number;
  pulseF?: number;
  flipX?: number;
  flipY?: number;
  alpha?: number;
  trail?: boolean;
}
/** Çıkartma: çıkıştan hedefe süzülür (sonra yavaşça kayar/düşer), yaylanarak belirir, sonunda küçülerek kaybolur. */
function sticker(o: StickerOptions): Item {
  const to = o.to ?? o.from, fly = Math.max(o.fly ?? 0, 0.0001), ph = o.phase ?? 0;
  return {
    t0: o.t0,
    life: o.life,
    layer: o.layer ?? 2,
    draw(c, lt) {
      const e = Math.min(1, lt / fly);
      let x: number, y: number;
      if (lt < fly) {
        const k = EASE[o.ease ?? "outQuart"](e);
        x = lerp(o.from[0], to[0], k);
        y = lerp(o.from[1], to[1], k);
      } else {
        const d = lt - fly;
        x = to[0] + (o.vx ?? 0) * d;
        y = to[1] + (o.vy ?? 0) * d + 0.5 * (o.gravity ?? 0) * d * d;
      }
      if (o.sway) x += o.sway * Math.sin(lt * (o.swayF ?? 3) + ph);
      const pop = o.pop ?? 0.28, end = o.end ?? 0.3;
      let s = 1, a = o.alpha ?? 1;
      if (pop > 0 && lt < pop) s *= EASE.outBack(lt / pop);
      if (end > 0 && lt > o.life - end) s *= 1 - EASE.in((lt - (o.life - end)) / end);
      if (o.fade && lt > o.life * (1 - o.fade)) a *= 1 - (lt - o.life * (1 - o.fade)) / (o.life * o.fade);
      if (o.grow) s *= 1 + o.grow * EASE.out(Math.min(1, lt / o.life));
      if (o.pulse) s *= 1 + o.pulse * Math.sin(lt * (o.pulseF ?? 8) + ph);
      if (s <= 0.002 || a <= 0.002) return;
      let rot = lerp(o.rot0 ?? 0, o.rot1 ?? o.rot0 ?? 0, EASE.out(e));
      if (o.spin) rot += o.spin * lt;
      if (o.wobble) rot += o.wobble * Math.sin(lt * (o.wobbleF ?? 4) + ph);
      const sx = o.flipX ? 0.5 + 0.5 * Math.abs(Math.cos(lt * o.flipX + ph)) : 1;
      const sy = o.flipY ? Math.cos(lt * o.flipY + ph) : 1;
      if (o.trail && lt < fly) {
        // Kuyruklu yıldız: uçuş yönünün tersine sönen altın çizgi.
        const dx = to[0] - o.from[0], dy = to[1] - o.from[1], L = Math.hypot(dx, dy) || 1;
        const len = Math.min(L * EASE.outQuart(e), o.size * 1.7) * (1 - e * 0.7);
        const g = c.createLinearGradient(x, y, x - (dx / L) * len, y - (dy / L) * len);
        g.addColorStop(0, "rgba(255,200,40,.85)");
        g.addColorStop(1, "rgba(255,200,40,0)");
        c.save();
        c.globalAlpha = a;
        c.strokeStyle = g;
        c.lineCap = "round";
        c.lineWidth = o.size * 0.34 * (1 - e * 0.5);
        c.beginPath();
        c.moveTo(x, y);
        c.lineTo(x - (dx / L) * len, y - (dy / L) * len);
        c.stroke();
        c.restore();
      }
      c.save();
      c.globalAlpha = a;
      c.translate(x, y);
      c.rotate(rot);
      c.scale(s * sx, s * sy);
      if (o.paint) o.paint(c, o.size);
      else {
        const img = o.frames ? o.frames[(Math.floor(lt * (o.fps ?? 10)) + (o.frame0 ?? 0)) % o.frames.length] : o.img;
        if (img && img.width) {
          const h = o.size, w = (h * img.width) / img.height;
          c.drawImage(img, -w / 2, o.anchorBottom ? -h : -h / 2, w, h);
        }
      }
      c.restore();
    },
  };
}
function ring(o: { t0: number; life: number; layer?: number; at: Point; r0: number; r1: number; width: number; color: string; star?: boolean; rot?: number }): Item {
  return {
    t0: o.t0,
    life: o.life,
    layer: o.layer ?? 0,
    draw(c, lt) {
      const u = lt / o.life, r = lerp(o.r0, o.r1, EASE.outQuart(u));
      c.save();
      c.globalAlpha = 1 - EASE.in(u);
      c.strokeStyle = o.color;
      c.lineWidth = Math.max(0.3, o.width * (1 - u));
      c.lineJoin = "round";
      if (o.star) starPath(c, o.at[0], o.at[1], r, r * 0.5, 5, o.rot ?? 0);
      else {
        c.beginPath();
        c.arc(o.at[0], o.at[1], r, 0, TAU);
      }
      c.stroke();
      c.restore();
    },
  };
}
function dash(o: { t0: number; life: number; at: Point; angle: number; r0: number; r1: number; length: number; width: number; color: string }): Item {
  return {
    t0: o.t0,
    life: o.life,
    layer: 1,
    draw(c, lt) {
      const u = lt / o.life, r = lerp(o.r0, o.r1, EASE.outQuart(u)), len = o.length * (1 - u * 0.6), ca = Math.cos(o.angle), sa = Math.sin(o.angle);
      c.save();
      c.globalAlpha = 1 - EASE.in(u);
      c.strokeStyle = o.color;
      c.lineCap = "round";
      c.lineWidth = o.width * (1 - u * 0.5);
      c.beginPath();
      c.moveTo(o.at[0] + ca * (r - len), o.at[1] + sa * (r - len));
      c.lineTo(o.at[0] + ca * r, o.at[1] + sa * r);
      c.stroke();
      c.restore();
    },
  };
}
function glow(o: { t0: number; life: number; at: Point; r: number; color: string; alpha: number }): Item {
  return {
    t0: o.t0,
    life: o.life,
    layer: 0,
    draw(c, lt) {
      const u = lt / o.life, a = (u < 0.3 ? EASE.out(u / 0.3) : 1 - EASE.inOut((u - 0.3) / 0.7)) * o.alpha;
      if (a <= 0) return;
      c.save();
      c.globalAlpha = a;
      c.translate(o.at[0], o.at[1]);
      c.scale(1, 0.4);
      const g = c.createRadialGradient(0, 0, 0, 0, 0, o.r);
      g.addColorStop(0, `rgba(${o.color},.9)`);
      g.addColorStop(0.5, `rgba(${o.color},.35)`);
      g.addColorStop(1, `rgba(${o.color},0)`);
      c.fillStyle = g;
      c.beginPath();
      c.arc(0, 0, o.r, 0, TAU);
      c.fill();
      c.restore();
    },
  };
}
function twinkle(o: { t0: number; life: number; at: Point; size: number; color: string; star?: boolean; rot?: number }): Item {
  return {
    t0: o.t0,
    life: o.life,
    layer: 3,
    draw(c, lt) {
      const s = Math.sin(Math.PI * (lt / o.life)) * o.size;
      if (s <= 0.1) return;
      c.save();
      c.translate(o.at[0], o.at[1]);
      c.rotate(o.rot ?? 0);
      c.fillStyle = o.color;
      if (o.star) starPath(c, 0, 0, s, s * 0.45, 5);
      else {
        c.beginPath();
        c.moveTo(0, -s);
        c.quadraticCurveTo(s * 0.14, -s * 0.14, s, 0);
        c.quadraticCurveTo(s * 0.14, s * 0.14, 0, s);
        c.quadraticCurveTo(-s * 0.14, s * 0.14, -s, 0);
        c.quadraticCurveTo(-s * 0.14, -s * 0.14, 0, -s);
      }
      c.fill();
      c.restore();
    },
  };
}
/** Kontürlü küçük çokgen (kırık / konfeti). */
function polygon(R: () => number, color: string, corners: number): (c: Ctx, size: number) => void {
  const base = R() * TAU;
  const pts = Array.from({ length: corners }, (_, i) => {
    const a = base + (i * TAU) / corners + (R() - 0.5) * 0.8, r = 0.55 + R() * 0.45;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });
  return (c, size) => {
    const s = size / 2;
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x * s, y * s) : c.moveTo(x * s, y * s)));
    c.closePath();
    const g = c.createLinearGradient(0, -s, 0, s);
    g.addColorStop(0, shade(color, 0.35));
    g.addColorStop(1, color);
    c.fillStyle = g;
    c.fill();
    c.lineJoin = "round";
    c.lineWidth = Math.max(1.2, size * 0.11);
    c.strokeStyle = shade(color, -0.42);
    c.stroke();
    c.strokeStyle = "rgba(255,255,255,.7)";
    c.lineWidth = Math.max(0.8, size * 0.06);
    c.beginPath();
    c.moveTo(pts[0][0] * s * 0.55, pts[0][1] * s * 0.55);
    c.lineTo(pts[1][0] * s * 0.55, pts[1][1] * s * 0.55);
    c.stroke();
  };
}
const PASTEL = ["#ff7ab6", "#7aa8ff", "#58d68d", "#ffd23a", "#b78bff"];

/* ------------------------------------------------------------------ altı efekt (S = kutu kenarı, px) */

/** `O` = çıkış noktası, `dir` = açılma yönü (1 = sola, Telegram'daki gibi; -1 = sağa, solda yer yokken). */
type Build = (S: number, R: () => number, sp: Sprites, O: Point, dir: number) => ReactionEffect;
const word = (sp: Sprites, text: string, color: string) => sp.words.get(text + color);

const EFFECTS: Record<ReactionKey, Build> = {
  // Sekiz renkte parlak kalpler halka halka dağılır, bazıları kendi ekseninde döner.
  love(S, R, sp, O, dir) {
    const items = layout(R, S, O, dir, 20, 0.15, 0.15).map((p, i) => {
      const t0 = 0.02 + i * 0.05 + R() * 0.05;
      return sticker({
        t0, life: Math.min(2.75 - t0, lerp(1.4, 1.9, R())), from: [O[0] + (R() - 0.5) * S * 0.05, O[1] + (R() - 0.5) * S * 0.05], to: p, fly: lerp(0.55, 0.8, R()),
        size: S * lerp(0.085, 0.16, R()), img: sp.heart[Math.floor(R() * sp.heart.length)], rot0: (R() - 0.5) * 1.2, rot1: (R() - 0.5) * 0.5,
        wobble: 0.12, wobbleF: lerp(2.5, 4, R()), phase: R() * TAU, vx: (R() - 0.5) * S * 0.05, vy: -S * lerp(0.04, 0.1, R()), sway: S * 0.012, flipX: R() < 0.5 ? lerp(3, 5, R()) : 0, pop: 0.3, end: 0.32,
      });
    });
    return { duration: 2.8, items };
  },
  // Kıvılcımlar, yerinde titreyen çizgi film alevleri, altlarında sıcak hale, kopan küçük alevler ve duman.
  fire(S, R, sp, O, dir) {
    const items: Item[] = [];
    layout(R, S, O, dir, 8, 0.2, 0.2).forEach((p, i) => {
      const h = S * lerp(0.2, 0.32, R()), base = Math.max(p[1] + h * 0.5, S * 0.42), t0 = 0.15 + i * 0.09 + R() * 0.06, life = Math.min(2.85 - t0, lerp(1.5, 2.0, R()));
      items.push(sticker({ layer: 1, t0, life, from: [p[0], base], size: h, frames: sp.flames[Math.floor(R() * 3)], fps: 11, frame0: Math.floor(R() * 6), anchorBottom: true, pop: 0.32, end: 0.42, wobble: 0.05, wobbleF: 5, phase: R() * TAU, sway: S * 0.006, swayF: 6 }));
      items.push(glow({ t0: t0 + 0.25, life: Math.min(2.88 - t0 - 0.25, life + 0.2), at: [p[0], base - h * 0.05], r: h * 0.8, color: "255,84,40", alpha: 0.55 }));
      for (let k = 0; k < 2; k++) {
        items.push(sticker({ t0: t0 + lerp(0.45, life - 0.45, R()), life: 0.6, from: [p[0] + (R() - 0.5) * h * 0.3, base - h * 0.7], to: [p[0] + (R() - 0.5) * h * 0.5, base - h * 1.15], fly: 0.6, ease: "out", size: h * 0.2, img: sp.drop, pop: 0.12, end: 0.4, rot0: (R() - 0.5) * 0.7 }));
      }
    });
    for (let i = 0; i < 16; i++) {
      const a = -Math.PI / 2 + (R() - 0.5) * Math.PI * 1.7, d = S * lerp(0.12, 0.34, R());
      items.push(sticker({ layer: 3, t0: R() * 0.18, life: lerp(0.6, 0.95, R()), from: O, to: [O[0] + Math.cos(a) * d, O[1] + Math.sin(a) * d], fly: 0.5, size: S * lerp(0.022, 0.042, R()), img: sp.ember, pop: 0.08, end: 0.35, vy: S * 0.05 }));
    }
    for (let j = 0; j < 4; j++) {
      items.push(sticker({ layer: 0.5, t0: 0.08 + j * 0.13, life: lerp(1.3, 1.7, R()), from: [O[0] + (R() - 0.5) * S * 0.06, O[1] - S * 0.04], to: [O[0] - dir * S * lerp(0.08, 0.42, R()), O[1] - S * lerp(0.18, 0.36, R())], fly: 1.3, size: S * lerp(0.09, 0.13, R()), img: sp.smoke[j % 3], grow: 0.45, pop: 0.25, end: 0, fade: 0.5, alpha: 0.92, rot0: (R() - 0.5) * 0.4 }));
    }
    return { duration: 2.9, items };
  },
  // Şok halkası ve çizgileri, "!" / "?!" patlama balonları, uçuşan altın kırıklar.
  wow(S, R, sp, O, dir) {
    const A: Point = [O[0] - dir * S * 0.44, O[1] - S * 0.17], B: Point = [O[0] - dir * S * 0.32, O[1] + S * 0.27];
    const items: Item[] = [
      ring({ t0: 0, life: 0.55, at: O, r0: S * 0.05, r1: S * 0.27, width: S * 0.022, color: "#ffb020" }),
      ring({ t0: 0.09, life: 0.55, at: O, r0: S * 0.05, r1: S * 0.33, width: S * 0.014, color: "#ff5a3c" }),
    ];
    for (let i = 0; i < 12; i++) items.push(dash({ t0: 0.02, life: 0.45, at: O, angle: (i / 12) * TAU + R() * 0.2, r0: S * 0.09, r1: S * 0.36, length: S * 0.07, width: S * 0.016, color: i % 2 ? "#ffb020" : "#ff6a3c" }));
    items.push(
      sticker({ layer: 1, t0: 0.1, life: 1.9, from: A, size: S * 0.46, img: sp.burst, pop: 0.32, end: 0.3, rot0: -0.2, spin: 0.25, pulse: 0.035, pulseF: 9 }),
      sticker({ t0: 0.18, life: 1.82, from: A, size: S * 0.24, img: word(sp, "!", "#ff3b30"), pop: 0.35, end: 0.3, wobble: 0.14, wobbleF: 7, rot0: -0.15 }),
      sticker({ layer: 1, t0: 0.32, life: 1.6, from: B, size: S * 0.3, img: sp.burst2, pop: 0.3, end: 0.3, rot0: 0.3, spin: -0.3, pulse: 0.035, pulseF: 9 }),
      sticker({ t0: 0.4, life: 1.52, from: B, size: S * 0.15, img: word(sp, "?!", "#ffcf1f"), pop: 0.35, end: 0.3, wobble: 0.16, wobbleF: 6, rot0: 0.12 }),
    );
    const shards = ["#ffd21f", "#ffb000", "#ff8a00", "#ffc93a"];
    for (const p of layout(R, S, O, dir, 14, 0.09, 0.14, [[A[0], A[1], S * 0.2], [B[0], B[1], S * 0.14]])) {
      items.push(sticker({ layer: 3, t0: R() * 0.12, life: lerp(1.3, 1.9, R()), from: O, to: p, fly: 0.45, size: S * lerp(0.05, 0.09, R()), paint: polygon(R, shards[Math.floor(R() * 4)], R() < 0.5 ? 3 : 4), rot1: (R() - 0.5) * 5, spin: (R() - 0.5) * 1.5, vy: S * 0.02, gravity: S * 0.3, pop: 0.1, end: 0.3 }));
    }
    for (let k = 0; k < 8; k++) items.push(twinkle({ t0: lerp(0.3, 1.4, R()), life: 0.6, at: [lerp(S * 0.1, S * 0.9, R()), lerp(S * 0.1, S * 0.9, R())], size: S * lerp(0.03, 0.05, R()), color: ["#ffb020", "#ff5a3c", "#2f5bea"][k % 3], rot: R() }));
    return { duration: 2.7, items };
  },
  // Çırpan mini eller, iki "BRAVO" balonu, pastel konfeti.
  clap(S, R, sp, O, dir) {
    const W1: Point = [O[0] - dir * S * 0.45, O[1] - S * 0.3], W2: Point = [O[0] - dir * S * 0.36, O[1] + S * 0.3], items: Item[] = [];
    for (const [at, t0, rot, text, color] of [[W1, 0.3, -0.18, "BRAVO", "#19c3e6"], [W2, 0.62, 0.14, "BRAVO!", "#a855f7"]] as [Point, number, number, string, string][]) {
      items.push(sticker({ layer: 3, t0, life: 1.7, from: at, size: S * 0.15, img: word(sp, text, color), pop: 0.38, end: 0.3, rot0: rot, wobble: 0.07, wobbleF: 5, vy: -S * 0.03 }));
    }
    layout(R, S, O, dir, 7, 0.2, 0.2, [[W1[0], W1[1], S * 0.18], [W2[0], W2[1], S * 0.16]]).forEach((p, i) => {
      const t0 = 0.04 + i * 0.1;
      items.push(sticker({ t0, life: Math.min(2.75 - t0, lerp(1.6, 2.0, R())), from: O, to: p, fly: 0.45, size: S * lerp(0.16, 0.24, R()), frames: sp.clap, fps: 6.5, frame0: Math.floor(R() * 2), rot0: (R() - 0.5) * 0.8, rot1: (R() - 0.5) * 0.3, wobble: 0.06, wobbleF: 6, phase: R() * TAU, vy: -S * 0.03, pop: 0.3, end: 0.3 }));
    });
    const confetti = ["#ff9fbf", "#a99bff", "#7fe0b5", "#ffd66b", "#8fcbff", "#ffb07a"];
    for (const p of layout(R, S, O, dir, 18, 0.08, 0.1)) {
      items.push(sticker({ layer: 1, t0: R() * 0.3, life: lerp(1.4, 2.1, R()), from: O, to: p, fly: 0.5, size: S * lerp(0.04, 0.06, R()), paint: polygon(R, confetti[Math.floor(R() * confetti.length)], 3), rot0: R() * TAU, spin: (R() - 0.5) * 4, flipY: lerp(5, 9, R()), phase: R() * TAU, gravity: S * 0.15, vx: (R() - 0.5) * S * 0.05, pop: 0.1, end: 0.3 }));
    }
    return { duration: 2.8, items };
  },
  // Sallanarak gülen mini yüzler, kelime balonları, sıçrayan gözyaşları.
  haha(S, R, sp, O, dir) {
    const items: Item[] = [];
    const words: [string, string][] = [["HAHA", "#19c3e6"], ["HA", "#ff7a1a"], ["HEHE", "#ff4fa0"], ["LOL", "#22c55e"], ["HAHA!", "#2f6bff"]];
    const spots = layout(R, S, O, dir, 5, 0.26, 0.22);
    spots.forEach((p, i) => {
      const [text, color] = words[i % words.length];
      items.push(sticker({ layer: 3, t0: 0.15 + i * 0.2, life: lerp(1.4, 1.7, R()), from: O, to: p, fly: 0.45, size: S * lerp(0.11, 0.14, R()), img: word(sp, text, color), rot0: (R() - 0.5) * 0.7, rot1: (R() - 0.5) * 0.5, wobble: 0.06, wobbleF: 5, phase: R() * TAU, vy: -S * 0.05, pop: 0.35, end: 0.28 }));
    });
    layout(R, S, O, dir, 8, 0.17, 0.18, spots.map(([x, y]) => [x, y, S * 0.13])).forEach((p, i) => {
      const t0 = 0.03 + i * 0.09;
      items.push(sticker({ t0, life: Math.min(2.75 - t0, lerp(1.5, 2.0, R())), from: O, to: p, fly: 0.5, size: S * lerp(0.13, 0.21, R()), frames: sp.haha, fps: 7, frame0: Math.floor(R() * 2), rot0: R() - 0.5, rot1: (R() - 0.5) * 0.3, wobble: 0.22, wobbleF: 10, phase: R() * TAU, vy: -S * 0.04, pulse: 0.04, pulseF: 18, pop: 0.3, end: 0.3 }));
    });
    for (let k = 0; k < 10; k++) {
      const side = R() < 0.5 ? -1 : 1;
      items.push(sticker({ layer: 1, t0: lerp(0.05, 1.1, R()), life: 0.85, from: [O[0] + side * S * 0.04, O[1] - S * 0.03], to: [O[0] + (side < 0 ? -1 : 0.4) * dir * S * lerp(0.08, 0.35, R()), O[1] - S * lerp(0.06, 0.22, R())], fly: 0.35, ease: "out", size: S * lerp(0.035, 0.05, R()), img: sp.tear, gravity: S * 1.1, pop: 0.1, end: 0.2 }));
    }
    return { duration: 2.8, items };
  },
  // Ampulün ışığı, kuyruklu altın yıldızlar; her yıldız yıldız halkası ve renkli tozla patlar.
  idea(S, R, sp, O, dir) {
    const items: Item[] = [];
    for (let i = 0; i < 8; i++) items.push(dash({ t0: 0, life: 0.5, at: O, angle: -Math.PI + (i / 7) * Math.PI, r0: S * 0.08, r1: S * 0.22, length: S * 0.07, width: S * 0.02, color: "#ffbf1f" }));
    layout(R, S, O, dir, 8, 0.2, 0.22).forEach((p, i) => {
      const t0 = 0.04 + i * 0.08, fly = lerp(0.5, 0.7, R()), size = S * lerp(0.11, 0.18, R()), burstAt = t0 + fly + lerp(0.3, 0.65, R());
      items.push(sticker({ t0, life: burstAt - t0 + 0.16, from: O, to: p, fly, size, img: sp.star, rot0: (R() - 0.5) * 2, rot1: (R() - 0.5) * 0.4, trail: true, pulse: 0.05, pulseF: 7, phase: R() * TAU, pop: 0.25, end: 0.16 }));
      items.push(ring({ layer: 1, t0: burstAt - 0.02, life: 0.5, at: p, r0: size * 0.4, r1: size * 0.95, width: size * 0.08, color: "#ffc933", star: true, rot: (R() - 0.5) * 0.6 }));
      for (let k = 0; k < 6; k++) {
        const b = (k / 6) * TAU + R() * 0.5, d = size * lerp(0.8, 1.2, R()), color = PASTEL[k % PASTEL.length];
        items.push(sticker({ layer: 3, t0: burstAt, life: 0.55, from: p, to: [p[0] + Math.cos(b) * d, p[1] + Math.sin(b) * d], fly: 0.45, size: S * 0.035, paint: (c, s) => { starPath(c, 0, 0, s / 2, s / 4.4, 5); c.fillStyle = color; c.fill(); }, pop: 0.08, end: 0.25 }));
      }
    });
    for (let j = 0; j < 16; j++) items.push(twinkle({ t0: lerp(1.2, 2.2, R()), life: 0.6, at: [lerp(S * 0.08, S * 0.92, R()), lerp(S * 0.08, S * 0.92, R())], size: S * lerp(0.014, 0.026, R()), star: true, color: PASTEL[j % PASTEL.length] }));
    return { duration: 2.9, items };
  },
};

/** Çıkış noktasının kutudaki yatay yeri: sola açılırken %78, aynalıyken (sağa açılırken) %22. */
export function effectOriginX(mirrored: boolean): number {
  return mirrored ? 1 - EFFECT_ORIGIN_X : EFFECT_ORIGIN_X;
}

/** Bir efektin tüm parçacıkları (aynı tohum → aynı dağılım). `mirrored` = sağa açılır (yazılar ters dönmez, yerleşim aynalanır). Çıkartmalar hazır değilse `null`. */
export function buildReactionEffect(key: ReactionKey, size: number, seed: number, mirrored = false): ReactionEffect | null {
  if (!sprites) return null;
  const effect = EFFECTS[key](size, seeded(seed), sprites, [size * effectOriginX(mirrored), size * EFFECT_ORIGIN_Y], mirrored ? -1 : 1);
  effect.items.sort((a, b) => a.layer - b.layer);
  return effect;
}

/** `t` anının karesi (çağıran tuvali temizler). */
export function drawReactionEffect(effect: ReactionEffect, c: Ctx, t: number): void {
  for (const item of effect.items) {
    const lt = t - item.t0;
    if (lt >= 0 && lt <= item.life) item.draw(c, lt);
  }
}
