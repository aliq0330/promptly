"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Promptly'nin kendi hareketli ikonları (docs/history/335-*). Tepki emojileriyle aynı ilke: dış kütüphane yok, sayfa açılışında hiçbir şey
 * oynamaz — ikon yalnızca bir kullanıcı eylemi ya da durum değişimi `seq`'i artırınca bir kez oynar (svg `key` ile yeniden kurulur).
 * Animasyonlar `globals.css`'teki `.mi-*` kurallarıdır; hareketi azalt açıkken tüm süreler 0'a iner, ikon dinlenme karesinde kalır.
 * Şekiller sitenin ikon diliyle aynıdır (docs/history/377-*): Phosphor Bold (Phosphor Icons, MIT) — tek kalınlık, tek ton. Phosphor'un
 * 256'lık ızgarasındaki şekiller 24'lük `viewBox` içinde `<g transform="scale(.09375)">` ile çizilir; böylece `globals.css`'teki `.mi-*`
 * hareketleri (24 birimlik kaynak noktaları/öteleme) değişmeden çalışır. Çizgi parçalarında kalınlık 24/256 (= Phosphor Bold).
 */

/** Phosphor 256 ızgarası → 24 birimlik `viewBox`. */
const PH = "scale(0.09375)";
/** Phosphor Bold kontur kalınlığı (256 ızgarasında). */
const PH_STROKE = 24;

function Ph({ children, line = false }: { children: React.ReactNode; line?: boolean }) {
  return (
    <g transform={PH} {...(line ? { strokeWidth: PH_STROKE } : {})}>
      {children}
    </g>
  );
}

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
  strokeWidth = 2.25,
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
    <Svg {...props} kind="trash" line>
      <g className="mi-lid">
        <Ph line>
          <path d="M216,64H40" />
          <path d="M96,64V40a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8V64" />
        </Ph>
      </g>
      <g className="mi-bin">
        <Ph line>
          <path d="M200,64V208a8,8,0,0,1-8,8H64a8,8,0,0,1-8-8V64" />
          <path className="mi-l1" d="M104,104v64" />
          <path className="mi-l2" d="M152,104v64" />
        </Ph>
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

const BOOKMARK_REGULAR =
  "M184 28H72a20 20 0 0 0-20 20v176a12 12 0 0 0 18.36 10.18l57.63-36l57.65 36A12 12 0 0 0 204 224V48a20 20 0 0 0-20-20m-4 174.35l-45.65-28.53a12 12 0 0 0-12.72 0L76 202.35V52h104Z";
const BOOKMARK_FILL = "M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Z";

/** Yer imi: `filled` olunca alttan yukarı dolar; `popSeq` artınca (yalnız kaydedilirken) sıçrar ve beş kıvılcım çıkar. */
export function BookmarkIcon({ filled, popSeq = 0, size = 24, className }: Omit<MotionIconProps, "seq"> & { filled: boolean; popSeq?: number }) {
  const sparks = [-70, -35, 0, 35, 70];
  return (
    // Kök <span> DEĞİL <i>: kartlardaki `CARD_SAVE_CLASS = "[&>span]:hidden"` düğmenin doğrudan <span> çocuklarını (sayıyı) gizler; kök <span> olursa ikonun kendisi de gizlenirdi.
    <i key={popSeq} data-filled={filled} className={cn("mi-bm relative inline-block shrink-0 not-italic", popSeq > 0 && filled && "mi-bm-pop", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden focusable="false" className="absolute inset-0">
        <path d={BOOKMARK_REGULAR} />
      </svg>
      {/* Dolu hâl (kaydedildi): Phosphor Fill gövdesi alttan yukarı dolar. */}
      <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden focusable="false" className="mi-bm-fill absolute inset-0">
        <path d={BOOKMARK_FILL} />
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
      {/* Phosphor raptiyesi zaten çapraz durur; sabitlenince Fill gövdesine geçer. */}
      <svg width={size} height={size} viewBox="0 0 256 256" fill="currentColor" aria-hidden focusable="false" className="mi mi-pin-svg">
        {pinned ? (
          <path d="m235.33 104l-53.47 53.65c4.56 12.67 6.45 33.89-13.19 60A15.93 15.93 0 0 1 157 224h-1.13a16 16 0 0 1-11.32-4.69L96.29 171l-42.63 42.66a8 8 0 0 1-11.32-11.32L85 159.71l-48.3-48.3A16 16 0 0 1 38 87.63c25.42-20.51 49.75-16.48 60.4-13.14L152 20.7a16 16 0 0 1 22.63 0l60.69 60.68a16 16 0 0 1 .01 22.62" />
        ) : (
          <path d="m238.15 78.54l-60.69-60.68a20 20 0 0 0-28.3 0L97.2 70c-12.43-3.33-36.68-5.72-61.74 14.5a20 20 0 0 0-1.6 29.73l45.46 45.47l-39.8 39.8a12 12 0 0 0 17 17l39.8-39.81l45.47 45.46a20 20 0 0 0 14.12 5.85c.46 0 .93 0 1.4-.05a20 20 0 0 0 14.56-7.95c4.69-6.23 11-16.13 14.44-28s3.45-22.88.16-33.4l51.7-51.87a20 20 0 0 0-.02-28.19m-74.26 68.79a12 12 0 0 0-2.23 13.84c3.43 6.86 6.9 21-6.28 40.65L54.08 100.53c21.09-14.59 39.53-6.64 41-6a11.67 11.67 0 0 0 13.81-2.29l54.43-54.61l55 55Z" />
        )}
      </svg>
    </i>
  );
}

/** Zil: `seq` artınca (yeni bildirim) bir kez sallanır; çan dili ters yöne gecikmeyle oynar. */
export function BellIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="bell" line>
      <g className="mi-bb">
        <Ph line>
          <path d="M208,192H48a8,8,0,0,1-6.88-12C47.63,168.91,56,144.2,56,104a72,72,0,0,1,144,0c0,40.2,8.37,64.91,14.88,76A8,8,0,0,1,208,192Z" />
        </Ph>
      </g>
      <g className="mi-clap">
        <Ph line>
          <path d="M96,192a32,32,0,0,0,64,0" />
        </Ph>
      </g>
    </Svg>
  );
}

/** Kâğıt uçak: `seq` artınca köşeye uçar, öbür köşeden geri gelir. */
export function SendIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="send">
      <Ph>
        <path d="M230.14 25.86a20 20 0 0 0-19.57-5.11l-.22.07L18.44 79a20 20 0 0 0-3.06 37.25L99 157l40.71 83.65a19.81 19.81 0 0 0 18 11.38c.57 0 1.15 0 1.73-.07a19.82 19.82 0 0 0 17.56-14.4l58.18-191.91a1.4 1.4 0 0 0 .07-.22a20 20 0 0 0-5.11-19.57m-73.23 195.21l-34.37-70.64l46-45.95a12 12 0 0 0-17-17l-46 46l-70.61-34.39L210 46Z" />
      </Ph>
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
export function FollowIcon({ done, size = 16, strokeWidth = 2.25, className }: Omit<MotionIconProps, "seq"> & { done: boolean }) {
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
    <Svg {...props} kind="home" line>
      <g className="mi-roof">
        <Ph line>
          <path d="M216,216V120a8,8,0,0,0-2.34-5.66l-80-80a8,8,0,0,0-11.32,0l-80,80A8,8,0,0,0,40,120V216" />
          <path d="M24,216H232" />
        </Ph>
      </g>
      <g className="mi-door">
        <Ph line>
          <path d="M96,216V160a8,8,0,0,1,8-8h48a8,8,0,0,1,8,8v56" />
        </Ph>
      </g>
    </Svg>
  );
}

/** Keşfet: pusula iğnesi bir tur dönüp yerine yerleşir. */
export function CompassIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="compass">
      <Ph>
        <path d="M128 20a108 108 0 1 0 108 108A108.12 108.12 0 0 0 128 20m0 192a84 84 0 1 1 84-84a84.09 84.09 0 0 1-84 84" />
      </Ph>
      <g className="mi-needle">
        <Ph>
          <path d="M163.27 77l-56 24a12 12 0 0 0-6.3 6.3l-24 56A12 12 0 0 0 92.73 179l56-24a12 12 0 0 0 6.3-6.3l24-56A12 12 0 0 0 163.27 77m-28.41 57.89l-24 10.29l10.29-24l24-10.29Z" />
        </Ph>
      </g>
    </Svg>
  );
}

/** Topluluklar: iki kişi birbirine doğru eğilir. */
export function CommunityIcon(props: MotionIconProps) {
  // Topluluk = Users (üç kişi), filtrelerdeki/aramadaki topluluk ikonuyla AYNI şekil (docs/history/345-*, 377-*): Phosphor `users-three`.
  return (
    <Svg {...props} kind="community">
      <g className="mi-pb">
        <Ph>
          <path d="M247.21 153.59a12 12 0 0 1-16.81-2.39c-8.33-11.09-19.85-19.59-29.33-21.64a12 12 0 0 1-1.82-22.91a20 20 0 1 0-24.78-28.3a12 12 0 1 1-21-11.6a44 44 0 1 1 73.28 48.35a92.2 92.2 0 0 1 22.85 21.69a12 12 0 0 1-2.39 16.8m-192.28-24c-9.48 2.05-21 10.55-29.33 21.65a12 12 0 0 1-19.19-14.45a92.4 92.4 0 0 1 22.85-21.69a44 44 0 1 1 73.28-48.35a12 12 0 1 1-21 11.6a20 20 0 1 0-24.78 28.3a12 12 0 0 1-1.82 22.91Z" />
        </Ph>
      </g>
      <g className="mi-pa">
        <Ph>
          <path d="M164.38 181.1a52 52 0 1 0-72.76 0a75.9 75.9 0 0 0-30 28.89a12 12 0 0 0 20.78 12a53 53 0 0 1 91.22 0a12 12 0 1 0 20.78-12a75.9 75.9 0 0 0-30.02-28.89M100 144a28 28 0 1 1 28 28a28 28 0 0 1-28-28" />
        </Ph>
      </g>
    </Svg>
  );
}

/** Odak: kart yukarı kayar, üst ve alt çizgiler yerine oturur. */
export function FocusIcon(props: MotionIconProps) {
  // Odak = yatay kaydırmalı akış: ortada uzun kart, yanlarda komşu kartlar (Phosphor çizgi diliyle çizildi).
  return (
    <Svg {...props} kind="focus" line>
      <g className="mi-ftop">
        <Ph line>
          <path d="M32,72V184" />
        </Ph>
      </g>
      <g className="mi-fbot">
        <Ph line>
          <path d="M224,72V184" />
        </Ph>
      </g>
      <g className="mi-fmid">
        <Ph line>
          <rect x="72" y="40" width="112" height="176" rx="16" />
        </Ph>
      </g>
    </Svg>
  );
}

/** Oluştur "+": `open` olunca 135° dönüp ✕ olur. */
export function PlusIcon({ open = false, size = 24, strokeWidth = 2.25, className }: Omit<MotionIconProps, "seq"> & { open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" data-open={open} className={cn("mi mi-plus", className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
