"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Promptly'nin kendi hareketli ikonları (docs/history/335-*). Tepki emojileriyle aynı ilke: dış kütüphane yok, sayfa açılışında hiçbir şey
 * oynamaz — ikon yalnızca bir kullanıcı eylemi ya da durum değişimi `seq`'i artırınca bir kez oynar (svg `key` ile yeniden kurulur).
 * Animasyonlar `globals.css`'teki `.mi-*` kurallarıdır; hareketi azalt açıkken tüm süreler 0'a iner, ikon dinlenme karesinde kalır.
 * Şekiller sitenin ikon diliyle aynıdır (docs/history/377-*): Phosphor Regular (Phosphor Icons, MIT) — tek kalınlık, tek ton. Phosphor'un
 * 256'lık ızgarasındaki şekiller 24'lük `viewBox` içinde `<g transform="scale(.09375)">` ile çizilir; böylece `globals.css`'teki `.mi-*`
 * hareketleri (24 birimlik kaynak noktaları/öteleme) değişmeden çalışır. Çizgi parçalarında kalınlık 16/256 (= Phosphor Regular).
 */

/** Phosphor 256 ızgarası → 24 birimlik `viewBox`. */
const PH = "scale(0.09375)";
/** Phosphor Regular kontur kalınlığı (256 ızgarasında). */
const PH_STROKE = 16;

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
  strokeWidth = 1.5,
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
  "M184,32H72A16,16,0,0,0,56,48V224a8,8,0,0,0,12.24,6.78L128,193.43l59.77,37.35A8,8,0,0,0,200,224V48A16,16,0,0,0,184,32Zm0,177.57-51.77-32.35a8,8,0,0,0-8.48,0L72,209.57V48H184Z";
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
          <path d="m235.32 81.37l-60.69-60.68a16 16 0 0 0-22.63 0l-53.63 53.8c-10.66-3.34-35-7.37-60.4 13.14a16 16 0 0 0-1.29 23.78L85 159.71l-42.66 42.63a8 8 0 0 0 11.32 11.32L96.29 171l48.29 48.29A16 16 0 0 0 155.9 224h1.13a15.93 15.93 0 0 0 11.64-6.33c19.64-26.1 17.75-47.32 13.19-60L235.33 104a16 16 0 0 0-.01-22.63M224 92.69l-57.27 57.46a8 8 0 0 0-1.49 9.22c9.46 18.93-1.8 38.59-9.34 48.62L48 100.08c12.08-9.74 23.64-12.31 32.48-12.31A40.1 40.1 0 0 1 96.81 91a8 8 0 0 0 9.25-1.51L163.32 32L224 92.68Z" />
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
        <path d="M227.32,28.68a16,16,0,0,0-15.66-4.08l-.15,0L19.57,82.84a16,16,0,0,0-2.49,29.8L102,154l41.3,84.87A15.86,15.86,0,0,0,157.74,248q.69,0,1.38-.06a15.88,15.88,0,0,0,14-11.51l58.2-191.94c0-.05,0-.1,0-.15A16,16,0,0,0,227.32,28.68ZM157.83,231.85l-.05.14,0-.07-40.06-82.3,48-48a8,8,0,0,0-11.31-11.31l-48,48L24.08,98.25l-.07,0,.14,0L216,40Z" />
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
        <path d="M128,24A104,104,0,1,0,232,128,104.11,104.11,0,0,0,128,24Zm0,192a88,88,0,1,1,88-88A88.1,88.1,0,0,1,128,216Z" />
      </Ph>
      <g className="mi-needle">
        <Ph>
          <path d="M172.42,72.84l-64,32a8.05,8.05,0,0,0-3.58,3.58l-32,64A8,8,0,0,0,80,184a8.1,8.1,0,0,0,3.58-.84l64-32a8.05,8.05,0,0,0,3.58-3.58l32-64a8,8,0,0,0-10.74-10.74ZM138,138,97.89,158.11,118,118l40.15-20.07Z" />
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
          <path d="M244.8,150.4a8,8,0,0,1-11.2-1.6A51.6,51.6,0,0,0,192,128a8,8,0,0,1-7.37-4.89,8,8,0,0,1,0-6.22A8,8,0,0,1,192,112a24,24,0,1,0-23.24-30,8,8,0,1,1-15.5-4A40,40,0,1,1,219,117.51a67.94,67.94,0,0,1,27.43,21.68A8,8,0,0,1,244.8,150.4Z" />
          <path d="M72,120a8,8,0,0,0-8-8A24,24,0,1,1,87.24,82a8,8,0,1,0,15.5-4A40,40,0,1,0,37,117.51,67.94,67.94,0,0,0,9.6,139.19a8,8,0,1,0,12.8,9.61A51.6,51.6,0,0,1,64,128,8,8,0,0,0,72,120Z" />
        </Ph>
      </g>
      <g className="mi-pa">
        <Ph>
          <path d="M190.92,212a8,8,0,1,1-13.84,8,57,57,0,0,0-98.16,0,8,8,0,1,1-13.84-8,72.06,72.06,0,0,1,33.74-29.92,48,48,0,1,1,58.36,0A72.06,72.06,0,0,1,190.92,212ZM128,176a32,32,0,1,0-32-32A32,32,0,0,0,128,176Z" />
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
export function PlusIcon({ open = false, size = 24, strokeWidth = 2.4, className }: Omit<MotionIconProps, "seq"> & { open?: boolean }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" data-open={open} className={cn("mi mi-plus", className)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}
