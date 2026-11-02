/**
 * Telegram bildirimleri (docs/history/323-*): zamanlayıcı (GitHub Actions, ~15 dk) Edge Function'ın `/notify` ucunu çağırır; bu işlev
 *  (1) etkinlik bildirimlerini (yorum, yanıt, istek yanıtı, alıntı, düzenleme önerisi, sonuç) bağlı sohbetlere yollar,
 *  (2) haftada bir (yeni ISO haftasının ilk çalışmasında, 06:00 UTC'den sonra) haftalık özeti yollar.
 * Beğeni/takip/mesaj bilerek DIŞARIDA (gürültü). İkisi de KAPALI başlar: kişi bağlandıktan sonra Ayarlar'dan ya da /bildirim ile açar.
 *
 * GÜVENLİK/GİZLİLİK: bildirim önizlemesi başkasının yorumunu içerebilir ve Telegram'dan geçer (Gizlilik Politikası'nda yazılı, açık onaya bağlı).
 * Metin HTML-kaçırılır; bağlantı yalnız bizim sitemize gider. İmleç bildirim kimliğiyle ilerler: aynı bildirim iki kez gitmez; gönderim başarısızsa imleç
 * ilerlemez (sonraki çalışmada yeniden denenir). Botu engelleyen kişinin bağlantısı kendiliğinden kaldırılır.
 */
import { escapeHtml, link } from "./format.ts";
import { msg } from "./messages.ts";
import type { MeBackend } from "../me.ts";
import type { Lang, NotifyReport, TelegramApi, TelegramQuery } from "./types.ts";

export interface NotifyOptions {
  api: TelegramApi;
  owner: TelegramQuery;
  me: MeBackend;
  siteUrl: string;
  now?: () => Date;
  onError?: (error: unknown) => void;
  /** Bir çalışmada işlenecek en çok bağlantı. */
  batch?: number;
}

/** Sunucunun Türkçe cümle önekleri → İngilizce karşılık (sitedeki `notification-message.ts` ile aynı kalıplar; kullanıcı içeriği/önizleme çevrilmez). */
const EN_PREFIXES: [tr: string, en: string][] = [
  ["Paylaşımına yorum yaptı", "commented on your post"],
  ["İsteğine yorum yaptı", "commented on your request"],
  ["Workflow'una yorum yaptı", "commented on your workflow"],
  ["Hazır ayarına yorum yaptı", "commented on your preset"],
  ["Sonucuna yorum yaptı", "commented on your result"],
  ["Alıntına yorum yaptı", "commented on your quote"],
  ["Yorumuna yanıt verdi", "replied to your comment"],
  ["İsteğine yanıt verdi", "answered your request"],
  ["İçeriğini alıntıladı", "quoted your content"],
  ["Promptun için bir düzenleme önerdi", "suggested an edit to your prompt"],
  ["Promptun için bir sonuç paylaştı", "shared a result for your prompt"],
];

export function notificationText(lang: Lang, message: string): string {
  if (lang === "tr") return message;
  for (const [tr, en] of EN_PREFIXES) if (message.startsWith(tr)) return en + message.slice(tr.length);
  return message;
}

/** Bildirimin hedef adresi: yalnız site içi yol kabul edilir (`//` ya da şema içeren değer yok sayılır → ana sayfa). */
export function notificationUrl(siteUrl: string, href: string): string {
  return /^\/(?!\/)[^\s]*$/.test(href) && !href.includes("://") ? `${siteUrl}${href}` : siteUrl;
}

/** ISO hafta etiketi (`2026-45`): SQL'deki `IYYY-IW` ile aynı. */
export function isoWeekLabel(date: Date): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - day); // o haftanın Perşembesi
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${String(week).padStart(2, "0")}`;
}

interface LinkRow {
  link_id: string;
  chat_id: string | number;
  telegram_user_id: string | number;
  language: string;
  notify_weekly: boolean;
  notify_activity: boolean;
  last_weekly_week: string | null;
}

interface PendingRow {
  id: string;
  type: string;
  message: string;
  target_href: string;
  actor_username: string | null;
}

export async function runTelegramNotifications(options: NotifyOptions): Promise<NotifyReport> {
  const { api, owner, me, siteUrl } = options;
  const now = options.now?.() ?? new Date();
  const week = isoWeekLabel(now);
  const weeklyHour = now.getUTCHours() >= 6;
  const report: NotifyReport = { links: 0, activitySent: 0, weeklySent: 0, unlinked: 0, failed: 0 };

  const links = (await owner("select * from public._telegram_notify_links($1)", [options.batch ?? 100])) as unknown as LinkRow[];
  report.links = links.length;

  /** 403 = kişi botu engelledi/sohbeti sildi → bağlantı kaldırılır. Dönen: gönderildi mi. */
  async function deliver(row: LinkRow, text: string, buttonUrl?: string): Promise<boolean> {
    const result = await api.call("sendMessage", {
      chat_id: Number(row.chat_id),
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
      ...(buttonUrl ? { reply_markup: { inline_keyboard: [[{ text: msg(row.language === "en" ? "en" : "tr", "open"), url: buttonUrl }]] } } : {}),
    });
    if (result.ok) return true;
    if (result.errorCode === 403) {
      await owner("select public._telegram_unlink_link($1::uuid)", [row.link_id]);
      report.unlinked += 1;
    } else {
      report.failed += 1;
      options.onError?.(new Error(`telegram notify sendMessage failed (${result.errorCode})`));
    }
    return false;
  }

  for (const row of links) {
    const lang: Lang = row.language === "en" ? "en" : "tr";
    try {
      if (row.notify_activity) {
        const pending = (await owner("select * from public._telegram_pending($1::uuid, 5)", [row.link_id])) as unknown as PendingRow[];
        if (pending.length) {
          const lines = [msg(lang, "notifyHeader")];
          for (const item of pending) {
            const who = item.actor_username ? `@${escapeHtml(item.actor_username)} ` : "";
            lines.push(`• ${who}${escapeHtml(notificationText(lang, item.message))} — ${link(notificationUrl(siteUrl, item.target_href), msg(lang, "open"))}`);
          }
          if (await deliver(row, lines.join("\n"))) {
            report.activitySent += pending.length;
            await owner("select public._telegram_advance_to($1::uuid, $2::uuid)", [row.link_id, pending[pending.length - 1].id]);
          }
        }
      }
      if (row.notify_weekly && weeklyHour && row.last_weekly_week !== week) {
        const summary = await me.withTelegram({ telegramUserId: String(row.telegram_user_id), language: lang }, "read", async (tx) => (await tx("select * from public.creator_insights_summary(7)"))[0]);
        const parts: string[] = [];
        const add = (value: unknown, key: "copies" | "reactions" | "comments" | "saves" | "followers") => {
          const n = Number(value ?? 0);
          if (n > 0) parts.push(msg(lang, key, n));
        };
        add(summary?.copies, "copies");
        add(summary?.reactions, "reactions");
        add(summary?.comments, "comments");
        add(summary?.saves, "saves");
        add(summary?.followers, "followers");
        // Hareketsiz hafta için mesaj yok ama hafta yine kayda geçer (gün içinde tekrar hesaplanmaz).
        if (!parts.length || (await deliver(row, `${msg(lang, "weeklyTitle")}\n${escapeHtml(parts.join(" · "))}\n${link(`${siteUrl}/insights`, msg(lang, "open"))}`))) {
          if (parts.length) report.weeklySent += 1;
          await owner("select public._telegram_mark_weekly($1::uuid, $2)", [row.link_id, week]);
        }
      }
    } catch (error) {
      report.failed += 1;
      options.onError?.(error);
    }
  }
  return report;
}
