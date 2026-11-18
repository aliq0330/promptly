"use client";

import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { useLiveNotifyPrefs } from "./live-toast-pref";
import { useNotifications } from "./notifications-provider";
import { setTitleBadge } from "@/components/layout/page-title";
import { tabBadgeLabel } from "@/lib/tab-badge";

/**
 * Sekmede okunmamış sayısı (docs/history/435-*): sekme başlığında `(3)` ve sekme simgesinde rozet. Sayı zil rozetiyle AYNIDIR (`unreadCount`, okunmamış KART sayısı), yani
 * ayrı bir sorgu/sayaç yoktur. Sekmeyi arka planda açık bırakanlar için canlı kartın tamamlayıcısıdır (kart arka plan sekmede çıkmaz). Başlığı `PageTitle` yazar; sayı
 * ona verilir (`setTitleBadge`). Simge: mevcut uygulama simgesi tuvalde çizilip köşeye bir rozet eklenir; sayı 0 olunca ya da tercih kapanınca
 * özgün simge geri konur. Ayarlar → Bildirimler'den kapatılır (cihaz başına). Hiçbir şey çizmez.
 */
export function UnreadTabBadge() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const { tabBadge } = useLiveNotifyPrefs();
  const count = user && tabBadge ? unreadCount : 0;

  // Başlık: `PageTitle` (components/layout/page-title.tsx) başlığın tek sahibidir; sayıyı ona veririz (ikinci bir <title> gözlemcisi onunla savaşırdı).
  useEffect(() => {
    setTitleBadge(count);
    return () => setTitleBadge(0);
  }, [count]);

  useEffect(() => {
    let cancelled = false;
    void paintFavicon(count, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [count]);

  return null;
}

// ---- Simge ---------------------------------------------------------------------------------------------------------------------------------

interface SavedIcon {
  link: HTMLLinkElement;
  href: string;
  type: string | null;
}
let saved: SavedIcon[] | null = null;
/** Sayfada hiç `rel=icon` yoksa (statik dışa aktarmada favicon bağlantısı yazılmaz) rozetli simge için eklenen bağlantı; rozet kalkınca silinir. */
let created: HTMLLinkElement | null = null;

function iconLinks(): HTMLLinkElement[] {
  return Array.from(document.querySelectorAll<HTMLLinkElement>('link[rel~="icon"]'));
}

function restoreFavicon() {
  if (created) {
    created.remove();
    created = null;
  }
  if (!saved) return;
  for (const item of saved) {
    item.link.href = item.href;
    if (item.type) item.link.type = item.type;
    else item.link.removeAttribute("type");
  }
  saved = null;
}

/** Bir CSS token'ının çözülmüş rengi (tuval `var()` bilmez): geçici bir öğede `color: var(--token)` okunur. */
function tokenColor(token: string, fallback: string): string {
  try {
    const probe = document.createElement("span");
    probe.style.color = `var(${token})`;
    probe.style.display = "none";
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).color;
    probe.remove();
    return value || fallback;
  } catch {
    return fallback;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("icon_load_failed"));
    image.src = src;
  });
}

async function paintFavicon(count: number, isCancelled: () => boolean): Promise<void> {
  try {
    if (count <= 0) {
      restoreFavicon();
      return;
    }
    const links = iconLinks().filter((link) => link !== created);
    if (!saved && links.length > 0) saved = links.map((link) => ({ link, href: link.href, type: link.getAttribute("type") }));
    // Tuvale çizilecek özgün resim: ICO bazı tarayıcılarda çözülemez, bu yüzden varsa PNG olan apple-touch simgesi tercih edilir.
    const touch = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
    const source = touch?.href ?? saved?.[0]?.href;
    if (!source) return;
    const image = await loadImage(source);
    if (isCancelled()) return;
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(image, 0, 0, size, size);
    const radius = 18;
    const cx = size - radius;
    const cy = radius;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = tokenColor("--color-heart", "rgb(255, 107, 53)"); // rozet = "senin olan" rengi (turuncu)
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = tokenColor("--color-surface", "rgb(255, 255, 255)");
    ctx.stroke();
    ctx.fillStyle = tokenColor("--color-primary-foreground", "rgb(255, 255, 255)");
    ctx.font = `600 ${count > 9 ? 20 : 26}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(count > 99 ? "99+" : tabBadgeLabel(count), cx, cy + 1);
    const url = canvas.toDataURL("image/png");
    if (links.length === 0 && !created) {
      created = document.createElement("link");
      created.rel = "icon";
      document.head.appendChild(created);
    }
    for (const link of iconLinks()) {
      link.href = url;
      link.type = "image/png";
    }
  } catch {
    // Simge çizilemedi (resim yüklenemedi, tuval yok): başlıktaki sayı yine görünür.
    restoreFavicon();
  }
}
