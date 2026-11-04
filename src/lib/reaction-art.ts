import type { ReactionKey } from "./reactions.ts";

/*
 * Promptly'nin kendi tepki emojileri (docs/history/334-*): altı emoji SVG olarak burada çizilir ve canlandırılır. Telegram'ın hareketli emoji
 * dosyalarının (TGS + lottie-web) yerini alır; görsel dil aynıdır (kalın koyu kontür, katmanlı ışık, beyaz parlama), çizimler bize aittir.
 *
 * Saf modül (DOM yok): `markup(önek, poz)` SVG'nin içini, `pose(t)` o anın öznitelik değerlerini verir. Oynatıcı (`reaction-player.ts`) her karede
 * `pose(t)`'yi `data-r` öğelerine yazar; statik poster (`public/reactions/<tepki>.svg`) `reactionSvg(…, dinlenme)` ile üretilir
 * (`scripts/build-reaction-posters.mjs`). Her emojinin `pose(0)` ve `pose(duration)` değeri dinlenme karesidir — oynatma başında/sonunda sıçrama olmaz.
 */

export type PoseAttrs = Record<string, Record<string, string>>;

export interface ReactionArt {
  /** Emoji animasyonunun süresi (sn). */
  duration: number;
  markup(prefix: string, pose: PoseAttrs): string;
  pose(t: number): PoseAttrs;
}

type Ease = "lin" | "inOut" | "out" | "outQuart" | "in" | "outBack";
export const EASE: Record<Ease, (u: number) => number> = {
  lin: (u) => u,
  inOut: (u) => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2),
  out: (u) => 1 - Math.pow(1 - u, 3),
  outQuart: (u) => 1 - Math.pow(1 - u, 4),
  in: (u) => u * u * u,
  outBack: (u) => {
    const c1 = 1.9;
    return 1 + (c1 + 1) * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
  },
};

type Key = [number, number] | [number, number, Ease];
/** Anahtar kare: eğri, o anahtara giden parçaya uygulanır (varsayılan `inOut`). */
export function keyframes(t: number, keys: Key[]): number {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    const b = keys[i];
    if (t <= b[0]) {
      const a = keys[i - 1];
      return a[1] + (b[1] - a[1]) * EASE[b[2] ?? "inOut"]((t - a[0]) / (b[0] - a[0]));
    }
  }
  return keys[keys.length - 1][1];
}

const TAU = Math.PI * 2;
const r2 = (n: number) => String(Math.round(n * 100) / 100);
const r4 = (n: number) => String(Math.round(n * 10000) / 10000);
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
/** `(px, py)` etrafında dönüşüm. */
const around = (px: number, py: number, inner: string) => `translate(${px} ${py}) ${inner} translate(${-px} ${-py})`;

/** `data-r` + o anki öznitelikler (markup içinde). */
function at(pose: PoseAttrs, ref: string): string {
  let out = ` data-r="${ref}"`;
  for (const [name, value] of Object.entries(pose[ref] ?? {})) out += ` ${name}="${value}"`;
  return out;
}

/* ------------------------------------------------------------------ ortak şekiller */

export const HEART_PATH = "M50 90C44 85 10 62 10 35C10 21 21 11 33 11C41 11 47 15 50 21C53 15 59 11 67 11C79 11 90 21 90 35C90 62 56 85 50 90Z";
export const TEAR_PATH = "M0 -11C5 -4 8 1 8 4.5A8 8 0 0 1 -8 4.5C-8 1 -5 -4 0 -11Z";
export const DROPLET_PATH = "M0 -8C3 -3.5 4.6 -.5 4.6 2A4.6 4.6 0 0 1 -4.6 2C-4.6 -.5 -3 -3.5 0 -8Z";
const GLASS_PATH = "M50 6C30 6 18 20 18 37C18 50 26 57 31 64C34 68 35 71 35 75L65 75C65 71 66 68 69 64C74 57 82 50 82 37C82 20 70 6 50 6Z";

/** Alev silueti: kontrol noktaları; `FLAME_TIPS` uçların sivriliği (1 = sivri). */
const FLAME_POINTS: [number, number][] = [
  [50, 94], [29, 92], [15, 79], [13, 63], [18, 48], [22, 30], [30, 42], [37, 25], [50, 5],
  [60, 24], [66, 34], [77, 21], [80, 40], [87, 52], [88, 70], [81, 86], [68, 93],
];
const FLAME_TIPS = [0, 0, 0, 0, 0, 1, 0, 0.6, 1, 0.6, 0, 1, 0, 0.55, 0, 0, 0];

/** Noktalardan geçen kapalı, yumuşak eğri (Catmull-Rom → kübik Bézier); uçlarda teğet kısalır, köşe sivri kalır. */
function smoothClosed(points: [number, number][], tips: number[]): string {
  const n = points.length;
  let d = `M${r2(points[0][0])} ${r2(points[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = points[(i - 1 + n) % n], p1 = points[i], p2 = points[(i + 1) % n], p3 = points[(i + 2) % n];
    const k1 = (1 - (tips[i] ?? 0) * 0.85) / 6, k2 = (1 - (tips[(i + 1) % n] ?? 0) * 0.85) / 6;
    d += `C${r2(p1[0] + (p2[0] - p0[0]) * k1)} ${r2(p1[1] + (p2[1] - p0[1]) * k1)} ${r2(p2[0] - (p3[0] - p1[0]) * k2)} ${r2(p2[1] - (p3[1] - p1[1]) * k2)} ${r2(p2[0])} ${r2(p2[1])}`;
  }
  return d + "Z";
}

/** Bir alev katmanı: `scale` tabana (50, 94) doğru küçültür; `k` titreme genliği (0 = dinlenme silueti). */
export function flamePath(scale: number, t: number, k: number, seed: number): string {
  const pts = FLAME_POINTS.map(([x, y], i): [number, number] => {
    let X = 50 + (x - 50) * scale, Y = 94 + (y - 94) * scale;
    const h = Math.max(0, (94 - Y) / 90), ph = i * 1.7 + seed;
    X += k * h * (3.2 * Math.sin(t * 7.3 + ph) + 1.4 * Math.sin(t * 13.1 + ph * 2.1));
    Y += k * h * (2.2 * Math.sin(t * 9.1 + ph * 1.3)) - k * h * h * 1.6 * (0.5 + 0.5 * Math.sin(t * 11 + ph));
    return [X, Y];
  });
  return smoothClosed(pts, FLAME_TIPS);
}

function faceDefs(p: string): string {
  return (
    `<radialGradient id="${p}f" cx=".44" cy=".34" r=".72"><stop offset="0" stop-color="#fff6a8"/><stop offset=".45" stop-color="#ffda3d"/><stop offset=".86" stop-color="#ffb41c"/><stop offset="1" stop-color="#ff9f0c"/></radialGradient>` +
    `<radialGradient id="${p}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>`
  );
}

/** Bir el (bilek 0,0'da, parmaklar yukarı): başparmak, dört parmak, avuç (avuç parmak diplerini örter, kontür yalnız yanlarda/altta). */
function hand(p: string, front: boolean): string {
  const fill = `url(#${p}${front ? "hf" : "hb"})`, stroke = front ? "#d98200" : "#c86e00";
  let s = `<rect x="-4.6" y="-19" width="9.2" height="19" rx="4.6" transform="translate(-12.5 -11) rotate(-22)" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  for (const [x, top] of [[-10.4, -46], [-3.5, -51], [3.4, -49], [10.2, -42]]) {
    s += `<rect x="${r2(x - 4.4)}" y="${top}" width="8.8" height="${-top - 20}" rx="4.4" fill="${fill}" stroke="${stroke}" stroke-width="2"/>`;
  }
  const palm = "M-15 -31C-16 -15 -13 -5 -7 0L9 0C14 -5 16 -15 15 -31";
  s += `<path d="${palm}Z" fill="${fill}"/><path d="${palm}" fill="none" stroke="${stroke}" stroke-width="2" stroke-linejoin="round"/>`;
  s += `<path d="M-10 -22Q0 -18.5 10 -21" stroke="${stroke}" stroke-opacity=".35" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  s += `<path d="M-6.4 -44V-36M.5 -49V-41" stroke="#fff" stroke-opacity=".55" stroke-width="1.6" stroke-linecap="round"/>`;
  return s;
}

/* ------------------------------------------------------------------ altı emoji */

const love: ReactionArt = {
  duration: 2.7,
  markup: (p, a) =>
    `<defs><linearGradient id="${p}rim" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff4a5c"/><stop offset="1" stop-color="#c50d25"/></linearGradient>` +
    `<radialGradient id="${p}b" cx=".42" cy=".28" r=".85"><stop offset="0" stop-color="#ff8080"/><stop offset=".45" stop-color="#ff2e33"/><stop offset="1" stop-color="#e8121f"/></radialGradient>` +
    `<linearGradient id="${p}gl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>` +
    `<g${at(a, "g")}><path d="${HEART_PATH}" fill="url(#${p}rim)" stroke="#8e0618" stroke-width="2.6" stroke-linejoin="round"/>` +
    `<path d="${HEART_PATH}" transform="translate(50 47) scale(.85 .83) translate(-50 -47)" fill="url(#${p}b)"/>` +
    `<g${at(a, "gloss")}><ellipse cx="33" cy="25" rx="13" ry="6.5" transform="rotate(-24 33 25)" fill="url(#${p}gl)"/><ellipse cx="67" cy="25" rx="12" ry="6" transform="rotate(24 67 25)" fill="url(#${p}gl)" opacity=".7"/></g>` +
    `<path${at(a, "crease")} d="M50 21C53 28 55 33 55.5 40" stroke="#a10b1f" stroke-width="2.4" stroke-linecap="round" fill="none"/>` +
    `<g${at(a, "glint")}><path d="M69 17.5q5.5 1 8.6 5.6" stroke="#fff" stroke-width="2.6" stroke-linecap="round" fill="none"/><circle cx="80.4" cy="27.3" r="1.6" fill="#fff"/></g></g>`,
  pose(t) {
    // Kendi ekseninde dönüş (genişlik cos açı) + başta ve sonda kalp atışı.
    const th = (keyframes(t, [[0, 0], [0.28, 0], [0.95, 64], [1.25, 64], [1.95, -12], [2.25, 0]]) * Math.PI) / 180;
    const beat = keyframes(t, [[0, 1], [0.1, 1.12, "out"], [0.24, 0.95], [0.36, 1], [2.25, 1], [2.36, 1.09, "out"], [2.47, 0.98], [2.56, 1.05, "out"], [2.7, 1]]);
    const s = Math.sin(th);
    return {
      g: { transform: around(50, 50, `skewY(${r2(s * 6)}) scale(${r4(Math.cos(th) * beat)} ${r4(beat)})`) },
      glint: { transform: `translate(${r2(-s * 14)} 0)`, opacity: r4(1 - Math.abs(s) * 0.75) },
      gloss: { transform: `translate(${r2(-s * 8)} 0)` },
      crease: { opacity: r4(Math.max(0, s)), transform: `translate(${r2(s * 6)} 0)` },
    };
  },
};

const FIRE_DROPS: [number, number, number, number][] = [[0.38, 50, 6, -2], [0.95, 23, 30, -6], [1.5, 77, 22, 5]];
const fire: ReactionArt = {
  duration: 2.6,
  markup: (p, a) =>
    `<defs><linearGradient id="${p}o" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff3b1a"/><stop offset=".7" stop-color="#ff4d1a"/><stop offset="1" stop-color="#ff6a1f"/></linearGradient>` +
    `<linearGradient id="${p}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a1a"/><stop offset="1" stop-color="#ffa83a"/></linearGradient>` +
    `<linearGradient id="${p}i" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffc53a"/><stop offset="1" stop-color="#ffe887"/></linearGradient>` +
    `<radialGradient id="${p}c" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fffdf0"/><stop offset=".55" stop-color="#fff6c8" stop-opacity=".85"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></radialGradient></defs>` +
    `<g${at(a, "g")}><path${at(a, "o")} fill="url(#${p}o)" stroke="#b5180b" stroke-width="2.6" stroke-linejoin="round"/><path${at(a, "m")} fill="url(#${p}m)"/><path${at(a, "i")} fill="url(#${p}i)"/>` +
    `<ellipse${at(a, "c")} cx="50" cy="83" rx="16" ry="11" fill="url(#${p}c)"/></g>` +
    FIRE_DROPS.map((_, j) => `<path${at(a, `d${j}`)} d="${DROPLET_PATH}" fill="#ff5a1a" stroke="#b5180b" stroke-width="1.6" stroke-linejoin="round"/>`).join(""),
  pose(t) {
    // Çömelip sıçrayan, üç katı ayrı titreyen alev; uçlardan kopan küçük alevler.
    const k = keyframes(t, [[0, 0], [0.15, 1.7, "out"], [1.2, 1.25], [2.1, 0.5], [2.6, 0]]);
    const sy = keyframes(t, [[0, 1], [0.16, 0.84, "out"], [0.42, 1.14, "out"], [0.7, 0.97], [0.9, 1.02], [1.1, 1]]), sx = 1 + (1 - sy) * 0.6;
    const out: PoseAttrs = {
      g: { transform: around(50, 94, `scale(${r4(sx)} ${r4(sy)})`) },
      o: { d: flamePath(1, t, k, 0) },
      m: { d: flamePath(0.76, t, k * 1.1, 2.3) },
      i: { d: flamePath(0.5, t, k * 1.2, 4.1) },
      c: { opacity: r4(0.88 + (0.12 * Math.sin(t * 12) * k) / 1.7) },
    };
    FIRE_DROPS.forEach(([start, x0, y0, dx], j) => {
      const u = (t - start) / 0.62;
      if (u < 0 || u > 1) {
        out[`d${j}`] = { opacity: "0", transform: `translate(${x0} ${y0})` };
        return;
      }
      const x = x0 + dx * u + Math.sin(u * 9) * 1.2, y = y0 - u * 16;
      out[`d${j}`] = { opacity: r4(u < 0.15 ? u / 0.15 : 1 - EASE.in(u)), transform: `translate(${r2(x)} ${r2(y)}) scale(${r4(1 - u * 0.75)})` };
    });
    return out;
  },
};

const wow: ReactionArt = {
  duration: 2.3,
  markup: (p, a) =>
    `<defs>${faceDefs(p)}<radialGradient id="${p}m" cx=".5" cy=".35" r=".7"><stop offset="0" stop-color="#8a3d00"/><stop offset="1" stop-color="#4f1f00"/></radialGradient>` +
    `<linearGradient id="${p}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e6f8ff"/><stop offset="1" stop-color="#5cc4f6"/></linearGradient></defs>` +
    `<g${at(a, "lines")} stroke="#ff9000" stroke-width="3.4" stroke-linecap="round" fill="none"><path d="M50 1.5V8.5M29.5 6.5L33.5 12.5M70.5 6.5L66.5 12.5"/></g>` +
    `<g${at(a, "g")}><circle cx="50" cy="54" r="40" fill="url(#${p}f)" stroke="#e57c00" stroke-width="2.6"/><ellipse cx="41" cy="30" rx="19" ry="9.5" fill="url(#${p}h)"/>` +
    `<path${at(a, "bl")} d="M27 34Q35 27 43 31" stroke="#7a3a00" stroke-width="3.6" stroke-linecap="round" fill="none"/>` +
    `<path${at(a, "br")} d="M57 31Q65 27 73 34" stroke="#7a3a00" stroke-width="3.6" stroke-linecap="round" fill="none"/>` +
    `<g${at(a, "el")}><ellipse cx="37" cy="48" rx="5.6" ry="7.4" fill="#6b3200"/><circle cx="35.3" cy="45.2" r="1.8" fill="#fff" opacity=".92"/></g>` +
    `<g${at(a, "er")}><ellipse cx="63" cy="48" rx="5.6" ry="7.4" fill="#6b3200"/><circle cx="61.3" cy="45.2" r="1.8" fill="#fff" opacity=".92"/></g>` +
    `<g${at(a, "m")}><ellipse cx="50" cy="72" rx="7.5" ry="8.6" fill="url(#${p}m)"/><ellipse cx="50" cy="77" rx="4.6" ry="2.6" fill="#d9574a" opacity=".9"/></g>` +
    `<g${at(a, "sw")}><path d="${DROPLET_PATH}" transform="translate(79 36) scale(1.15)" fill="url(#${p}s)" stroke="#2a8fd8" stroke-width="1.4"/></g></g>`,
  pose(t) {
    // Çöküp zıplar; gözler ve ağız büyür, kaşlar kalkar, şok çizgileri + titreme + ter damlası.
    const sy = keyframes(t, [[0, 1], [0.16, 0.9, "out"], [0.4, 1.1, "out"], [0.62, 0.97], [0.82, 1]]);
    const sx = keyframes(t, [[0, 1], [0.16, 1.07, "out"], [0.4, 0.94, "out"], [0.62, 1.02], [0.82, 1]]);
    const ty = keyframes(t, [[0, 0], [0.16, 3, "out"], [0.4, -7, "out"], [0.62, 1], [0.82, 0]]);
    const jx = t > 0.45 && t < 1.6 ? Math.sin(t * 72) * 0.8 * (1 - (t - 0.45) / 1.15) : 0;
    const e = keyframes(t, [[0, 1], [0.18, 0.82, "out"], [0.42, 1.45, "out"], [0.7, 1.3], [1.6, 1.3], [2.05, 1]]);
    const m = keyframes(t, [[0, 1], [0.18, 0.7, "out"], [0.42, 1.45, "outBack"], [0.7, 1.3], [1.6, 1.3], [2.05, 1]]);
    const by = keyframes(t, [[0, 0], [0.18, 2], [0.42, -6, "outBack"], [1.6, -5], [2.05, 0]]);
    const lineScale = keyframes(t, [[0, 0.6], [0.36, 0.6], [0.56, 1, "outBack"], [1.85, 1], [1.9, 0.6]]);
    return {
      g: { transform: `translate(${r2(jx)} ${r2(ty)}) ${around(50, 94, `scale(${r4(sx)} ${r4(sy)})`)}` },
      el: { transform: around(37, 48, `scale(${r4(e * 0.9 + 0.1)} ${r4(e)})`) },
      er: { transform: around(63, 48, `scale(${r4(e * 0.9 + 0.1)} ${r4(e)})`) },
      m: { transform: around(50, 72, `scale(${r4(m * 0.85 + 0.15)} ${r4(m)})`) },
      bl: { transform: `translate(0 ${r2(by)}) ${around(35, 31, `rotate(${r2(by * 1.3)})`)}` },
      br: { transform: `translate(0 ${r2(by)}) ${around(65, 31, `rotate(${r2(-by * 1.3)})`)}` },
      lines: { opacity: r4(keyframes(t, [[0, 0], [0.36, 0], [0.48, 1, "out"], [1.45, 1], [1.85, 0]])), transform: around(50, 12, `scale(${r4(lineScale)})`) },
      sw: { opacity: r4(keyframes(t, [[0, 0], [0.7, 0], [0.85, 1], [1.7, 1], [2.0, 0]])), transform: `translate(0 ${r2(keyframes(t, [[0, 0], [0.8, 0], [1.95, 13], [2.05, 13], [2.1, 0]]))})` },
    };
  },
};

const CLAPS = [0.06, 0.46, 0.86];
const clap: ReactionArt = {
  duration: 1.6,
  markup: (p, a) =>
    `<defs><linearGradient id="${p}hf" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#ffe46e"/><stop offset=".55" stop-color="#ffcb2a"/><stop offset="1" stop-color="#f6ac10"/></linearGradient>` +
    `<linearGradient id="${p}hb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fbcd45"/><stop offset="1" stop-color="#eb9d0a"/></linearGradient></defs>` +
    `<g${at(a, "tk")} stroke="#ff9a1f" stroke-width="3.2" stroke-linecap="round" fill="none"><path${at(a, "tkl")} d="M22 17L27 22M17 27L24 28.5M29 9L31.5 15.5"/><path${at(a, "tkr")} d="M70 9L68.5 15.5M79 13L74.5 18.5M84 22L77.5 24"/></g>` +
    `<g${at(a, "g")}><g${at(a, "hb")}><g transform="translate(55 94) rotate(-22) scale(1.32)">${hand(p, false)}</g></g>` +
    `<g${at(a, "hf")}><g transform="translate(68 97) rotate(-13) scale(1.36)">${hand(p, true)}</g></g></g>`,
  pose(t) {
    // Üç çırpış: öndeki el açılır (bilekten döner) ve hızla kapanır; her çarpışmada kıvılcım çizgileri.
    let open = 0, impact = 0;
    for (const c of CLAPS) {
      if (t >= c && t < c + 0.2) open = Math.max(open, EASE.out((t - c) / 0.2));
      else if (t >= c + 0.2 && t < c + 0.31) open = Math.max(open, 1 - EASE.in((t - c - 0.2) / 0.11));
      const u = (t - c - 0.31) / 0.3;
      if (u >= 0 && u <= 1) impact = Math.max(impact, 1 - u);
    }
    const squash = 1 - 0.04 * impact * impact, tickScale = r4(0.7 + 0.5 * (1 - impact));
    return {
      hf: { transform: around(68, 97, `rotate(${r2(24 * open)})`) },
      hb: { transform: around(55, 94, `rotate(${r2(-9 * open)})`) },
      g: { transform: `translate(0 ${r2(-2.5 * open)}) ${around(60, 96, `scale(${r4(squash)} ${r4(2 - squash)})`)}` },
      tk: { opacity: r4(impact) },
      tkl: { transform: around(26, 21, `scale(${tickScale})`) },
      tkr: { transform: around(76, 17, `scale(${tickScale})`) },
    };
  },
};

const MOUTH_PATH = "M21 55Q50 60 79 55Q78 88 50 88Q22 88 21 55Z";
const haha: ReactionArt = {
  duration: 2.6,
  markup: (p, a) =>
    `<defs>${faceDefs(p)}<linearGradient id="${p}m" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d3600"/><stop offset="1" stop-color="#4a1d00"/></linearGradient>` +
    `<linearGradient id="${p}t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe3ea"/></linearGradient>` +
    `<radialGradient id="${p}d" cx=".4" cy=".55" r=".65"><stop offset="0" stop-color="#d9f4ff"/><stop offset=".55" stop-color="#5cc4f6"/><stop offset="1" stop-color="#2b8fe0"/></radialGradient>` +
    `<clipPath id="${p}mc"><path d="${MOUTH_PATH}"/></clipPath></defs>` +
    `<g${at(a, "g")}><circle cx="50" cy="52" r="40" fill="url(#${p}f)" stroke="#e57c00" stroke-width="2.6"/><ellipse cx="41" cy="27" rx="19" ry="9.5" fill="url(#${p}h)"/>` +
    `<path d="M23 30Q31 23 40 27M60 27Q69 23 77 30" stroke="#7a3a00" stroke-width="3.4" stroke-linecap="round" fill="none"/>` +
    `<g${at(a, "eyes")} fill="#6b3200"><path d="M24 45C27 35 40 34 44 44C40 39.5 28 39.5 24 45Z"/><path d="M56 44C60 34 73 35 76 45C72 39.5 60 39.5 56 44Z"/></g>` +
    `<g${at(a, "m")}><path d="${MOUTH_PATH}" fill="url(#${p}m)" stroke="#5a2400" stroke-width="1.6" stroke-linejoin="round"/>` +
    `<g clip-path="url(#${p}mc)"><ellipse cx="50" cy="86" rx="17" ry="9" fill="#e8585a"/><path d="M18 50H82V58Q50 66 18 58Z" fill="url(#${p}t)"/></g></g>` +
    `<g${at(a, "tl")}><path d="${TEAR_PATH}" fill="url(#${p}d)" stroke="#1f78c8" stroke-width="1.6"/><ellipse cx="-2.6" cy="2" rx="1.6" ry="2.6" fill="#fff" opacity=".85"/></g>` +
    `<g${at(a, "tr")}><path d="${TEAR_PATH}" fill="url(#${p}d)" stroke="#1f78c8" stroke-width="1.6"/><ellipse cx="-2.6" cy="2" rx="1.6" ry="2.6" fill="#fff" opacity=".85"/></g></g>`,
  pose(t) {
    // "Ha-ha" ritmi: baş sallanır, ağız ve gözler açılıp kapanır, gözyaşları şişer.
    const env = keyframes(t, [[0, 0], [0.15, 1, "out"], [2.0, 1], [2.5, 0]]);
    const beat = 0.5 + 0.5 * Math.sin(TAU * 3.6 * t);
    const rot = env * 7 * Math.sin(TAU * 1.6 * t), ty = -env * 3 * Math.abs(Math.sin(TAU * 1.8 * t));
    const tearScale = r4(1 + env * 0.35 * (0.5 + 0.5 * Math.sin(TAU * 3.6 * t + 1))), dx = env * 3;
    return {
      g: { transform: `translate(0 ${r2(ty)}) ${around(50, 90, `rotate(${r2(rot)})`)}` },
      m: { transform: around(50, 56, `scale(1 ${r4(1 - env * 0.17 * beat)})`) },
      eyes: { transform: around(50, 41, `scale(1 ${r4(1 - env * 0.22 * beat)})`) },
      tl: { transform: `translate(${r2(17 - dx)} 53) rotate(40) scale(${tearScale})` },
      tr: { transform: `translate(${r2(83 + dx)} 53) rotate(-40) scale(${tearScale})` },
    };
  },
};

const FILAMENT = "M44 61C41 50 47 44 50 50C53 44 59 50 56 61";
const RAYS = [-180, -150, -120, -90, -60, -30, 0]
  .map((deg) => {
    const c = Math.cos((deg * Math.PI) / 180), s = Math.sin((deg * Math.PI) / 180);
    return `M${r2(50 + c * 40)} ${r2(38 + s * 40)}L${r2(50 + c * 48)} ${r2(38 + s * 48)}`;
  })
  .join("");
/** Ampulün ışığı: titreyip söner, sonra yanar (1 = açık). */
function bulbOn(t: number): number {
  if (t < 0.06) return 1;
  if (t < 0.12) return 0.1;
  if (t < 0.2) return 1;
  if (t < 0.5) return 0;
  if (t < 0.58) return (t - 0.5) / 0.08;
  return 1;
}
const idea: ReactionArt = {
  duration: 1.8,
  markup: (p, a) =>
    `<defs><radialGradient id="${p}on" cx=".45" cy=".38" r=".65"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff7c2"/><stop offset=".75" stop-color="#ffe46b"/><stop offset="1" stop-color="#ffd02e"/></radialGradient>` +
    `<radialGradient id="${p}off" cx=".45" cy=".38" r=".7"><stop offset="0" stop-color="#fbfaf8"/><stop offset="1" stop-color="#d6d2cb"/></radialGradient>` +
    `<radialGradient id="${p}ha" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#ffe680" stop-opacity=".9"/><stop offset=".55" stop-color="#ffe680" stop-opacity=".35"/><stop offset="1" stop-color="#ffe680" stop-opacity="0"/></radialGradient>` +
    `<radialGradient id="${p}ig" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${p}me" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#868c95"/><stop offset=".35" stop-color="#eceef2"/><stop offset=".6" stop-color="#a9afb8"/><stop offset="1" stop-color="#6c727b"/></linearGradient></defs>` +
    `<circle${at(a, "halo")} cx="50" cy="38" r="48" fill="url(#${p}ha)"/>` +
    `<g${at(a, "rays")} stroke="#ffbf1f" stroke-width="3.2" stroke-linecap="round" fill="none"><path d="${RAYS}"/></g>` +
    `<g${at(a, "g")}><path d="${GLASS_PATH}" fill="url(#${p}on)" stroke="#e0a200" stroke-width="2.4"/>` +
    `<circle${at(a, "glow")} cx="50" cy="45" r="22" fill="url(#${p}ig)"/>` +
    `<path${at(a, "off")} d="${GLASS_PATH}" fill="url(#${p}off)" stroke="#b5afa5" stroke-width="2.4"/>` +
    `<path d="M44 75V61M56 75V61" stroke="#a99b78" stroke-width="1.6"/>` +
    `<path${at(a, "fo")} d="${FILAMENT}" stroke="#8d877c" stroke-width="2" fill="none"/>` +
    `<g${at(a, "fn")}><path d="${FILAMENT}" stroke="#ffe9a0" stroke-width="5.5" fill="none" opacity=".7" stroke-linecap="round"/><path d="${FILAMENT}" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round"/></g>` +
    `<path d="M29 31C30 23 36 16 44 13.5" stroke="#fff" stroke-width="3.2" stroke-linecap="round" fill="none" opacity=".8"/>` +
    `<rect x="35" y="75.5" width="30" height="5.5" rx="2.6" fill="url(#${p}me)" stroke="#5b616a" stroke-width="1.2"/>` +
    `<rect x="36" y="80.5" width="28" height="5.5" rx="2.6" fill="url(#${p}me)" stroke="#5b616a" stroke-width="1.2"/>` +
    `<rect x="37.5" y="85.5" width="25" height="5" rx="2.4" fill="url(#${p}me)" stroke="#5b616a" stroke-width="1.2"/>` +
    `<path d="M43 90.5H57Q56 96 50 96Q44 96 43 90.5Z" fill="#363940"/></g>`,
  pose(t) {
    const on = bulbOn(t), boost = keyframes(t, [[0, 1], [0.55, 1], [0.68, 1.6, "out"], [1.3, 1]]);
    const rot = keyframes(t, [[0, 0], [0.55, 0], [0.75, -7, "out"], [1.0, 5], [1.25, -2.5], [1.5, 0]]);
    const pop = keyframes(t, [[0, 1], [0.55, 1], [0.66, 1.07, "out"], [0.85, 1]]);
    return {
      halo: { opacity: r4(clamp(0.62 * on * boost, 0, 1)), transform: around(50, 38, `scale(${r4(1 + (boost - 1) * 0.25)})`) },
      off: { opacity: r4(1 - on) },
      fo: { opacity: r4(1 - on) },
      fn: { opacity: r4(on) },
      glow: { opacity: r4(on * Math.min(1, boost)) },
      rays: {
        opacity: r4(keyframes(t, [[0, 0], [0.56, 0], [0.68, 1, "out"], [1.15, 0]])),
        transform: around(50, 38, `scale(${r4(keyframes(t, [[0, 0.7], [0.56, 0.7], [1.15, 1.18, "out"], [1.2, 1.18], [1.25, 0.7]]))})`),
      },
      g: { transform: around(50, 90, `rotate(${r2(rot)}) scale(${r4(pop)})`) },
    };
  },
};

export const REACTION_ART: Record<ReactionKey, ReactionArt> = { love, fire, wow, clap, haha, idea };

/** Tam bir `<svg>` (poster dosyası, efektteki küçük emoji görseli): `t` anının karesi, varsayılan dinlenme karesi. */
export function reactionSvg(key: ReactionKey, prefix: string, size: number, t?: number): string {
  const art = REACTION_ART[key];
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="${size}" height="${size}">${art.markup(prefix, art.pose(t ?? art.duration))}</svg>`;
}
