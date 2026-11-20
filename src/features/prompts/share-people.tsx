"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Check } from "@/components/icons/check";
import { Loader2 } from "@/components/icons/loader-2";
import { Send } from "@/components/icons/send";
import { Users } from "@/components/icons/users";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { SearchField } from "@/components/ui/search-field";
import { useAuth } from "@/features/auth/auth-provider";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { composeShareMessage, type ShareMessageRef } from "@/features/messages/share-message";
import { useRealMessages } from "@/features/messages/real-messages-provider";
import { TeamMark } from "@/features/teams/team-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { sendMessage } from "@/lib/supabase/messages";
import { filterShareTargets, rankShareTargets, readShareCounts, recordShareSent, type ShareTarget } from "@/lib/share-targets";
import { cn } from "@/lib/utils";

/** Izgarada ilk görünen hedef sayısı (iki satır × 4 sütun; sonuncusu "Tümü" karosudur) ve tek seferde gönderilebilecek en çok sohbet. */
const VISIBLE_TARGETS = 7;
const SEARCH_RESULTS = 11;
const MAX_SELECTED = 10;

type SendState = "sent" | "failed";

/**
 * Paylaş penceresinin "Kişiler önce" bölümü (docs/history/446-*, mockup B): son/sık yazışılan kişiler, topluluk sohbetleri ve ekip kanalları
 * 4 sütunlu ızgarada; kimse seçili değilken altta `actions` (Bağlantı, Alıntıla, Hikâye…), biri seçilince alt satır not alanı + gönder düğmesine
 * döner. Gönderim mevcut `sendMessage` yoludur (RLS/yetki/hız sınırı sunucuda); sıra kuralları saf `lib/share-targets.ts`'tedir.
 */
export function SharePeople({
  share,
  moreHref,
  onDone,
  actions,
}: {
  share: ShareMessageRef;
  /** Izgarada olmayan biriyle (yeni sohbet dahil) devam etmek için mevcut sohbet seçici. */
  moreHref: string;
  onDone: () => void;
  actions: ReactNode;
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { conversations, ready, refresh } = useRealMessages();
  const [counts] = useState(readShareCounts);
  const [now] = useState(() => Date.now());
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [results, setResults] = useState<Record<string, SendState>>({});
  const [busy, setBusy] = useState(false);

  const ranked = useMemo(() => rankShareTargets(conversations, counts, now), [conversations, counts, now]);
  const searching = query.trim().length > 0;
  const shown = useMemo(
    () => (searching ? filterShareTargets(ranked, query).slice(0, SEARCH_RESULTS) : ranked.slice(0, VISIBLE_TARGETS)),
    [ranked, query, searching],
  );
  const byId = useMemo(() => new Map(ranked.map((target) => [target.id, target])), [ranked]);
  const failedCount = Object.values(results).filter((state) => state === "failed").length;

  function toggle(id: string) {
    if (busy || results[id] === "sent") return;
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : prev.length >= MAX_SELECTED ? prev : [...prev, id]));
    setResults((prev) => {
      if (prev[id] !== "failed") return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  async function submit() {
    if (!user || busy || selected.length === 0) return;
    setBusy(true);
    const payload = composeShareMessage(share, note);
    const sentNow: string[] = [];
    const next: Record<string, SendState> = { ...results };
    // Sırayla gönderilir: sunucu hız sınırı/yetki hatası bir hedefte olsa da diğerleri gider; her hedefin sonucu ayrı gösterilir.
    for (const id of selected) {
      try {
        await sendMessage(id, user.id, payload);
        next[id] = "sent";
        sentNow.push(id);
      } catch {
        next[id] = "failed";
      }
    }
    setResults(next);
    setSelected((prev) => prev.filter((id) => next[id] === "failed"));
    setBusy(false);
    if (sentNow.length > 0) {
      recordShareSent(sentNow);
      void refresh();
    }
    if (!Object.values(next).includes("failed")) setTimeout(onDone, 1200);
  }

  if (!ready && ranked.length === 0) {
    return (
      <div className="mt-4 grid place-items-center py-6 text-text-muted" role="status" aria-label={t("common.loading")}>
        <Loader2 size={20} className="animate-spin" />
      </div>
    );
  }

  const sentCount = Object.values(results).filter((state) => state === "sent").length;
  const allDone = sentCount > 0 && selected.length === 0 && failedCount === 0;

  return (
    <section className="mt-4 space-y-3" aria-label={t("share.people.title")} data-share-people="">
      <SearchField
        dense
        value={query}
        onChange={setQuery}
        placeholder={t("share.people.search")}
        aria-label={t("share.people.search")}
        clearLabel={t("common.clear")}
        data-share-people-search=""
      />

      <div className="grid grid-cols-4 gap-x-2 gap-y-3" data-share-people-grid="">
        {shown.map((target) => (
          <TargetTile key={target.id} target={target} state={results[target.id]} selected={selected.includes(target.id)} onToggle={() => toggle(target.id)} />
        ))}
        {!searching && (
          <Link
            href={moreHref}
            data-share-people-more=""
            className="flex min-w-0 flex-col items-center gap-1 rounded-md py-1 text-center transition-colors hover:bg-surface-soft"
          >
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-text-secondary">
              <Users size={24} />
            </span>
            <span className="w-full truncate text-caption text-text-secondary">{t("share.people.more")}</span>
          </Link>
        )}
      </div>
      {searching && shown.length === 0 && (
        <p className="py-2 text-center text-small text-text-muted" data-share-people-empty="">
          {t("share.people.noMatch")}{" "}
          <Link href={moreHref} className="font-semibold text-primary underline">
            {t("share.people.more")}
          </Link>
        </p>
      )}
      {!searching && ranked.length === 0 && <p className="text-center text-small text-text-muted">{t("share.people.empty")}</p>}

      {failedCount > 0 && <InlineAlert data-share-people-error="">{t("share.people.failed", { count: failedCount })}</InlineAlert>}
      {allDone && <InlineAlert tone="success" data-share-people-done="">{t("share.people.done", { count: sentCount })}</InlineAlert>}

      {selected.length > 0 ? (
        <form
          className="flex items-center gap-2 border-t border-border-soft pt-3"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
          data-share-people-compose=""
        >
          <Input
            dense
            value={note}
            onChange={(event) => setNote(event.target.value)}
            maxLength={1000}
            placeholder={selected.length === 1 ? t("share.people.noteOne", { name: byId.get(selected[0])?.name ?? "" }) : t("share.people.note")}
            aria-label={t("share.people.note")}
            className="min-w-0 flex-1"
            data-share-people-note=""
          />
          <Button type="submit" size="md" disabled={busy} data-share-people-send="">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            <span>{selected.length > 1 ? t("share.people.sendCount", { count: selected.length }) : t("common.send")}</span>
          </Button>
        </form>
      ) : (
        <div className="border-t border-border-soft pt-3">{actions}</div>
      )}
    </section>
  );
}

function TargetTile({ target, selected, state, onToggle }: { target: ShareTarget; selected: boolean; state: SendState | undefined; onToggle: () => void }) {
  const { t } = useTranslation();
  const sent = state === "sent";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      disabled={sent}
      title={target.name}
      data-share-target={target.id}
      data-share-target-kind={target.kind}
      className={cn("flex min-w-0 flex-col items-center gap-1 rounded-md py-1 text-center transition-colors", !sent && "hover:bg-surface-soft")}
    >
      <span className={cn("relative inline-flex rounded-full", selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface")}>
        {target.kind === "person" ? (
          <Avatar src={target.avatarUrl} alt={target.name} size={56} />
        ) : target.kind === "team" ? (
          <TeamMark name={target.name.split(" · ")[0]} tone={target.tone} size={56} />
        ) : (
          <GroupAvatar name={target.name} avatarUrl={target.avatarUrl} size={56} />
        )}
        {(selected || sent) && (
          <span
            aria-hidden
            className={cn(
              "absolute -bottom-0.5 -right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-surface",
              sent ? "bg-success text-success-foreground" : "bg-primary text-primary-foreground",
            )}
          >
            <Check size={12} />
          </span>
        )}
      </span>
      <span className={cn("w-full truncate text-caption", state === "failed" ? "text-danger" : sent ? "text-success" : "text-text-secondary")}>
        {sent ? t("share.people.sent") : target.name}
      </span>
    </button>
  );
}
