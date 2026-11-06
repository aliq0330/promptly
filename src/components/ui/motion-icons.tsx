"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Promptly'nin kendi hareketli ikonları (docs/history/335-*). Tepki emojileriyle aynı ilke: dış kütüphane yok, sayfa açılışında hiçbir şey
 * oynamaz — ikon yalnızca bir kullanıcı eylemi ya da durum değişimi `seq`'i artırınca bir kez oynar (svg `key` ile yeniden kurulur).
 * Animasyonlar `globals.css`'teki `.mi-*` kurallarıdır; hareketi azalt açıkken tüm süreler 0'a iner, ikon dinlenme karesinde kalır.
 * Şekiller sitenin ikon diliyle aynıdır (docs/history/343-*): "şey" ikonları Solar Bold Duotone (tek renk, yarı saydam ikinci ton —
 * Solar Icon Set, 480 Design, CC BY 4.0), kontrol işaretleri (tik, ok, +) çizgidir. Opaklığı canlandırılan parçalar bir `<g>` içindedir ki
 * yarı saydam ton animasyondan sonra da yarı saydam kalsın.
 */

export interface MotionIconProps {
  size?: number;
  /** Yalnız çizgi ikonlarda (tik, ok, +, takip) kullanılır; dolgu ikonlar yok sayar. */
  strokeWidth?: number;
  className?: string;
  /** 0 / verilmedi = dinlenme; her artışta animasyon bir kez oynar. */
  seq?: number;
}

function Svg({
  size = 24,
  strokeWidth = 1.75,
  className,
  seq,
  kind,
  line = false,
  children,
}: MotionIconProps & { kind: string; line?: boolean; children: React.ReactNode }) {
  return (
    <svg
      key={seq ?? 0}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      {...(line
        ? { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
        : { fill: "currentColor" })}
      aria-hidden
      focusable="false"
      className={cn("mi", `mi-${kind}`, seq ? "mi-play" : undefined, className)}
    >
      {children}
    </svg>
  );
}

/** Çöp kutusu: üzerine gelince kapak hafifçe kalkar; `seq` artınca kapak açılır, içindekiler düşer, kapak kapanır (0,9 sn). */
export function TrashIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="trash">
      <g className="mi-lid">
        <path d="M13.74 2C13.96 2 14.16 2 14.34 2.03C15.06 2.16 15.69 2.68 16.03 3.42C16.11 3.6 16.17 3.81 16.24 4.05L16.36 4.44L16.39 4.54C16.57 5.11 17.13 5.49 17.66 5.51H20.23C20.65 5.51 21 5.9 21 6.39C21 6.87 20.65 7.26 20.23 7.26H3.77C3.35 7.26 3 6.87 3 6.39C3 5.9 3.35 5.51 3.77 5.51H6.44C6.96 5.49 7.43 5.11 7.61 4.54L7.64 4.44L7.76 4.05C7.83 3.81 7.89 3.6 7.97 3.42C8.31 2.68 8.94 2.16 9.66 2.03C9.84 2 10.04 2 10.26 2H13.74Z" />
      </g>
      <g className="mi-bin">
        <path opacity=".5" d="M11.6 22H12.4C15.19 22 16.58 22 17.48 21.11C18.39 20.23 18.48 18.78 18.67 15.87L18.93 11.68C19.03 10.1 19.08 9.32 18.63 8.82C18.18 8.32 17.41 8.32 15.88 8.32H8.12C6.59 8.32 5.82 8.32 5.37 8.82C4.92 9.32 4.97 10.1 5.07 11.68L5.33 15.87C5.52 18.78 5.61 20.23 6.52 21.11C7.42 22 8.81 22 11.6 22Z" />
        <path className="mi-l1" d="M9.43 11.48C9.84 11.44 10.2 11.75 10.25 12.19L10.75 17.45C10.79 17.89 10.49 18.27 10.07 18.32C9.66 18.36 9.3 18.04 9.25 17.61L8.75 12.35C8.71 11.91 9.01 11.52 9.43 11.48Z" />
        <path className="mi-l2" d="M14.57 11.48C14.99 11.52 15.29 11.91 15.25 12.35L14.75 17.61C14.7 18.04 14.34 18.36 13.93 18.32C13.51 18.27 13.21 17.89 13.25 17.45L13.75 12.19C13.8 11.75 14.16 11.44 14.57 11.48Z" />
      </g>
    </Svg>
  );
}

/** Tik: `drawn` olunca çizilerek gelir (kopyalandı, kaydedildi, takip ediliyor). */
export function CheckDrawIcon({ drawn = true, ...props }: MotionIconProps & { drawn?: boolean }) {
  return (
    <Svg {...props} kind="check" line>
      <path className={cn("mi-chk", drawn && "mi-chk-on")} pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

const BOOKMARK_BODY =
  "M21 11.1V16.09C21 19.19 21 20.74 20.27 21.41C19.92 21.73 19.47 21.94 19 21.99C18.02 22.1 16.86 21.08 14.56 19.05C13.54 18.14 13.03 17.69 12.44 17.58C12.15 17.52 11.85 17.52 11.56 17.58C10.97 17.69 10.46 18.14 9.44 19.05C7.14 21.08 5.98 22.1 5 21.99C4.53 21.94 4.08 21.73 3.73 21.41C3 20.74 3 19.19 3 16.09V11.1C3 6.81 3 4.66 4.32 3.33C5.64 2 7.76 2 12 2C16.24 2 18.36 2 19.68 3.33C21 4.66 21 6.81 21 11.1Z";
const BOOKMARK_LINE = "M9 5.25C8.59 5.25 8.25 5.59 8.25 6C8.25 6.41 8.59 6.75 9 6.75H15C15.41 6.75 15.75 6.41 15.75 6C15.75 5.59 15.41 5.25 15 5.25H9Z";

/** Yer imi: `filled` olunca alttan yukarı dolar; `popSeq` artınca (yalnız kaydedilirken) sıçrar ve beş kıvılcım çıkar. */
export function BookmarkIcon({ filled, popSeq = 0, size = 24, className }: Omit<MotionIconProps, "seq"> & { filled: boolean; popSeq?: number }) {
  const sparks = [-70, -35, 0, 35, 70];
  return (
    // Kök <span> DEĞİL <i>: kartlardaki `CARD_SAVE_CLASS = "[&>span]:hidden"` düğmenin doğrudan <span> çocuklarını (sayıyı) gizler; kök <span> olursa ikonun kendisi de gizlenirdi.
    <i key={popSeq} data-filled={filled} className={cn("mi-bm relative inline-block shrink-0 not-italic", popSeq > 0 && filled && "mi-bm-pop", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" className="absolute inset-0">
        <path opacity=".5" d={BOOKMARK_BODY} />
        <path d={BOOKMARK_LINE} />
      </svg>
      {/* Dolu hâl: ton katmanı tam opak (kaydedildi) — alttan yukarı dolar. */}
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" className="mi-bm-fill absolute inset-0">
        <path d={BOOKMARK_BODY} />
      </svg>
      {popSeq > 0 && filled && (
        <span aria-hidden className="mi-sparks">
          {sparks.map((angle) => (
            <i key={angle} style={{ ["--a" as string]: `${angle}deg` }} />
          ))}
        </span>
      )}
    </i>
  );
}

/** Raptiye (Sabitle): sabitlenmemişken yatık ve çizgi; kullanıcı SABİTLEYİNCE yukarıdan düşüp oturur, altında bir halka yayılır (liste açılışında oynamaz). */
export function PinIcon({ pinned, size = 24, className }: Omit<MotionIconProps, "seq"> & { pinned: boolean }) {
  const [previous, setPrevious] = useState(pinned);
  const [dropped, setDropped] = useState(false);
  if (pinned !== previous) {
    setPrevious(pinned);
    setDropped(pinned);
  }
  return (
    <i data-pinned={pinned} data-drop={dropped && pinned} className={cn("mi-pin relative inline-flex shrink-0 items-center justify-center not-italic", className)} style={{ width: size, height: size }}>
      {/* Solar raptiye zaten çapraz durur; sabitlenince ton katmanı tam opak olur (`icon-solid`). */}
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" className={cn("mi mi-pin-svg", pinned && "icon-solid")}>
        <path opacity=".5" fillRule="evenodd" clipRule="evenodd" d="M16.22 4.84L19.18 7.81C21.2 9.82 22.2 10.83 21.97 11.91C21.73 13 20.4 13.5 17.74 14.5L15.89 15.19C15.18 15.46 14.82 15.59 14.55 15.83C14.43 15.94 14.32 16.05 14.23 16.18C14.01 16.48 13.91 16.85 13.71 17.58C13.25 19.26 13.02 20.09 12.47 20.4C12.24 20.54 11.98 20.6 11.71 20.6C11.08 20.6 10.47 19.99 9.24 18.76L7.78 17.3L6.7 16.22L5.28 14.8C4.07 13.58 3.46 12.97 3.45 12.34C3.45 12.07 3.52 11.81 3.66 11.57C3.97 11.03 4.8 10.8 6.46 10.34C7.2 10.14 7.57 10.04 7.86 9.82C8 9.73 8.12 9.62 8.22 9.49C8.46 9.22 8.59 8.86 8.85 8.14L9.52 6.32C10.51 3.62 11 2.27 12.09 2.03C13.18 1.79 14.19 2.81 16.22 4.84Z" />
        <path d="M3.3 21.78L7.78 17.3L6.7 16.22L2.22 20.7C1.93 20.99 1.93 21.48 2.22 21.78C2.52 22.07 3 22.07 3.3 21.78Z" />
      </svg>
    </i>
  );
}

/** Zil: `seq` artınca (yeni bildirim) bir kez sallanır; çan dili ters yöne gecikmeyle oynar. */
export function BellIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="bell">
      <path className="mi-bb" opacity=".5" d="M18.75 9V9.7C18.75 10.55 18.99 11.38 19.44 12.08L20.55 13.8C21.56 15.37 20.79 17.51 19.03 18.01C14.43 19.31 9.57 19.31 4.97 18.01C3.21 17.51 2.44 15.37 3.45 13.8L4.56 12.08C5.01 11.38 5.25 10.55 5.25 9.7V9C5.25 5.13 8.27 2 12 2C15.73 2 18.75 5.13 18.75 9Z" />
      <path className="mi-clap" d="M7.24 18.55C7.89 20.55 9.78 22 12 22C14.22 22 16.11 20.55 16.76 18.55C13.61 19.14 10.39 19.14 7.24 18.55Z" />
    </Svg>
  );
}

/** Kâğıt uçak: `seq` artınca köşeye uçar, öbür köşeden geri gelir. */
export function SendIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="send">
      <path fillRule="evenodd" clipRule="evenodd" d="m16.245 7.76l5.172-5.171l-.003-.003c-1.187-1.187-3.436-.438-7.935 1.062L8.33 5.364C4.7 6.574 2.885 7.18 2.37 8.067a2.72 2.72 0 0 0 0 2.73c.515.888 2.33 1.493 5.96 2.704c.45.15.957.042 1.294-.291l5.506-5.455a.79.79 0 0 1 1.116.005" />
      <path opacity=".5" d="m18.635 15.67l1.717-5.15c1.498-4.495 2.248-6.744 1.064-7.932l-5.172 5.171a.79.79 0 0 1-.005 1.117l-5.416 5.367a1.4 1.4 0 0 0-.324 1.426c1.21 3.631 1.815 5.446 2.703 5.962a2.71 2.71 0 0 0 2.73 0c.888-.516 1.493-2.33 2.703-5.962" />
    </Svg>
  );
}

/** Yukarı ok (mesaj gönder): `seq` artınca (gönderim bitti) ok aşağıdan yeniden girer. */
export function SendArrowIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="sendup" line>
      <path d="M12 19V5" />
      <path d="M5 12l7-7 7 7" />
    </Svg>
  );
}

/** Kişi+ ↔ tik: `done` olunca kişi küçülüp çıkar, tik çizilir (Takip Et). */
export function FollowIcon({ done, size = 16, strokeWidth = 1.9, className }: Omit<MotionIconProps, "seq"> & { done: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className={cn("mi mi-follow", className)} data-done={done}>
      <g className="mi-person">
        <circle cx="9.5" cy="8" r="3.5" />
        <path d="M3 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6" />
        <path d="M19 8v6M16 11h6" />
      </g>
      <path className="mi-chk mi-follow-chk" pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

/* ------------------------------------------------------------------ alt menü ikonları */

/** Ana Sayfa: çatı yukarıdan oturur, kapı alttan açılır. */
export function HomeIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="home">
      <g className="mi-roof">
        <path opacity=".5" d="M2 12.2C2 9.92 2 8.77 2.52 7.82C3.04 6.87 3.99 6.29 5.88 5.11L7.88 3.87C9.89 2.62 10.89 2 12 2C13.11 2 14.11 2.62 16.12 3.87L18.12 5.11C20.01 6.29 20.96 6.87 21.48 7.82C22 8.77 22 9.92 22 12.2V13.72C22 17.63 22 19.58 20.83 20.79C19.66 22 17.77 22 14 22H10C6.23 22 4.34 22 3.17 20.79C2 19.58 2 17.63 2 13.72V12.2Z" />
      </g>
      <path className="mi-door" d="M9.45 15.4C9.11 15.15 8.64 15.22 8.4 15.55C8.15 15.89 8.22 16.36 8.55 16.6C9.53 17.32 10.72 17.75 12 17.75C13.29 17.75 14.47 17.32 15.45 16.6C15.78 16.36 15.85 15.89 15.6 15.55C15.36 15.22 14.89 15.15 14.55 15.4C13.83 15.94 12.95 16.25 12 16.25C11.05 16.25 10.18 15.94 9.45 15.4Z" />
    </Svg>
  );
}

/** Keşfet: pusula iğnesi bir tur dönüp yerine yerleşir. */
export function CompassIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="compass">
      <path opacity=".5" d="M12 22C17.52 22 22 17.52 22 12C22 6.48 17.52 2 12 2C6.48 2 2 6.48 2 12C2 17.52 6.48 22 12 22Z" />
      <path className="mi-needle" d="M13.02 14.56C13.52 14.36 13.76 14.26 13.96 14.1C14.01 14.05 14.05 14.01 14.1 13.96C14.26 13.76 14.36 13.52 14.56 13.02C15.48 10.71 15.95 9.56 15.5 8.9C15.39 8.74 15.26 8.61 15.1 8.5C14.44 8.05 13.29 8.52 10.98 9.44C10.48 9.64 10.24 9.74 10.04 9.9C9.99 9.95 9.95 9.99 9.9 10.04C9.74 10.24 9.64 10.48 9.44 10.98C8.52 13.29 8.05 14.44 8.5 15.1C8.61 15.26 8.74 15.39 8.9 15.5C9.56 15.95 10.71 15.48 13.02 14.56Z" />
    </Svg>
  );
}

/** Topluluklar: iki kişi birbirine doğru eğilir. */
export function CommunityIcon(props: MotionIconProps) {
  // Topluluk = Users (üç kişi), filtrelerdeki/aramadaki topluluk ikonuyla AYNI şekil (docs/history/345-*).
  return (
    <Svg {...props} kind="community">
      <g className="mi-pb">
        <g opacity=".5">
          <path d="M6 14C8.209 14 10 15.119 10 16.5C10 17.881 8.209 19 6 19C3.791 19 2 17.881 2 16.5C2 15.119 3.791 14 6 14Z" />
          <path d="M18 14C20.209 14 22 15.119 22 16.5C22 17.881 20.209 19 18 19C15.791 19 14 17.881 14 16.5C14 15.119 15.791 14 18 14Z" />
          <path d="M7 5C8.381 5 9.5 6.119 9.5 7.5C9.5 8.881 8.381 10 7 10C5.619 10 4.5 8.881 4.5 7.5C4.5 6.119 5.619 5 7 5Z" />
          <path d="M17 5C18.381 5 19.5 6.119 19.5 7.5C19.5 8.881 18.381 10 17 10C15.619 10 14.5 8.881 14.5 7.5C14.5 6.119 15.619 5 17 5Z" />
        </g>
      </g>
      <g className="mi-pa">
        <path d="M12 13C15.314 13 18 14.567 18 16.5C18 18.433 15.314 20 12 20C8.686 20 6 18.433 6 16.5C6 14.567 8.686 13 12 13Z" />
        <path d="M12 4C13.933 4 15.5 5.567 15.5 7.5C15.5 9.433 13.933 11 12 11C10.067 11 8.5 9.433 8.5 7.5C8.5 5.567 10.067 4 12 4Z" />
      </g>
    </Svg>
  );
}

/** Odak: kart yukarı kayar, üst ve alt çizgiler yerine oturur. */
export function FocusIcon(props: MotionIconProps) {
  // Odak = yatay kaydırmalı akış: ortada uzun kart, yanlarda soluk komşular (Solar slider-vertical şekli).
  return (
    <Svg {...props} kind="focus">
      <g className="mi-ftop">
        <path opacity=".5" d="M6.14114 4.5C6 5.34287 6 6.46249 6 8V16C6 17.5375 6 18.6571 6.14114 19.5H6C4.59987 19.5 3.8998 19.5 3.36502 19.2275C2.89462 18.9878 2.51217 18.6054 2.27248 18.135C2 17.6002 2 16.9001 2 15.5V8.5C2 7.09987 2 6.3998 2.27248 5.86502C2.51217 5.39462 2.89462 5.01217 3.36502 4.77248C3.8998 4.5 4.59987 4.5 6 4.5H6.14114Z" />
      </g>
      <g className="mi-fbot">
        <path opacity=".5" d="M17.8589 4.5C18 5.34287 18 6.46248 18 7.99998V16C18 17.5375 18 18.6571 17.8589 19.5H18C19.4001 19.5 20.1002 19.5 20.635 19.2275C21.1054 18.9878 21.4878 18.6054 21.7275 18.135C22 17.6002 22 16.9001 22 15.5V8.5C22 7.09987 22 6.3998 21.7275 5.86502C21.4878 5.39462 21.1054 5.01217 20.635 4.77248C20.1002 4.5 19.4001 4.5 18 4.5H17.8589Z" />
      </g>
      <g className="mi-fmid">
        <path d="M6 8C6 5.17157 6 3.75736 6.87868 2.87868C7.75736 2 9.17157 2 12 2C14.8284 2 16.2426 2 17.1213 2.87868C18 3.75736 18 5.17157 18 8V16C18 18.8284 18 20.2426 17.1213 21.1213C16.2426 22 14.8284 22 12 22C9.17157 22 7.75736 22 6.87868 21.1213C6 20.2426 6 18.8284 6 16L6 8Z" />
      </g>
    </Svg>
  );
}

/** Oluştur "+": `open` olunca 135° dönüp ✕ olur. */
export function PlusIcon({ open = false, size = 24, strokeWidth = 2.4, className }: Omit<MotionIconProps, "seq"> & { open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" data-open={open} className={cn("mi mi-plus", className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
