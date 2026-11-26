"use client";

import { ArrowDownLeft } from "@/components/icons/arrow-down-left";
import { ArrowUpRight } from "@/components/icons/arrow-up-right";
import { Phone } from "@/components/icons/phone";
import { Video } from "@/components/icons/video";
import { formatClockTime } from "@/lib/chat-grouping";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { summarizeCall, type CallSummary } from "@/lib/webrtc/call-history";
import { formatCallDuration } from "@/lib/webrtc/call-rules";
import type { CallRow, CallType } from "@/lib/webrtc/types";
import { cn } from "@/lib/utils";

/** Bir arama kaydının "benim için" cümlesinin çeviri anahtarı (sohbet akışı, Aramalar listesi ve mesaj önizlemesi aynısını kullanır). */
export function callLabelKey(summary: CallSummary): TranslationKey {
  switch (summary.outcome) {
    case "missed":
      return summary.type === "video" ? "calls.log.missed.video" : "calls.log.missed.audio";
    case "unanswered":
      return "calls.log.unanswered";
    case "declined":
      return "calls.log.declined";
    case "rejected":
      return "calls.log.rejected";
    default:
      return summary.direction === "out" ? (summary.type === "video" ? "calls.log.out.video" : "calls.log.out.audio") : summary.type === "video" ? "calls.log.in.video" : "calls.log.in.audio";
  }
}

/**
 * Sohbet akışındaki arama kaydı (docs/history/450-*): mesaj baloncuğu değil, ortalanmış sistem satırı — yön oku + tür simgesi + cümle +
 * (görüşüldüyse) süre + saat. Cevapsız gelen arama kırmızıdır ve "Geri ara" önerir; verilmişse giden cevapsız/reddedilen için "Tekrar ara".
 */
export function CallLogRow({ call, userId, onCallBack }: { call: CallRow; userId: string; onCallBack?: (type: CallType) => void }) {
  const { t, language } = useTranslation();
  const summary = summarizeCall(call, userId);
  if (!summary) return null;
  const missed = summary.outcome === "missed";
  const TypeIcon = summary.type === "video" ? Video : Phone;
  const DirIcon = summary.direction === "out" ? ArrowUpRight : ArrowDownLeft;
  const label = t(callLabelKey(summary));
  const canCall = Boolean(onCallBack);
  const actionLabel = missed ? t("calls.log.callBack") : t("calls.log.callAgain");
  return (
    <div className="flex justify-center py-1" data-call-log data-call-outcome={summary.outcome} data-call-direction={summary.direction}>
      <div className="inline-flex max-w-full flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-full bg-surface px-3 py-1.5 text-caption text-text-secondary shadow-xs">
        <span className={cn("inline-flex items-center gap-1 font-semibold", missed ? "text-danger" : "text-text")}>
          <TypeIcon size={16} aria-hidden />
          <DirIcon size={12} aria-hidden />
          {label}
        </span>
        {summary.outcome === "completed" && <span>{t("calls.log.duration", { time: formatCallDuration(summary.durationSec) })}</span>}
        <span className="text-text-muted">{formatClockTime(summary.at, language)}</span>
        {canCall && summary.outcome !== "completed" && (
          <button type="button" onClick={() => onCallBack?.(summary.type)} data-call-callback className="rounded-full px-2 py-0.5 font-semibold text-primary-text hover:bg-primary-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus">
            {actionLabel}
          </button>
        )}
      </div>
    </div>
  );
}
