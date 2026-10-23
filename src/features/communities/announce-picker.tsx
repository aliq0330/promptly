"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { AlertCircle, Check, Loader2, Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GroupAvatar } from "@/features/groups/group-avatar";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { listMyCommunities, shareToCommunity, type CommunityPostType, type CommunitySummary } from "@/lib/supabase/communities";
import { cn } from "@/lib/utils";

/** Toplulukta duyuru notu sınırı (sunucu: `community_posts_note_len`). */
export const ANNOUNCE_NOTE_MAX = 500;

export interface AnnounceSelection {
  communityIds: string[];
  note: string;
}

export type AnnounceResult = { communityId: string; name: string; ok: true } | { communityId: string; name: string; ok: false; message: string };

/**
 * İçeriği seçilen topluluklarda duyurur (docs/history/215-*): her topluluk için ayrı `share_to_community` (başvuru gönderisi; içerik
 * kopyalanmaz). Biri başarısız olsa da diğerleri denenir; sonuç topluluk başına döner — sessiz başarı yok.
 */
export async function announceToCommunities(
  type: CommunityPostType,
  contentId: string,
  selection: AnnounceSelection,
  names: Map<string, string>,
): Promise<AnnounceResult[]> {
  const results: AnnounceResult[] = [];
  for (const communityId of selection.communityIds) {
    const name = names.get(communityId) ?? "";
    try {
      await shareToCommunity(communityId, type, contentId, selection.note);
      results.push({ communityId, name, ok: true });
    } catch (err) {
      results.push({ communityId, name, ok: false, message: err instanceof Error ? err.message : "" });
    }
  }
  return results;
}

/** Üye olunan topluluklar (ilk sayfa; kapatılmış olanlar seçilemez). Yetki/kural yine sunucuda denetlenir. */
export function useAnnounceCommunities(enabled: boolean) {
  const { user } = useAuth();
  const [state, setState] = useState<{ status: "idle" | "loading" | "ready" | "error"; list: CommunitySummary[] }>({ status: "idle", list: [] });
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!enabled || !userId) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the request below fills it
    setState({ status: "loading", list: [] });
    listMyCommunities("member")
      .then(({ communities }) => alive && setState({ status: "ready", list: communities }))
      .catch(() => alive && setState({ status: "error", list: [] }));
    return () => {
      alive = false;
    };
  }, [enabled, userId]);
  return state;
}

/**
 * "Topluluklarda duyur" seçicisi: üye olunan topluluklar (çoklu seçim) + isteğe bağlı not. Denetimli bileşen — Paylaş penceresi
 * hemen gönderir (`AnnounceSection`).
 */
export function AnnouncePicker({
  value,
  onChange,
  communities,
  status,
  disabled,
  results,
  hideNote = false,
}: {
  value: AnnounceSelection;
  onChange: (next: AnnounceSelection) => void;
  communities: CommunitySummary[];
  status: "idle" | "loading" | "ready" | "error";
  disabled?: boolean;
  results?: AnnounceResult[] | null;
  /** Not başka bir yerde yazılıyorsa (Alıntıla bölümü ortak notu kendi çizer). */
  hideNote?: boolean;
}) {
  const { t } = useTranslation();
  const resultOf = (id: string) => results?.find((result) => result.communityId === id);

  if (status === "loading" || status === "idle") {
    return (
      <p className="flex items-center gap-2 px-1 py-2 text-small text-text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden /> {t("common.loading")}
      </p>
    );
  }
  if (status === "error") return <p className="px-1 py-2 text-small text-danger">{t("communities.feed.pickLoadError")}</p>;
  if (communities.length === 0) return <p className="px-1 py-2 text-small text-text-muted">{t("share.announce.noCommunities")}</p>;

  function toggle(id: string) {
    const has = value.communityIds.includes(id);
    onChange({ ...value, communityIds: has ? value.communityIds.filter((x) => x !== id) : [...value.communityIds, id] });
  }

  return (
    <div className="space-y-2" data-announce-picker="">
      <ul className="max-h-56 space-y-1.5 overflow-y-auto pr-0.5">
        {communities.map((community) => {
          const checked = value.communityIds.includes(community.id);
          const result = resultOf(community.id);
          const unavailable = community.closed;
          return (
            <li key={community.id}>
              <label
                data-announce-community={community.id}
                className={cn(
                  "flex items-center gap-3 rounded-lg border px-3 py-2 transition-colors",
                  checked ? "border-primary/50 bg-primary-soft" : "border-border-soft bg-background",
                  unavailable || disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-border-strong",
                )}
              >
                <GroupAvatar name={community.name} avatarUrl={community.avatarUrl} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-small font-semibold text-text">{community.name}</span>
                  {result ? (
                    result.ok ? (
                      <span className="flex items-center gap-1 text-caption text-success">
                        <Check size={12} aria-hidden /> {t("share.announce.done")}
                      </span>
                    ) : (
                      <span className="flex items-start gap-1 text-caption text-danger">
                        <AlertCircle size={12} aria-hidden className="mt-0.5 shrink-0" /> {result.message || t("common.actionFailedRetry")}
                      </span>
                    )
                  ) : (
                    <span className="block text-caption text-text-muted">
                      {unavailable ? t("communities.detail.closedNotice") : t("spaces.count.members", { count: community.memberCount })}
                    </span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={unavailable || disabled || Boolean(result?.ok)}
                  onChange={() => toggle(community.id)}
                  className="h-5 w-5 shrink-0 accent-primary"
                />
              </label>
            </li>
          );
        })}
      </ul>
      {!hideNote && (
        <label className="block">
          <span className="sr-only">{t("communities.feed.noteLabel")}</span>
          <textarea
            value={value.note}
            onChange={(event) => onChange({ ...value, note: event.target.value })}
            rows={2}
            maxLength={ANNOUNCE_NOTE_MAX}
            disabled={disabled}
            placeholder={t("share.announce.notePlaceholder")}
            data-announce-note=""
            className="w-full resize-none rounded-lg border border-border bg-surface px-3 py-2 text-small text-text placeholder:text-text-muted focus:border-primary/60 focus:outline-none focus:ring-2 focus:ring-primary/15"
          />
        </label>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Yayın adımında seçilen duyuru (son kontrol → "Topluluklarda da duyur"): içerik oluşunca gönderilir
// ---------------------------------------------------------------------------------------------

const REPORT_KEY = "promptly-announce-report";
const EMPTY_SELECTION: AnnounceSelection = { communityIds: [], note: "" };

// Yayın adımının duyuru seçimi modül deposunda: son kontrol penceresi kapanıp açılsa da seçim kalır; yazma ekranından çıkınca
// (`ComposeShell`) sıfırlanır. Yalnız "Paylaş" anında, içerik herkese açık ve topluluğa ait değilken KURULUR (`armPendingAnnounce`).
let store: { selection: AnnounceSelection; names: Map<string, string> } = { selection: EMPTY_SELECTION, names: new Map() };
let armed = false;
const storeListeners = new Set<() => void>();
function emit() {
  storeListeners.forEach((listener) => listener());
}

/** Yayın adımındaki seçim ve onu değiştiren işlev (adlar sonuç raporu için birlikte saklanır). */
export function useAnnounceSelection(): [AnnounceSelection, (next: AnnounceSelection, names: Map<string, string>) => void] {
  const selection = useSyncExternalStore(
    (listener) => {
      storeListeners.add(listener);
      return () => {
        storeListeners.delete(listener);
      };
    },
    () => store.selection,
    () => EMPTY_SELECTION,
  );
  const set = useCallback((next: AnnounceSelection, names: Map<string, string>) => {
    store = { selection: next, names };
    emit();
  }, []);
  return [selection, set];
}

/** "Paylaş"a basıldı: seçim bu yayında gönderilsin mi (herkese açık + topluluğa ait değil) — değilse hiç gönderilmez. */
export function armPendingAnnounce(on: boolean) {
  armed = on;
}

/** Yazma ekranı kapandı: seçim atılır. */
export function resetPendingAnnounce() {
  store = { selection: EMPTY_SELECTION, names: new Map() };
  armed = false;
  emit();
}

/**
 * İçerik yayınlandıktan sonra (formların `useCommunityReturn` çağrısı) kurulmuş duyuruyu gönderir. Sonuç sayfa değişse de kaybolmasın
 * diye `sessionStorage`'a yazılır, `AnnounceReportNotice` gösterir — kısmi başarısızlık dahil, sessiz başarı yok.
 */
export async function runPendingAnnounce(type: CommunityPostType, contentId: string): Promise<void> {
  const { selection, names } = store;
  const run = armed && selection.communityIds.length > 0;
  resetPendingAnnounce();
  if (!run) return;
  const results = await announceToCommunities(type, contentId, selection, names);
  try {
    sessionStorage.setItem(REPORT_KEY, JSON.stringify(results));
  } catch {
    // Depolama kapalı: rapor gösterilemez, duyurular yine yapıldı.
  }
  window.dispatchEvent(new Event(REPORT_KEY));
}

/** Uygulama kabuğunda: son yayının duyuru sonucu (başarılı topluluklar + nedeniyle başarısız olanlar), kapatılana kadar. */
export function AnnounceReportNotice() {
  const { t } = useTranslation();
  const [results, setResults] = useState<AnnounceResult[] | null>(null);
  useEffect(() => {
    const read = () => {
      try {
        const raw = sessionStorage.getItem(REPORT_KEY);
        setResults(raw ? (JSON.parse(raw) as AnnounceResult[]) : null);
      } catch {
        setResults(null);
      }
    };
    read();
    window.addEventListener(REPORT_KEY, read);
    return () => window.removeEventListener(REPORT_KEY, read);
  }, []);
  if (!results || results.length === 0) return null;
  const ok = results.filter((result) => result.ok);
  const failed = results.filter((result): result is Extract<AnnounceResult, { ok: false }> => !result.ok);
  function dismiss() {
    try {
      sessionStorage.removeItem(REPORT_KEY);
    } catch {
      // yok say
    }
    setResults(null);
  }
  return (
    <div
      role="status"
      data-announce-report=""
      className="fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md animate-pop-in rounded-lg border border-border bg-surface-elevated p-3.5 shadow-pop md:bottom-6"
    >
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full", failed.length > 0 ? "bg-warning/15 text-warning" : "bg-primary-soft text-primary")}>
          {failed.length > 0 ? <AlertCircle size={16} aria-hidden /> : <Megaphone size={16} aria-hidden />}
        </span>
        <div className="min-w-0 flex-1 space-y-1 text-small">
          {ok.length > 0 && <p className="text-text">{t("announceReport.ok", { names: ok.map((result) => result.name).join(", ") })}</p>}
          {failed.length > 0 && (
            <div className="text-text">
              <p className="font-semibold">{t("announceReport.failed")}</p>
              <ul className="mt-0.5 space-y-0.5 text-caption text-text-secondary">
                {failed.map((result) => (
                  <li key={result.communityId}>
                    {result.name}: {result.message || t("common.actionFailedRetry")}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Button type="button" variant="ghost" size="sm" onClick={dismiss} className="shrink-0">
          {t("common.close")}
        </Button>
      </div>
    </div>
  );
}
