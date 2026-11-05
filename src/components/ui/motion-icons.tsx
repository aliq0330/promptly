"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/*
 * Promptly'nin kendi hareketli ikonları (docs/history/335-*). Tepki emojileriyle aynı ilke: dış kütüphane yok, sayfa açılışında hiçbir şey
 * oynamaz — ikon yalnızca bir kullanıcı eylemi ya da durum değişimi `seq`'i artırınca bir kez oynar (svg `key` ile yeniden kurulur).
 * Animasyonlar `globals.css`'teki `.mi-*` kurallarıdır; hareketi azalt açıkken tüm süreler 0'a iner, ikon dinlenme karesinde kalır.
 * Her ikon lucide ikonlarıyla aynı çizgi dilini kullanır (24px kutu, yuvarlak uç, `currentColor`).
 */

export interface MotionIconProps {
  size?: number;
  strokeWidth?: number;
  className?: string;
  /** 0 / verilmedi = dinlenme; her artışta animasyon bir kez oynar. */
  seq?: number;
}

function Svg({ size = 24, strokeWidth = 1.75, className, seq, kind, children }: MotionIconProps & { kind: string; children: React.ReactNode }) {
  return (
    <svg
      key={seq ?? 0}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
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
        <path d="M4 6.5h16" />
        <path d="M9.5 6.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v1.5" />
      </g>
      <g className="mi-bin">
        <path d="M6.5 9.5l.9 9.7A2 2 0 0 0 9.4 21h5.2a2 2 0 0 0 2-1.8l.9-9.7" />
        <path className="mi-l1" d="M10 12.5V17" />
        <path className="mi-l2" d="M14 12.5V17" />
      </g>
    </Svg>
  );
}

/** Tik: `drawn` olunca çizilerek gelir (kopyalandı, kaydedildi, takip ediliyor). */
export function CheckDrawIcon({ drawn = true, ...props }: MotionIconProps & { drawn?: boolean }) {
  return (
    <Svg {...props} kind="check">
      <path className={cn("mi-chk", drawn && "mi-chk-on")} pathLength={1} d="M5 12.5l4.5 4.5L19 7.5" />
    </Svg>
  );
}

const BOOKMARK_PATH = "M7 3.5h10a1 1 0 0 1 1 1V20.5l-6-4.3-6 4.3V4.5a1 1 0 0 1 1-1z";

/** Yer imi: `filled` olunca alttan yukarı dolar; `popSeq` artınca (yalnız kaydedilirken) sıçrar ve beş kıvılcım çıkar. */
export function BookmarkIcon({ filled, popSeq = 0, size = 24, strokeWidth = 1.75, className }: Omit<MotionIconProps, "seq"> & { filled: boolean; popSeq?: number }) {
  const sparks = [-70, -35, 0, 35, 70];
  return (
    // Kök <span> DEĞİL <i>: kartlardaki `CARD_SAVE_CLASS = "[&>span]:hidden"` düğmenin doğrudan <span> çocuklarını (sayıyı) gizler; kök <span> olursa ikonun kendisi de gizlenirdi.
    <i key={popSeq} data-filled={filled} className={cn("mi-bm relative inline-block shrink-0 not-italic", popSeq > 0 && filled && "mi-bm-pop", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" aria-hidden focusable="false" className="absolute inset-0">
        <path d={BOOKMARK_PATH} />
      </svg>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth={strokeWidth} strokeLinejoin="round" aria-hidden focusable="false" className="mi-bm-fill absolute inset-0">
        <path d={BOOKMARK_PATH} />
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
export function PinIcon({ pinned, size = 24, strokeWidth = 1.75, className }: Omit<MotionIconProps, "seq"> & { pinned: boolean }) {
  const [previous, setPrevious] = useState(pinned);
  const [dropped, setDropped] = useState(false);
  if (pinned !== previous) {
    setPrevious(pinned);
    setDropped(pinned);
  }
  return (
    <i data-pinned={pinned} data-drop={dropped && pinned} className={cn("mi-pin relative inline-flex shrink-0 items-center justify-center not-italic", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 24 24" fill={pinned ? "currentColor" : "none"} stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false" className="mi mi-pin-svg">
        <path d="M12 17v5" />
        <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" />
      </svg>
    </i>
  );
}

/** Zil: `seq` artınca (yeni bildirim) bir kez sallanır; çan dili ters yöne gecikmeyle oynar. */
export function BellIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="bell">
      <path className="mi-bb" d="M6 9a6 6 0 0 1 12 0c0 6.5 2.5 8 2.5 8h-17S6 15.5 6 9" />
      <path className="mi-clap" d="M10.2 20.5a2 2 0 0 0 3.6 0" />
    </Svg>
  );
}

/** Kâğıt uçak: `seq` artınca köşeye uçar, öbür köşeden geri gelir. */
export function SendIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="send">
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </Svg>
  );
}

/** Yukarı ok (mesaj gönder): `seq` artınca (gönderim bitti) ok aşağıdan yeniden girer. */
export function SendArrowIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="sendup">
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
      <path className="mi-roof" d="M3 11.5L12 4l9 7.5" />
      <path d="M5.5 10v9.5a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1V10" />
      <path className="mi-door" d="M10 20.5v-5h4v5" />
    </Svg>
  );
}

/** Keşfet: pusula iğnesi bir tur dönüp yerine yerleşir. */
export function CompassIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="compass">
      <circle cx="12" cy="12" r="9.5" />
      <path className="mi-needle" d="M15.6 8.4l-2.1 5.1-5.1 2.1 2.1-5.1z" />
    </Svg>
  );
}

/** Topluluklar: iki kişi birbirine doğru eğilir. */
export function CommunityIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="community">
      <g className="mi-pa">
        <circle cx="9" cy="8" r="3.4" />
        <path d="M2.8 20c0-3.3 2.7-5.5 6.2-5.5s6.2 2.2 6.2 5.5" />
      </g>
      <g className="mi-pb">
        <circle cx="17.2" cy="9" r="2.4" />
        <path d="M16.6 14.8c2.8.2 4.9 2.1 4.9 5.2" />
      </g>
    </Svg>
  );
}

/** Odak: kart yukarı kayar, üst ve alt çizgiler yerine oturur. */
export function FocusIcon(props: MotionIconProps) {
  return (
    <Svg {...props} kind="focus">
      <path className="mi-ftop" d="M8.5 2.8h7" />
      <rect className="mi-fmid" x="6" y="6.5" width="12" height="11" rx="2.2" />
      <path className="mi-fbot" d="M8.5 21.2h7" />
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
