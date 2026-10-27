"use client";

import { useState, type FormEvent } from "react";
import { CalendarDays, CalendarX, Check, CircleHelp, ExternalLink, MapPin, Pencil, Plus, Trash2, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Tabs } from "@/components/ui/tabs";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useAsyncAction } from "@/features/groups/use-async-action";
import type { CommunityTabProps } from "./community-page";
import {
  cancelCommunityEvent,
  createCommunityEvent,
  deleteCommunityEvent,
  fetchCommunityEventsWindow,
  setEventRsvp,
  updateCommunityEvent,
  type CommunityEvent,
} from "@/lib/supabase/communities";
import { can } from "@/lib/chat-groups";
import {
  browserTimeZone,
  canRsvp,
  COMMUNITY_EVENT_DESCRIPTION_MAX,
  COMMUNITY_EVENT_LOCATION_MAX,
  COMMUNITY_EVENT_URL_MAX,
  COMMUNITY_TITLE_MAX,
  eventPhase,
  EVENT_REMINDER_WINDOW_HOURS,
  formatEventRange,
  isoToZonedLocal,
  timezoneOptions,
  validateEventInput,
  zonedLocalToIso,
  type EventFieldProblem,
  type RsvpStatus,
} from "@/lib/communities";
import { useGrowingList } from "@/features/content/use-growing-list";
import { LoadMore } from "@/features/feed/load-more";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";

type Scope = "upcoming" | "past";

/**
 * Etkinlikler: ad, açıklama, başlangıç/bitiş (etkinliğin SAAT DİLİMİNDE duvar saati olarak girilir ve kaydedilir; herkes kendi
 * okuma dilinde ama etkinliğin saat diliminde görür), yer ve/veya çevrim içi bağlantı, "Katılacağım · Belki · Katılmayacağım", katılımcı
 * sayıları ve 24 saat kala hatırlatma (uygulama açılışında). Oluşturma/düzenleme/iptal `manage_events` yeteneğiyle; yalnız üye cevap verir.
 */
export function EventsTab({ group, role, viewerId, onToast, reload }: CommunityTabProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<Scope>("upcoming");
  const [editing, setEditing] = useState<CommunityEvent | "new" | null>(null);
  const [confirm, setConfirm] = useState<{ kind: "cancel" | "delete"; event: CommunityEvent } | null>(null);
  const confirmAction = useAsyncAction();
  const rsvpAction = useAsyncAction();
  const canManage = can(role, "manage_events", group.rolePermissions) && !group.closedAt;

  // İlk 50 etkinlik; devamı kaydırınca (eskiden 50'de kesiliyordu — geçmiş etkinliklere ulaşılamıyordu).
  const list = useGrowingList(`${group.id}|${role ? viewerId : ""}|${scope}`, (limit) => fetchCommunityEventsWindow(group.id, role ? viewerId : null, scope, limit));
  const events = list.items;
  const loadError = list.failed && events !== null && events.length === 0;
  const load = list.reload;

  async function rsvp(event: CommunityEvent, status: RsvpStatus) {
    const next = event.myRsvp === status ? "none" : status;
    const ok = await rsvpAction.run(async () => {
      await setEventRsvp(event.id, next);
      return true;
    });
    if (ok) {
      onToast(next === "none" ? t("communities.events.rsvpClearedToast") : t("communities.events.rsvpSavedToast"));
      await load();
    }
  }

  async function runConfirm() {
    if (!confirm) return;
    const { kind, event } = confirm;
    const ok = await confirmAction.run(async () => {
      if (kind === "cancel") await cancelCommunityEvent(event.id);
      else await deleteCommunityEvent(event.id);
      return true;
    });
    if (!ok) return;
    setConfirm(null);
    onToast(kind === "cancel" ? t("communities.events.cancelledToast") : t("communities.events.deletedToast"));
    await load();
    await reload();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="segmented"
          ariaLabel={t("communities.events.scopeAria")}
          active={scope}
          onChange={setScope}
          items={[
            { key: "upcoming", label: t("communities.events.upcoming") },
            { key: "past", label: t("communities.events.past") },
          ]}
        />
        {canManage && (
          <Button type="button" size="sm" onClick={() => setEditing("new")}>
            <Plus size={14} /> {t("communities.events.create")}
          </Button>
        )}
      </div>
      {role && <p className="text-caption text-text-muted">{t("communities.events.reminderNote", { hours: EVENT_REMINDER_WINDOW_HOURS })}</p>}
      {rsvpAction.error && (
        <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          {rsvpAction.error}
        </p>
      )}

      {loadError ? (
        <div className="space-y-3 rounded-xl border border-border-soft bg-surface px-6 py-10 text-center">
          <p role="alert" className="text-small text-danger">
            {t("communities.events.loadError")}
          </p>
          <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
            {t("common.retry")}
          </Button>
        </div>
      ) : events === null || list.loading ? (
        <ul className="space-y-3" aria-busy="true">
          {[0, 1].map((i) => (
            <li key={i} className="h-32 animate-pulse rounded-xl border border-border-soft bg-surface-soft" />
          ))}
        </ul>
      ) : events.length === 0 ? (
        <EmptyState
          icon={CalendarDays}
          title={scope === "upcoming" ? t("communities.events.emptyUpcoming") : t("communities.events.emptyPast")}
          description={scope === "upcoming" && canManage ? t("communities.events.emptyHelpManage") : undefined}
        />
      ) : (
        <ul className="space-y-3">
          {events.map((event) => (
            <EventCard
              key={event.id}
              event={event}
              isMember={Boolean(role)}
              canManage={canManage}
              busy={rsvpAction.busy}
              onRsvp={(status) => void rsvp(event, status)}
              onEdit={() => setEditing(event)}
              onCancel={() => setConfirm({ kind: "cancel", event })}
              onDelete={() => setConfirm({ kind: "delete", event })}
            />
          ))}
        </ul>
      )}
      {events !== null && events.length > 0 && (
        <LoadMore failed={list.failed} hasMore={list.hasMore} loadingMore={list.loadingMore} onLoadMore={list.grow} />
      )}

      {editing && (
        <EventFormModal
          groupId={group.id}
          event={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={async (message) => {
            setEditing(null);
            onToast(message);
            await load();
            await reload();
          }}
        />
      )}
      {confirm && (
        <ConfirmDialog
          id="event-confirm-title"
          title={confirm.kind === "cancel" ? t("communities.events.cancelTitle") : t("communities.events.deleteTitle")}
          body={confirm.kind === "cancel" ? t("communities.events.cancelBody") : t("communities.events.deleteBody")}
          confirmLabel={confirm.kind === "cancel" ? t("communities.events.cancelConfirm") : t("common.delete")}
          danger
          busy={confirmAction.busy}
          error={confirmAction.error}
          onConfirm={() => void runConfirm()}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}

function EventCard({
  event,
  isMember,
  canManage,
  busy,
  onRsvp,
  onEdit,
  onCancel,
  onDelete,
}: {
  event: CommunityEvent;
  isMember: boolean;
  canManage: boolean;
  busy: boolean;
  onRsvp: (status: RsvpStatus) => void;
  onEdit: () => void;
  onCancel: () => void;
  onDelete: () => void;
}) {
  const { t, language } = useTranslation();
  const phase = eventPhase(event);
  const options: { status: RsvpStatus; label: string; icon: React.ReactNode }[] = [
    { status: "going", label: t("communities.events.going"), icon: <Check size={14} /> },
    { status: "maybe", label: t("communities.events.maybe"), icon: <CircleHelp size={14} /> },
    { status: "not_going", label: t("communities.events.notGoing"), icon: <X size={14} /> },
  ];
  return (
    <li className="space-y-3 rounded-xl border border-border-soft bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="flex flex-wrap items-center gap-2 break-words text-sm font-semibold text-text">
            {event.title}
            {phase === "live" && <Badge variant="success">{t("communities.events.live")}</Badge>}
            {phase === "cancelled" && <Badge variant="danger">{t("communities.events.cancelled")}</Badge>}
            {phase === "past" && <Badge variant="neutral">{t("communities.events.ended")}</Badge>}
          </h3>
          <p className="flex items-center gap-1.5 text-small text-text-secondary">
            <CalendarDays size={14} aria-hidden /> {formatEventRange(event.startsAt, event.endsAt, event.timezone, language)}
            <span className="text-caption text-text-muted">({event.timezone})</span>
          </p>
          {event.location && (
            <p className="flex items-center gap-1.5 text-small text-text-secondary">
              <MapPin size={14} aria-hidden /> <span className="break-words">{event.location}</span>
            </p>
          )}
          {event.onlineUrl && (
            <a href={event.onlineUrl} target="_blank" rel="noopener noreferrer nofollow" className="inline-flex items-center gap-1.5 break-all text-small text-primary hover:underline">
              <ExternalLink size={14} aria-hidden /> {t("communities.events.joinOnline")}
            </a>
          )}
        </div>
        {canManage && phase !== "past" && (
          <div className="flex shrink-0 gap-1">
            {phase !== "cancelled" && (
              <button type="button" onClick={onEdit} aria-label={t("common.edit")} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
                <Pencil size={15} />
              </button>
            )}
            {phase !== "cancelled" && (
              <button type="button" onClick={onCancel} aria-label={t("communities.events.cancelConfirm")} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
                <CalendarX size={15} />
              </button>
            )}
            <button type="button" onClick={onDelete} aria-label={t("common.delete")} className="flex h-8 w-8 items-center justify-center rounded-md text-text-muted hover:bg-danger/10 hover:text-danger">
              <Trash2 size={15} />
            </button>
          </div>
        )}
      </div>
      {event.description && <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{event.description}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-caption text-text-muted">
          {t("communities.events.counts", { going: event.goingCount, maybe: event.maybeCount })}
        </p>
        {isMember && canRsvp(phase) && (
          <div role="group" aria-label={t("communities.events.rsvpAria")} className="flex flex-wrap gap-1.5">
            {options.map((option) => (
              <button
                key={option.status}
                type="button"
                disabled={busy}
                aria-pressed={event.myRsvp === option.status}
                onClick={() => onRsvp(option.status)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-label font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-60",
                  event.myRsvp === option.status ? "border-primary/50 bg-primary-soft text-primary" : "border-border bg-surface text-text-secondary hover:border-border-strong",
                )}
              >
                {option.icon} {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </li>
  );
}

function EventFormModal({ groupId, event, onClose, onSaved }: { groupId: string; event: CommunityEvent | null; onClose: () => void; onSaved: (message: string) => void | Promise<void> }) {
  const { t } = useTranslation();
  const { busy, error, run } = useAsyncAction();
  const initialTz = event?.timezone ?? browserTimeZone();
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [timezone, setTimezone] = useState(initialTz);
  const [start, setStart] = useState(event ? isoToZonedLocal(event.startsAt, initialTz) : "");
  const [end, setEnd] = useState(event?.endsAt ? isoToZonedLocal(event.endsAt, initialTz) : "");
  const [location, setLocation] = useState(event?.location ?? "");
  const [onlineUrl, setOnlineUrl] = useState(event?.onlineUrl ?? "");
  const [notify, setNotify] = useState(true);
  const [touched, setTouched] = useState(false);

  const startsAtIso = start ? zonedLocalToIso(start, timezone) : null;
  const endsAtIso = end ? zonedLocalToIso(end, timezone) : null;
  const problems: EventFieldProblem[] = validateEventInput({
    title,
    description,
    startsAtIso,
    endsAtIso: end ? endsAtIso : null,
    timezone,
    location,
    onlineUrl,
    // Düzenlemede başlangıç değişmediyse geçmişte olabilir (başlığı düzeltmek için); sunucu aynı kuralı uygular.
    mustBeFuture: !event || startsAtIso !== event.startsAt,
  });
  if (end && !endsAtIso && !problems.includes("time")) problems.push("time");
  const has = (problem: EventFieldProblem) => touched && problems.includes(problem);

  async function submit(submitEvent: FormEvent) {
    submitEvent.preventDefault();
    setTouched(true);
    if (problems.length > 0 || !startsAtIso) return;
    const input = { title, description, startsAtIso, endsAtIso: end ? endsAtIso : null, timezone, location, onlineUrl };
    const ok = await run(async () => {
      if (event) await updateCommunityEvent(event.id, input);
      else await createCommunityEvent(groupId, input, notify);
      return true;
    });
    if (ok) await onSaved(event ? t("communities.events.updatedToast") : t("communities.events.createdToast"));
  }

  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy="event-form-title">
      <form onSubmit={submit} noValidate className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-lg border border-border bg-surface shadow-lg" onClick={(e) => e.stopPropagation()}>
        <div className="px-5 pb-2 pt-5">
          <h2 id="event-form-title" className="text-base font-semibold text-text">
            {event ? t("communities.events.editTitle") : t("communities.events.newTitle")}
          </h2>
        </div>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4">
          <div>
            <label htmlFor="event-title" className={fieldLabelClassName}>
              {t("communities.events.titleLabel")}
            </label>
            <input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={COMMUNITY_TITLE_MAX + 20} disabled={busy} aria-invalid={has("title")} className={fieldInputClassName} />
            {has("title") && <p className="mt-1 text-caption text-danger">{t("communities.events.titleInvalid", { max: COMMUNITY_TITLE_MAX })}</p>}
          </div>
          <div>
            <label htmlFor="event-description" className={fieldLabelClassName}>
              {t("communities.events.descriptionLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <textarea id="event-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} disabled={busy} aria-invalid={has("description")} className={`${fieldControlClassName} resize-none py-2.5`} />
            <p className={has("description") ? "mt-1 text-caption text-danger" : "mt-1 text-caption text-text-muted"}>{`${[...description.trim()].length}/${COMMUNITY_EVENT_DESCRIPTION_MAX}`}</p>
          </div>
          <div>
            <label htmlFor="event-timezone" className={fieldLabelClassName}>
              {t("communities.events.timezoneLabel")}
            </label>
            <select id="event-timezone" value={timezone} onChange={(e) => setTimezone(e.target.value)} disabled={busy} className={fieldInputClassName}>
              {timezoneOptions(timezone).map((tz) => (
                <option key={tz} value={tz}>
                  {tz}
                </option>
              ))}
            </select>
            <p className="mt-1 text-caption text-text-muted">{t("communities.events.timezoneHelp")}</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="event-start" className={fieldLabelClassName}>
                {t("communities.events.startLabel")}
              </label>
              <input id="event-start" type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} disabled={busy} aria-invalid={has("time")} className={fieldInputClassName} />
            </div>
            <div>
              <label htmlFor="event-end" className={fieldLabelClassName}>
                {t("communities.events.endLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
              </label>
              <input id="event-end" type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} disabled={busy} aria-invalid={has("time")} className={fieldInputClassName} />
            </div>
          </div>
          {has("time") && <p className="-mt-2 text-caption text-danger">{t("communities.events.timeInvalid")}</p>}
          <div>
            <label htmlFor="event-location" className={fieldLabelClassName}>
              {t("communities.events.locationLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <input id="event-location" value={location} onChange={(e) => setLocation(e.target.value)} maxLength={COMMUNITY_EVENT_LOCATION_MAX + 20} disabled={busy} aria-invalid={has("location")} className={fieldInputClassName} />
          </div>
          <div>
            <label htmlFor="event-url" className={fieldLabelClassName}>
              {t("communities.events.urlLabel")} <span className="font-normal text-text-muted">({t("common.optional")})</span>
            </label>
            <input id="event-url" type="url" inputMode="url" value={onlineUrl} onChange={(e) => setOnlineUrl(e.target.value)} maxLength={COMMUNITY_EVENT_URL_MAX + 20} placeholder="https://" disabled={busy} aria-invalid={has("url")} className={fieldInputClassName} />
            {has("url") && <p className="mt-1 text-caption text-danger">{t("communities.events.urlInvalid")}</p>}
          </div>
          {!event && (
            <label className="flex cursor-pointer items-start gap-2 text-small text-text">
              <input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} disabled={busy} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>{t("communities.events.notifyLabel")}</span>
            </label>
          )}
          {error && (
            <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
              {error}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-border-soft px-5 py-3">
          <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? t("common.loading") : event ? t("common.save") : t("communities.events.create")}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
