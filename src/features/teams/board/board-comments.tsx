"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Check } from "@/components/icons/check";
import { CircleCheck } from "@/components/icons/circle-check";
import { ImageIcon } from "@/components/icons/image-icon";
import { MapPin } from "@/components/icons/map-pin";
import { MessageCircle } from "@/components/icons/message-circle";
import { AtSign } from "@/components/icons/at-sign";
import { Send } from "@/components/icons/send";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { StickyNote } from "@/components/icons/sticky-note";
import { X } from "@/components/icons/x";
import { SpaceMenu } from "@/features/spaces/space-menu";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  createPinComment,
  deletePinComment,
  fetchPinComments,
  setPinResolved,
  updatePinComment,
  type PinComment,
} from "@/lib/supabase/team-board";
import { filterThreads, groupThreads, initialsOf, type CommentFilter, type Thread } from "@/lib/team-board";
import { formatRelativeTime, cn } from "@/lib/utils";
import type { SpaceItem } from "@/lib/supabase/spaces";
import type { ProjectPerson } from "@/lib/supabase/team-projects";

/**
 * Panoda konumlu yorumlar (docs/history/367-*): yükleme + yazma kancası, tuvaldeki pinler, yazma kutusu ve yorum paneli.
 * Yazma sunucudadır (`pin_comment_*` RPC'leri: rol, hız sınırı, bildirim); burası yalnız gösterir ve çağırır.
 */

const TONES = ["bg-primary", "bg-success", "bg-secondary", "bg-danger", "bg-warning"] as const;
export function pinTone(id: string | null): string {
  if (!id) return "bg-text-muted";
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[hash % TONES.length];
}

export function authorName(comment: PinComment, fallback: string): string {
  return comment.author?.displayName || comment.author?.username || fallback;
}

export type CommentsApi = ReturnType<typeof usePinComments>;

const POLL_MS = 45_000;

export function usePinComments(spaceId: string, enabled: boolean) {
  const [comments, setComments] = useState<PinComment[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "failed">("idle");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!enabled) return;
    try {
      const list = await fetchPinComments(spaceId);
      if (alive.current) {
        setComments(list);
        setStatus("ready");
      }
    } catch {
      if (alive.current) setStatus((current) => (current === "ready" ? current : "failed"));
    }
  }, [spaceId, enabled]);

  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- ilk yükleme
    setStatus("loading");
    void reload();
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === "visible" && void reload();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, reload]);

  const threads = useMemo(() => groupThreads(comments), [comments]);
  const run = useCallback(
    async <T,>(action: () => Promise<T>): Promise<T> => {
      const result = await action();
      await reload();
      return result;
    },
    [reload],
  );

  return {
    comments,
    threads,
    status,
    reload,
    add: (input: { body: string; x: number; y: number; itemId: string | null; offX: number | null; offY: number | null }) => run(() => createPinComment({ spaceId, ...input })),
    reply: (parentId: string, body: string) => run(() => createPinComment({ spaceId, body, parentId })),
    edit: (id: string, body: string) => run(() => updatePinComment(id, body)),
    resolve: (id: string, resolved: boolean) => run(() => setPinResolved(id, resolved)),
    remove: (id: string) => run(() => deletePinComment(id)),
  };
}

// ---------------------------------------------------------------------------------------------
// Tuvaldeki pin
// ---------------------------------------------------------------------------------------------

/** Ekran koordinatında pin: kuyruğun ucu (sol alt köşe) konumu gösterir. Yakınlaştırmayla büyümez. */
export function PinMarker({ comment, x, y, active, draft, replies, onSelect }: { comment: PinComment | null; x: number; y: number; active: boolean; draft?: boolean; replies?: number; onSelect?: () => void }) {
  const { t } = useTranslation();
  const resolved = Boolean(comment?.resolvedAt);
  const size = active ? 38 : 30;
  const name = comment ? authorName(comment, t("tb.comments.someone")) : "";
  return (
    <button
      type="button"
      data-board-pin={comment?.id ?? "draft"}
      data-pin-active={active ? "" : undefined}
      aria-label={comment ? t("tb.comments.pinAria", { name }) : t("tb.comments.draftPin")}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect?.();
      }}
      className={cn(
        "pointer-events-auto absolute flex items-center justify-center rounded-[50%_50%_50%_0] border-2 border-surface text-[0.6875rem] font-bold text-primary-foreground shadow-card transition-[width,height,box-shadow]",
        resolved ? "bg-text-muted" : draft ? "bg-primary" : pinTone(comment?.authorId ?? null),
        active && "shadow-pop ring-4 ring-primary/30",
      )}
      style={{ left: x, top: y - size, width: size, height: size, zIndex: active ? 40 : 30 }}
    >
      {resolved ? <Check size={14} strokeWidth={3} aria-hidden /> : draft ? <MessageCircle size={14} aria-hidden /> : initialsOf(name)}
      {!resolved && !draft && replies ? <span className="absolute -right-2 -top-2 grid h-4 min-w-4 place-items-center rounded-full bg-text px-1 text-[0.5625rem] text-background">{replies}</span> : null}
    </button>
  );
}

// ---------------------------------------------------------------------------------------------
// Yazma kutusu
// ---------------------------------------------------------------------------------------------

/** Metin içinde imlecin bulunduğu `@kelime` parçası (öneri için). */
function mentionToken(value: string, caret: number): { start: number; query: string } | null {
  const before = value.slice(0, caret);
  const match = /(^|\s)@([A-Za-z0-9_]{0,30})$/.exec(before);
  return match ? { start: caret - match[2].length - 1, query: match[2].toLowerCase() } : null;
}

export function CommentText({ body }: { body: string }) {
  const parts = body.split(/(@[A-Za-z0-9_]{2,30})/g);
  return (
    <>
      {parts.map((part, index) =>
        /^@[A-Za-z0-9_]{2,30}$/.test(part) ? (
          <span key={index} className="font-semibold text-primary">
            {part}
          </span>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

/** Yorum yazma alanı: `@` önerileri, Gönder / Vazgeç. Hata alanın altında gösterilir (sahte başarı yok). */
export function CommentInput({
  people,
  placeholder,
  submitLabel,
  initial = "",
  autoFocus,
  compact,
  onSubmit,
  onCancel,
}: {
  people: ProjectPerson[];
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  compact?: boolean;
  onSubmit: (body: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initial);
  const [caret, setCaret] = useState(initial.length);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLTextAreaElement>(null);
  const token = mentionToken(value, caret);
  const suggestions = useMemo(() => {
    if (!token) return [];
    return people
      .filter((person) => person.type === "member" && person.username && (person.username.toLowerCase().includes(token.query) || person.name.toLowerCase().includes(token.query)))
      .slice(0, 5);
  }, [people, token]);

  const insertMention = (username: string) => {
    if (!token) return;
    const next = `${value.slice(0, token.start)}@${username} ${value.slice(caret)}`;
    setValue(next);
    const position = token.start + username.length + 2;
    setCaret(position);
    requestAnimationFrame(() => {
      ref.current?.focus();
      ref.current?.setSelectionRange(position, position);
    });
  };
  const startMention = () => {
    const el = ref.current;
    const at = el?.selectionStart ?? value.length;
    const needsSpace = at > 0 && !/\s/.test(value[at - 1] ?? "");
    const next = `${value.slice(0, at)}${needsSpace ? " " : ""}@${value.slice(at)}`;
    setValue(next);
    const position = at + (needsSpace ? 2 : 1);
    setCaret(position);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(position, position);
    });
  };
  const send = async () => {
    const body = value.trim();
    if (!body || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(body);
      setValue("");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2" data-comment-input="">
      <div className="relative">
        <textarea
          ref={ref}
          value={value}
          autoFocus={autoFocus}
          onChange={(event) => {
            setValue(event.target.value);
            setCaret(event.target.selectionStart ?? event.target.value.length);
          }}
          onSelect={(event) => setCaret((event.target as HTMLTextAreaElement).selectionStart ?? 0)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void send();
            }
            event.stopPropagation();
          }}
          maxLength={2000}
          rows={compact ? 2 : 3}
          placeholder={placeholder}
          aria-label={placeholder}
          className="w-full resize-none rounded-xl border-2 border-primary bg-background px-3 py-2 text-body outline-none"
          disabled={busy}
        />
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label={t("tb.comments.mentionList")} className="absolute inset-x-0 top-full z-10 mt-1 overflow-hidden rounded-xl border border-border-soft bg-surface shadow-pop">
            {suggestions.map((person) => (
              <li key={person.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => insertMention(person.username!)} className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-small hover:bg-surface-soft">
                  <Avatar src={person.avatarUrl} alt="" size={24} />
                  <span className="min-w-0 flex-1 truncate font-semibold text-text">{person.name}</span>
                  <span className="text-caption text-text-muted">@{person.username}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {error && (
        <p role="alert" className="text-small text-danger">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        <button type="button" onClick={startMention} aria-label={t("tb.comments.mention")} className="grid h-10 w-10 place-items-center rounded-full border border-border-soft text-text-secondary hover:bg-surface-soft">
          <AtSign size={18} aria-hidden />
        </button>
        <span className="flex-1" />
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy} className="h-10 rounded-full px-4">
            {t("common.cancel")}
          </Button>
        )}
        <Button type="button" onClick={() => void send()} disabled={busy || !value.trim()} className="h-10 gap-1.5 rounded-full px-4" data-comment-send="">
          <Send size={16} aria-hidden />
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Yazma kutusunun başlığı: yazan + hedef (öğe adı ya da "Tuvalde bir nokta"). */
export function CommentTargetChip({ item, itemTitle }: { item: SpaceItem | null; itemTitle: (item: SpaceItem) => string }) {
  const { t } = useTranslation();
  const Icon = item ? (item.kind === "image" ? ImageIcon : item.kind === "prompt" ? SquareTerminal : item.kind === "note" ? StickyNote : MapPin) : MapPin;
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full bg-surface-soft px-2.5 py-0.5 text-caption font-semibold text-text-secondary" data-comment-target="">
      <Icon size={13} aria-hidden />
      <span className="truncate">{item ? itemTitle(item) : t("tb.comments.freePoint")}</span>
    </span>
  );
}

// ---------------------------------------------------------------------------------------------
// Yorum paneli
// ---------------------------------------------------------------------------------------------

export interface PanelThread extends Thread<PinComment> {
  /** "Tüm panolar" kapsamında yorumun panosu (geçerli panoda `null`). */
  boardTitle: string | null;
  boardId: string;
}

export function CommentsPanel({
  threads,
  allScope,
  onScope,
  scopeLoading,
  activeId,
  items,
  itemTitle,
  people,
  myId,
  canModerate,
  canResolve,
  onLocate,
  onNew,
  onClose,
  api,
  className,
}: {
  threads: PanelThread[];
  allScope: boolean;
  onScope: (all: boolean) => void;
  scopeLoading: boolean;
  activeId: string | null;
  items: SpaceItem[];
  itemTitle: (item: SpaceItem) => string;
  people: ProjectPerson[];
  myId: string | null;
  /** Lider başkasının yorumunu silebilir. */
  canModerate: boolean;
  /** Düzenleyici+ başkasının yorumunu çözebilir. */
  canResolve: boolean;
  onLocate: (thread: PanelThread) => void;
  onNew: () => void;
  onClose: () => void;
  api: CommentsApi;
  className?: string;
}) {
  const { t, language } = useTranslation();
  const [filter, setFilter] = useState<CommentFilter>("open");
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const openCount = threads.filter((thread) => !thread.root.resolvedAt).length;
  const resolvedCount = threads.length - openCount;
  const shown = filterThreads(threads, filter) as PanelThread[];
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const guard = async (action: () => Promise<unknown>) => {
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
    }
  };

  return (
    <section aria-label={t("tb.comments.title")} data-testid="board-comments-panel" className={cn("flex min-h-0 flex-col bg-surface", className)}>
      <header className="flex shrink-0 items-center gap-2 px-4 py-3">
        <h2 className="font-display text-h3 font-extrabold text-text">{t("tb.comments.title")}</h2>
        <span className="rounded-full bg-surface-soft px-2 py-0.5 text-caption font-bold text-text-secondary">{threads.length}</span>
        <span className="flex-1" />
        <button type="button" onClick={onNew} data-comment-new="" className="inline-flex h-10 items-center gap-1.5 rounded-full bg-primary-soft px-3.5 text-small font-bold text-primary">
          <MessageCircle size={17} aria-hidden />
          {t("tb.comments.new")}
        </button>
        <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-full text-text-secondary hover:bg-surface-soft">
          <X size={18} aria-hidden />
        </button>
      </header>
      <div className="shrink-0 space-y-2.5 px-4 pb-3">
        <div role="radiogroup" aria-label={t("tb.comments.scope")} className="flex gap-1 rounded-xl bg-surface-soft p-1">
          {[false, true].map((all) => (
            <button
              key={String(all)}
              type="button"
              role="radio"
              aria-checked={allScope === all}
              onClick={() => onScope(all)}
              className={cn("h-9 flex-1 rounded-lg text-small font-semibold", allScope === all ? "bg-surface text-text shadow-xs" : "text-text-secondary")}
            >
              {t(all ? "tb.comments.scopeAll" : "tb.comments.scopeBoard")}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          {(["open", "resolved"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={filter === key}
              onClick={() => setFilter(key)}
              data-comment-filter={key}
              className={cn("h-8 rounded-full border px-3.5 text-small font-semibold", filter === key ? "border-text bg-text text-background" : "border-border-soft text-text-secondary")}
            >
              {t(key === "open" ? "tb.comments.open" : "tb.comments.resolved")} <span className="tabular-nums opacity-80">{key === "open" ? openCount : resolvedCount}</span>
            </button>
          ))}
        </div>
      </div>
      {error && (
        <p role="alert" className="mx-4 mb-2 rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">
          {error}
        </p>
      )}
      <ul className="min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3 pb-4">
        {scopeLoading && <li className="px-2 py-6 text-center text-small text-text-muted">{t("common.loading")}</li>}
        {!scopeLoading && shown.length === 0 && (
          <li className="flex flex-col items-center gap-2 px-4 py-10 text-center" data-testid="board-comments-empty">
            <span className="grid h-14 w-14 place-items-center rounded-full bg-surface-soft text-text-muted">
              <MessageCircle size={24} aria-hidden />
            </span>
            <p className="text-body font-semibold text-text-secondary">{t(filter === "open" ? "tb.comments.emptyOpen" : "tb.comments.emptyResolved")}</p>
          </li>
        )}
        {shown.map((thread) => {
          const { root } = thread;
          const target = root.itemId ? itemsById.get(root.itemId) : undefined;
          const active = activeId === root.id;
          const mine = Boolean(myId && root.authorId === myId);
          const open = expanded.has(root.id) || thread.replies.length <= 1;
          const visibleReplies = open ? thread.replies : thread.replies.slice(-1);
          return (
            <li key={root.id} data-comment-thread={root.id} data-comment-active={active ? "" : undefined} className={cn("space-y-2 rounded-2xl p-3", active ? "border-2 border-primary bg-primary-soft/40" : "border border-border-soft bg-surface")}>
              <div className="flex items-center gap-2.5">
                <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold text-primary-foreground", pinTone(root.authorId))}>{initialsOf(authorName(root, "?"))}</span>
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="truncate text-small font-bold text-text">{authorName(root, t("tb.comments.someone"))}</p>
                  <p className="text-caption text-text-muted">
                    {formatRelativeTime(root.createdAt, language)}
                    {root.editedAt ? ` · ${t("tb.comments.edited")}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onLocate(thread)}
                  aria-label={t("tb.comments.locate")}
                  title={t("tb.comments.locate")}
                  data-comment-locate={root.id}
                  className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", active ? "bg-primary text-primary-foreground" : "bg-surface-soft text-text-secondary hover:text-primary")}
                >
                  <MapPin size={18} aria-hidden />
                </button>
                {(mine || canResolve) && (
                  <button
                    type="button"
                    onClick={() => void guard(() => api.resolve(root.id, !root.resolvedAt))}
                    aria-label={t(root.resolvedAt ? "tb.comments.reopen" : "tb.comments.resolve")}
                    title={t(root.resolvedAt ? "tb.comments.reopen" : "tb.comments.resolve")}
                    data-comment-resolve={root.id}
                    className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full hover:bg-surface-soft", root.resolvedAt ? "text-success" : "text-text-secondary")}
                  >
                    <CircleCheck size={19} aria-hidden />
                  </button>
                )}
                {(mine || canModerate) && (
                  <SpaceMenu
                    label={t("tb.comments.more")}
                    items={[
                      { key: "edit", label: t("tb.comments.edit"), icon: StickyNote, onSelect: () => setEditing(root.id), hidden: !mine },
                      { key: "delete", label: t("tb.comments.delete"), icon: X, danger: true, onSelect: () => void guard(() => api.remove(root.id)) },
                    ]}
                  />
                )}
              </div>
              {thread.boardTitle && <p className="text-caption font-semibold text-primary">{thread.boardTitle}</p>}
              <CommentTargetChip item={target ?? null} itemTitle={itemTitle} />
              {editing === root.id ? (
                <CommentInput
                  people={people}
                  placeholder={t("tb.comments.placeholder")}
                  submitLabel={t("common.save")}
                  initial={root.body}
                  autoFocus
                  compact
                  onSubmit={async (body) => {
                    await api.edit(root.id, body);
                    setEditing(null);
                  }}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <p className="whitespace-pre-wrap break-words text-body text-text">
                  <CommentText body={root.body} />
                </p>
              )}
              {thread.replies.length > 1 && !open && (
                <button type="button" onClick={() => setExpanded((set) => new Set(set).add(root.id))} className="text-small font-semibold text-text-secondary">
                  {t("tb.comments.showReplies", { count: thread.replies.length })}
                </button>
              )}
              {visibleReplies.length > 0 && (
                <ul className="space-y-2 border-l-2 border-border-soft pl-3">
                  {visibleReplies.map((reply) => (
                    <li key={reply.id} className="space-y-0.5" data-comment-reply={reply.id}>
                      <p className="text-caption text-text-muted">
                        <span className="font-semibold text-text-secondary">{authorName(reply, t("tb.comments.someone"))}</span> · {formatRelativeTime(reply.createdAt, language)}
                      </p>
                      <p className="whitespace-pre-wrap break-words text-small text-text">
                        <CommentText body={reply.body} />
                      </p>
                      {(myId === reply.authorId || canModerate) && (
                        <button type="button" onClick={() => void guard(() => api.remove(reply.id))} className="text-caption font-semibold text-text-muted hover:text-danger">
                          {t("tb.comments.delete")}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              {replyTo === root.id ? (
                <CommentInput
                  people={people}
                  placeholder={t("tb.comments.replyPlaceholder")}
                  submitLabel={t("tb.comments.reply")}
                  autoFocus
                  compact
                  onSubmit={async (body) => {
                    await api.reply(root.id, body);
                    setReplyTo(null);
                    setExpanded((set) => new Set(set).add(root.id));
                  }}
                  onCancel={() => setReplyTo(null)}
                />
              ) : (
                <div className="flex items-center gap-3 text-small font-semibold">
                  <span className="text-text-secondary">{thread.replies.length > 0 ? t("tb.comments.replies", { count: thread.replies.length }) : t("tb.comments.noReplies")}</span>
                  <button type="button" onClick={() => setReplyTo(root.id)} className="text-primary" data-comment-reply-open={root.id}>
                    {t("tb.comments.reply")}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** "Yeri göster" sonrası telefonda alttaki tek yorum kartı: önceki/sonraki ve listeye dönüş. */
export function CommentPeek({
  thread,
  index,
  total,
  onPrev,
  onNext,
  onList,
  itemTitle,
  items,
}: {
  thread: PanelThread;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  onList: () => void;
  itemTitle: (item: SpaceItem) => string;
  items: SpaceItem[];
}) {
  const { t, language } = useTranslation();
  const root = thread.root;
  const target = root.itemId ? (items.find((item) => item.id === root.itemId) ?? null) : null;
  return (
    <div data-testid="board-comment-peek" className="pointer-events-auto w-full space-y-2.5 rounded-2xl border border-border-soft bg-surface p-3.5 shadow-pop">
      <div className="flex items-center gap-2.5">
        <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full text-[0.6875rem] font-bold text-primary-foreground", pinTone(root.authorId))}>{initialsOf(authorName(root, "?"))}</span>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-small font-bold text-text">{authorName(root, t("tb.comments.someone"))}</p>
          <p className="text-caption text-text-muted">{formatRelativeTime(root.createdAt, language)}</p>
        </div>
        <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-primary-foreground">
          <MapPin size={18} aria-hidden />
        </span>
      </div>
      <CommentTargetChip item={target} itemTitle={itemTitle} />
      <p className="line-clamp-3 whitespace-pre-wrap break-words text-body text-text">
        <CommentText body={root.body} />
      </p>
      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onPrev} aria-label={t("tb.comments.prev")} disabled={total < 2} className="grid h-11 w-11 place-items-center rounded-full border border-border-soft disabled:opacity-40">
          <span aria-hidden className="text-h3">‹</span>
        </button>
        <span className="px-1.5 text-small font-bold tabular-nums text-text-secondary">
          {index + 1} / {total}
        </span>
        <button type="button" onClick={onNext} aria-label={t("tb.comments.next")} disabled={total < 2} className="grid h-11 w-11 place-items-center rounded-full border border-border-soft disabled:opacity-40">
          <span aria-hidden className="text-h3">›</span>
        </button>
        <span className="flex-1" />
        <button type="button" onClick={onList} className="h-11 rounded-full bg-primary-soft px-4 text-small font-bold text-primary">
          {t("tb.comments.backToList")}
        </button>
      </div>
    </div>
  );
}

