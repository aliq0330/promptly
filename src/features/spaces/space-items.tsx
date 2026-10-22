"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { Check, Copy, ExternalLink, Layers, Loader2, Lock, MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { ImageLightbox } from "@/components/ui/image-lightbox";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { resolveToolRefs } from "@/lib/ai-tool-catalog";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime, presetHref, profileHref, promptHref, requestHref, workflowHref } from "@/lib/utils";
import { boundsOf, placeMany, topZ } from "@/lib/space-board";
import {
  defaultItemSize,
  SPACE_COLORS,
  SPACE_GROUP_NAME_MAX,
  SPACE_ITEM_BODY_MAX,
  SPACE_ITEM_NOTE_MAX,
  SPACE_ITEM_TITLE_MAX,
  sourceStateOf,
  type SourceState,
  type SpaceColor,
  type SpaceItemKind,
} from "@/lib/spaces";
import { createSpaceGroup, deleteSpaceGroup, updateSpaceGroup, type NewSpaceItem, type SpaceItem, type SpaceSources } from "@/lib/supabase/spaces";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { Preset, Prompt, PromptRequest, Workflow } from "@/types";
import { useSpaceContext } from "./space-provider";
import { FormError, SubmitButton } from "./space-forms";
import { SpaceDialog } from "./space-modals";
import { SPACE_COLOR_CLASS, SpaceImage } from "./space-visuals";

/*
 * Space öğelerinin ortak parçaları (docs/history/213-*): kaynak çözümü (okuyucunun kendi yetkisiyle), ayrıntı penceresi, not ve
 * prompt taslağı düzenleyicileri, grup yöneticisi, yeni öğe yerleşimi. Görseller/Promptlar/Notlar sekmeleri ve pano bunları paylaşır.
 */

export interface ResolvedSource {
  state: SourceState;
  prompt: Prompt | null;
  request: PromptRequest | null;
  workflow: Workflow | null;
  preset: Preset | null;
  /** Kaynağın detay adresi (yalnız okunabiliyorsa). */
  href: string | null;
  title: string;
}

export function resolveSource(item: SpaceItem, sources: SpaceSources, readable: (id: string) => boolean): ResolvedSource {
  const state = sourceStateOf(item, readable);
  const prompt = item.promptId ? (sources.prompts.get(item.promptId) ?? null) : null;
  const request = item.contentType === "request" && item.contentId ? (sources.requests.get(item.contentId) ?? null) : null;
  const workflow = item.contentType === "workflow" && item.contentId ? (sources.workflows.get(item.contentId) ?? null) : null;
  const preset = item.contentType === "preset" && item.contentId ? (sources.presets.get(item.contentId) ?? null) : null;
  const href = prompt ? promptHref(prompt) : request ? requestHref(request) : workflow ? workflowHref(workflow) : preset ? presetHref(preset) : null;
  const title = item.title || prompt?.title || request?.title || workflow?.title || preset?.title || "";
  return { state, prompt, request, workflow, preset, href, title };
}

const UNAVAILABLE_KEY: Record<SourceState, TranslationKey | null> = {
  own: null,
  ok: null,
  unavailable: "spaces.source.unavailable",
  deleted: "spaces.source.deleted",
};

export function sourceReasonKey(state: SourceState): TranslationKey | null {
  return UNAVAILABLE_KEY[state];
}

/** Bir öğenin görünen adı (kullanıcının başlığı › kaynağın başlığı › tür adı). */
export function useItemTitle() {
  const { t } = useTranslation();
  const { sources, readable } = useSpaceContext();
  return (item: SpaceItem) => {
    const resolved = resolveSource(item, sources, readable);
    if (resolved.title) return resolved.title;
    if (resolved.state === "unavailable" || resolved.state === "deleted") return t(sourceReasonKey(resolved.state)!);
    return t(ITEM_KIND_LABEL[item.kind]);
  };
}

export const ITEM_KIND_LABEL: Record<SpaceItemKind, TranslationKey> = {
  image: "spaces.item.image",
  prompt: "spaces.item.prompt",
  note: "spaces.item.note",
  palette: "spaces.item.palette",
  content: "spaces.item.content",
};

/**
 * Panoya dokunmadan (sekmelerden) eklenen öğelerin yeri: mevcut içeriğin ortası çevresinde ilk boş yerler; z en üstte.
 * Pano açıkken eklenenler görünümün ortasına konur (pano kendi `near`'ını verir).
 */
export function usePlaceNewItems() {
  const { items } = useSpaceContext();
  return (drafts: Omit<NewSpaceItem, "x" | "y" | "w" | "h">[], near?: { x: number; y: number }, sizes?: { w: number; h: number }[]): NewSpaceItem[] => {
    const b = boundsOf(items);
    const center = near ?? (b ? { x: b.x + b.w / 2, y: b.y + b.h / 2 } : { x: 0, y: 0 });
    const resolvedSizes = drafts.map((draft, index) => sizes?.[index] ?? defaultItemSize(draft.kind, { width: draft.mediaWidth ?? null, height: draft.mediaHeight ?? null }));
    const spots = placeMany(items, resolvedSizes, center);
    const z = topZ(items);
    return drafts.map((draft, index) => ({ ...draft, ...spots[index], ...resolvedSizes[index], z: z + index + 1 }));
  };
}

export function CopyTextButton({ text, label, className, size = "sm" }: { text: string; label?: string; className?: string; size?: "sm" | "md" }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "copied" | "failed">("idle");
  return (
    <Button
      type="button"
      variant="outline"
      size={size}
      className={className}
      onClick={async (event) => {
        event.stopPropagation();
        try {
          await navigator.clipboard.writeText(text);
          setState("copied");
        } catch {
          setState("failed");
        }
        setTimeout(() => setState("idle"), 1500);
      }}
    >
      {state === "copied" ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}
      {state === "copied" ? t("common.copied") : state === "failed" ? t("spaces.share.copyFailed") : (label ?? t("common.copy"))}
    </Button>
  );
}

function GroupSelect({ value, onChange, disabled, id }: { value: string | null; onChange: (value: string | null) => void; disabled?: boolean; id?: string }) {
  const { t } = useTranslation();
  const { groups } = useSpaceContext();
  return (
    <select
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
      className={cn(fieldInputClassName, "h-10")}
    >
      <option value="">{t("spaces.groups.none")}</option>
      {groups.map((group) => (
        <option key={group.id} value={group.id}>
          {group.name}
        </option>
      ))}
    </select>
  );
}

/**
 * Görsel / prompt / içerik öğesinin ayrıntısı: büyük önizleme (görselde ışık kutusu), kaynak gönderi, üretici, prompt metni,
 * paylaşılmayan alanlar ("paylaşılmamış" — uydurulmaz), araç/model, proje notu, grup; düzenleyiciye "Panoda göster" ve "Kaldır".
 */
export function ItemDetailModal({ itemId, onClose, onShowOnBoard }: { itemId: string; onClose: () => void; onShowOnBoard?: (id: string) => void }) {
  const { t, language } = useTranslation();
  const { items, sources, readable, caps, patchItem, removeItems, addItems, groups } = useSpaceContext();
  const place = usePlaceNewItems();
  const item = items.find((entry) => entry.id === itemId) ?? null;
  const [note, setNote] = useState(item?.note ?? "");
  const [caption, setCaption] = useState(item?.title ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lightbox, setLightbox] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const noteId = useId();
  const captionId = useId();
  const groupId = useId();

  if (!item) return null;
  const source = resolveSource(item, sources, readable);
  const prompt = source.prompt;
  const tools = prompt ? resolveToolRefs(prompt.tools.length ? prompt.tools : prompt.tool ? [prompt.tool] : []) : [];
  const reason = sourceReasonKey(source.state);
  const imageAvailable = item.kind === "image" && (source.state === "own" || source.state === "ok");
  const group = groups.find((entry) => entry.id === item.groupId) ?? null;
  const dirty = note !== item.note || caption !== item.title;

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await patchItem(itemId, { note, title: caption });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function copyAsDraft() {
    if (!prompt) return;
    setBusy(true);
    setError(null);
    try {
      await addItems(place([{ spaceId: item!.spaceId, kind: "prompt", isDraft: true, sourcePromptId: prompt.id, title: prompt.title, body: prompt.promptText }]));
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SpaceDialog title={source.title || t(ITEM_KIND_LABEL[item.kind])} onClose={onClose} wide busy={busy}>
      <div className="space-y-5" data-testid="item-detail" data-item-id={item.id}>
        {item.kind === "image" && (
          <button
            type="button"
            onClick={() => imageAvailable && setLightbox(true)}
            disabled={!imageAvailable}
            aria-label={t("media.viewFullscreen")}
            className="block w-full overflow-hidden rounded-lg bg-surface-soft"
          >
            <SpaceImage
              url={item.mediaUrl}
              alt={source.title}
              available={imageAvailable}
              reason={reason ? t(reason) : undefined}
              className="h-[min(52dvh,420px)] w-full"
              imgClassName="object-contain"
            />
          </button>
        )}

        {reason && <p className="rounded-md bg-surface-soft px-3 py-2 text-small text-text-secondary">{t(reason)}</p>}

        {source.href && (
          <div className="flex flex-wrap items-center gap-3">
            {(prompt?.author ?? source.request?.author) && (
              <Link href={profileHref((prompt?.author ?? source.request?.author)!)} className="flex items-center gap-2 text-small text-text-secondary hover:text-text">
                <Avatar src={(prompt?.author ?? source.request?.author)!.avatarUrl} alt="" size={24} />
                {(prompt?.author ?? source.request?.author)!.displayName}
              </Link>
            )}
            <Link href={source.href} className="inline-flex items-center gap-1 text-small font-semibold text-primary hover:underline">
              {t("spaces.source.open")}
              <ExternalLink size={14} aria-hidden />
            </Link>
          </div>
        )}

        {prompt && (item.kind === "image" || (item.kind === "prompt" && !item.isDraft)) && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-label font-semibold text-text">{t("spaces.detail.prompt")}</h3>
              <div className="flex gap-2">
                {caps.edit && (
                  <Button type="button" variant="ghost" size="sm" onClick={() => void copyAsDraft()} disabled={busy}>
                    <Pencil size={14} aria-hidden />
                    {t("spaces.prompts.copyAsDraft")}
                  </Button>
                )}
                {prompt.promptText && <CopyTextButton text={prompt.promptText} />}
              </div>
            </div>
            {prompt.promptText ? (
              <pre className="prompt-text max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-soft p-3 text-small text-text">{prompt.promptText}</pre>
            ) : (
              <p className="text-small text-text-muted">{t("spaces.detail.notShared")}</p>
            )}
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-small">
              <dt className="text-text-muted">{t("spaces.detail.negative")}</dt>
              <dd className="text-text-secondary">{t("spaces.detail.notShared")}</dd>
              <dt className="text-text-muted">{t("spaces.detail.model")}</dt>
              <dd className="text-text-secondary">{tools.length ? tools.map((tool) => tool.label).join(", ") : t("spaces.detail.notShared")}</dd>
              <dt className="text-text-muted">{t("spaces.detail.params")}</dt>
              <dd className="text-text-secondary">{t("spaces.detail.notShared")}</dd>
            </dl>
          </section>
        )}

        {item.kind === "prompt" && item.isDraft && (
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-label font-semibold text-text">{t("spaces.prompts.myDraft")}</h3>
              {item.body && <CopyTextButton text={item.body} />}
            </div>
            <pre className="prompt-text max-h-56 overflow-y-auto whitespace-pre-wrap break-words rounded-md bg-surface-soft p-3 text-small text-text">{item.body}</pre>
            {item.sourcePromptId && (
              <p className="text-caption text-text-muted">
                {sources.prompts.get(item.sourcePromptId) ? (
                  <Link href={promptHref({ id: item.sourcePromptId })} className="hover:underline">
                    {t("spaces.prompts.basedOn", { title: sources.prompts.get(item.sourcePromptId)!.title })}
                  </Link>
                ) : (
                  t("spaces.prompts.basedOnUnavailable")
                )}
              </p>
            )}
          </section>
        )}

        <section className="space-y-3">
          {caps.edit ? (
            <>
              <div>
                <label htmlFor={captionId} className={fieldLabelClassName}>
                  {t("spaces.detail.caption")}
                </label>
                <input id={captionId} value={caption} onChange={(event) => setCaption(event.target.value)} maxLength={SPACE_ITEM_TITLE_MAX} className={fieldInputClassName} placeholder={source.title} />
              </div>
              <div>
                <label htmlFor={noteId} className={fieldLabelClassName}>
                  {t("spaces.detail.projectNote")}
                </label>
                <textarea id={noteId} value={note} onChange={(event) => setNote(event.target.value)} maxLength={SPACE_ITEM_NOTE_MAX} rows={3} className={cn(fieldControlClassName, "py-2.5")} placeholder={t("spaces.detail.projectNotePlaceholder")} />
              </div>
              <div>
                <label htmlFor={groupId} className={fieldLabelClassName}>
                  {t("spaces.groups.label")}
                </label>
                <GroupSelect
                  id={groupId}
                  value={item.groupId}
                  onChange={(next) => {
                    setError(null);
                    patchItem(item.id, { groupId: next }).catch((err) => setError(err instanceof Error ? err.message : t("spaces.error.generic")));
                  }}
                />
              </div>
            </>
          ) : (
            <>
              {item.note && (
                <div>
                  <h3 className="text-label font-semibold text-text">{t("spaces.detail.projectNote")}</h3>
                  <p className="whitespace-pre-wrap break-words text-small text-text-secondary">{item.note}</p>
                </div>
              )}
              {group && (
                <p className="text-small text-text-secondary">
                  {t("spaces.groups.label")}: {group.name}
                </p>
              )}
            </>
          )}
          <p className="text-caption text-text-muted">{t("spaces.detail.added", { time: formatRelativeTime(item.createdAt, language) })}</p>
        </section>

        <FormError message={error} />

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-soft pt-3">
          <div className="flex flex-wrap gap-2">
            {onShowOnBoard && (
              <Button type="button" variant="outline" size="sm" onClick={() => onShowOnBoard(item.id)}>
                <MapPin size={14} aria-hidden />
                {t("spaces.detail.showOnBoard")}
              </Button>
            )}
            {caps.edit && (
              <Button type="button" variant="ghost" size="sm" className="text-danger hover:bg-danger/10" onClick={() => setConfirmRemove(true)}>
                <Trash2 size={14} aria-hidden />
                {t("spaces.detail.remove")}
              </Button>
            )}
          </div>
          {caps.edit && (
            <Button type="button" onClick={() => void save()} disabled={busy || !dirty}>
              {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : saved ? <Check size={14} aria-hidden /> : null}
              {saved ? t("spaces.detail.saved") : t("common.save")}
            </Button>
          )}
        </div>
      </div>
      {lightbox && item.mediaUrl && <ImageLightbox images={[{ url: item.mediaUrl, alt: source.title }]} onClose={() => setLightbox(false)} />}
      {confirmRemove && (
        <ConfirmDialog
          id="remove-space-item"
          title={t("spaces.detail.removeTitle")}
          body={t("spaces.detail.removeBody")}
          confirmLabel={t("spaces.detail.remove")}
          danger
          busy={busy}
          error={error}
          onCancel={() => setConfirmRemove(false)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await removeItems([item.id]);
              onClose();
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setBusy(false);
              setConfirmRemove(false);
            }
          }}
        />
      )}
    </SpaceDialog>
  );
}

/** Renk seçici (palet token'ları; hex yok). */
export function ColorChoice({ value, onChange, name }: { value: SpaceColor; onChange: (color: SpaceColor) => void; name: string }) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className={fieldLabelClassName}>{t("spaces.notes.color")}</legend>
      <div className="flex flex-wrap gap-2">
        {SPACE_COLORS.map((color) => (
          <label key={color} className="cursor-pointer">
            <input type="radio" name={name} value={color} checked={value === color} onChange={() => onChange(color)} className="peer sr-only" />
            <span
              title={t(`spaces.color.${color}` as TranslationKey)}
              className={cn("flex h-9 w-9 items-center justify-center rounded-full border-2 peer-checked:ring-2 peer-checked:ring-primary peer-focus-visible:ring-2 peer-focus-visible:ring-primary", SPACE_COLOR_CLASS[color].surface, SPACE_COLOR_CLASS[color].border)}
            >
              <span className={cn("h-3 w-3 rounded-full", SPACE_COLOR_CLASS[color].dot)} />
              <span className="sr-only">{t(`spaces.color.${color}` as TranslationKey)}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * Not oluştur / düzenle: başlık, metin, renk, bağlı öğe (isteğe bağlı), "Yalnız üyeler görsün" (gizli not — herkese açık / bağlantılı
 * Space'te dışarıya görünmez). Oluşturan ve tarih sunucuda tutulur.
 */
export function NoteEditorModal({
  note,
  attachTo,
  onClose,
  near,
}: {
  note?: SpaceItem | null;
  attachTo?: string | null;
  onClose: () => void;
  /** Panodan eklenirken görünümün ortası. */
  near?: { x: number; y: number };
}) {
  const { t } = useTranslation();
  const { space, items, addItems, patchItem } = useSpaceContext();
  const place = usePlaceNewItems();
  const itemTitle = useItemTitle();
  const [title, setTitle] = useState(note?.title ?? "");
  const [body, setBody] = useState(note?.body ?? "");
  const [color, setColor] = useState<SpaceColor>(note?.color ?? "warning");
  const [attached, setAttached] = useState<string | null>(note?.attachedItemId ?? attachTo ?? null);
  const [isPrivate, setIsPrivate] = useState(note?.isPrivate ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();
  const attachId = useId();
  const attachable = items.filter((item) => item.kind !== "note" && item.kind !== "palette");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim() && !body.trim()) {
      setError(t("spaces.notes.emptyError"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (note) {
        await patchItem(note.id, { title: title.trim(), body, color, attachedItemId: attached, isPrivate });
      } else {
        const anchor = attached ? items.find((item) => item.id === attached) : null;
        await addItems(
          place(
            [{ spaceId: space.id, kind: "note", title: title.trim(), body, color, attachedItemId: attached, isPrivate }],
            anchor ? { x: anchor.x + anchor.w + 140, y: anchor.y + 90 } : near,
          ),
        );
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  return (
    <SpaceDialog title={note ? t("spaces.notes.edit") : t("spaces.notes.new")} onClose={onClose} busy={busy}>
      <form onSubmit={submit} className="space-y-4" data-testid="note-editor" noValidate>
        <div>
          <label htmlFor={titleId} className={fieldLabelClassName}>
            {t("spaces.notes.titleLabel")}
          </label>
          <input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={SPACE_ITEM_TITLE_MAX} className={fieldInputClassName} autoFocus />
        </div>
        <div>
          <label htmlFor={bodyId} className={fieldLabelClassName}>
            {t("spaces.notes.bodyLabel")}
          </label>
          <textarea id={bodyId} value={body} onChange={(event) => setBody(event.target.value)} maxLength={SPACE_ITEM_BODY_MAX} rows={5} className={cn(fieldControlClassName, "py-2.5")} />
        </div>
        <ColorChoice value={color} onChange={setColor} name="note-color" />
        <div>
          <label htmlFor={attachId} className={fieldLabelClassName}>
            {t("spaces.notes.attachTo")}
          </label>
          <select id={attachId} value={attached ?? ""} onChange={(event) => setAttached(event.target.value || null)} className={cn(fieldInputClassName, "h-10")}>
            <option value="">{t("spaces.notes.attachNone")}</option>
            {attachable.map((item) => (
              <option key={item.id} value={item.id}>
                {itemTitle(item)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-start gap-2 text-small text-text">
          <input type="checkbox" checked={isPrivate} onChange={(event) => setIsPrivate(event.target.checked)} className="mt-0.5 accent-primary" />
          <span>
            <span className="flex items-center gap-1 font-medium">
              <Lock size={13} aria-hidden />
              {t("spaces.notes.private")}
            </span>
            <span className="block text-caption text-text-muted">{t("spaces.notes.privateHelp")}</span>
          </span>
        </label>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </div>
      </form>
    </SpaceDialog>
  );
}

/** Kullanıcının kendi prompt taslağı: özgün gönderiden bağımsızdır, düzenlemek gönderiyi değiştirmez. */
export function DraftEditorModal({ draft, onClose, near }: { draft?: SpaceItem | null; onClose: () => void; near?: { x: number; y: number } }) {
  const { t } = useTranslation();
  const { space, addItems, patchItem } = useSpaceContext();
  const place = usePlaceNewItems();
  const [title, setTitle] = useState(draft?.title ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleId = useId();
  const bodyId = useId();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!body.trim()) {
      setError(t("spaces.prompts.emptyDraft"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (draft) await patchItem(draft.id, { title: title.trim(), body });
      else await addItems(place([{ spaceId: space.id, kind: "prompt", isDraft: true, title: title.trim(), body }], near));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  return (
    <SpaceDialog title={draft ? t("spaces.prompts.editDraft") : t("spaces.prompts.newDraft")} onClose={onClose} busy={busy} wide>
      <form onSubmit={submit} className="space-y-4" data-testid="draft-editor" noValidate>
        {draft?.sourcePromptId && <p className="rounded-md bg-surface-soft px-3 py-2 text-caption text-text-secondary">{t("spaces.prompts.draftIndependent")}</p>}
        <div>
          <label htmlFor={titleId} className={fieldLabelClassName}>
            {t("spaces.prompts.draftTitle")}
          </label>
          <input id={titleId} value={title} onChange={(event) => setTitle(event.target.value)} maxLength={SPACE_ITEM_TITLE_MAX} className={fieldInputClassName} autoFocus />
        </div>
        <div>
          <label htmlFor={bodyId} className={fieldLabelClassName}>
            {t("spaces.prompts.draftBody")}
          </label>
          <textarea id={bodyId} value={body} onChange={(event) => setBody(event.target.value)} maxLength={SPACE_ITEM_BODY_MAX} rows={8} className={cn(fieldControlClassName, "prompt-text py-2.5")} />
        </div>
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </div>
      </form>
    </SpaceDialog>
  );
}

/**
 * Grupları yönet: oluştur, yeniden adlandır, renk, sil. Silmek içindeki öğeleri SİLMEZ — öğeler gruptan çıkar (onayda söylenir).
 */
export function GroupsManagerModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const { space, groups, items, setGroups, setItems, userId, caps } = useSpaceContext();
  const [name, setName] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const inputId = useId();

  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim() || !userId) return;
    setBusy(true);
    setError(null);
    try {
      const group = await createSpaceGroup(space.id, name, userId, groups.length);
      setGroups((list) => [...list, group]);
      setName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function rename(id: string) {
    if (!editName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const group = await updateSpaceGroup(id, { name: editName });
      setGroups((list) => list.map((entry) => (entry.id === id ? group : entry)));
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    } finally {
      setBusy(false);
    }
  }

  async function recolor(id: string, color: SpaceColor) {
    try {
      const group = await updateSpaceGroup(id, { color });
      setGroups((list) => list.map((entry) => (entry.id === id ? group : entry)));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
    }
  }

  const deleting = groups.find((group) => group.id === confirmDelete) ?? null;

  return (
    <SpaceDialog title={t("spaces.groups.manage")} onClose={onClose} busy={busy}>
      <div className="space-y-4" data-testid="groups-manager">
        {groups.length === 0 ? (
          <p className="text-small text-text-muted">{t("spaces.groups.empty")}</p>
        ) : (
          <ul className="space-y-2">
            {groups.map((group) => {
              const count = items.filter((item) => item.groupId === group.id).length;
              return (
                <li key={group.id} className="flex items-center gap-2 rounded-md border border-border-soft p-2" data-group-row={group.name}>
                  <span className={cn("h-3 w-3 shrink-0 rounded-full", SPACE_COLOR_CLASS[group.color].dot)} aria-hidden />
                  {editing === group.id ? (
                    <form
                      className="flex min-w-0 flex-1 gap-2"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void rename(group.id);
                      }}
                    >
                      <input value={editName} onChange={(event) => setEditName(event.target.value)} maxLength={SPACE_GROUP_NAME_MAX} aria-label={t("spaces.groups.nameLabel")} className={cn(fieldInputClassName, "h-9")} autoFocus />
                      <Button type="submit" size="sm" disabled={busy}>
                        {t("common.save")}
                      </Button>
                    </form>
                  ) : (
                    <span className="min-w-0 flex-1 truncate text-small text-text">
                      {group.name} <span className="text-text-muted">· {t("spaces.groups.count", { count })}</span>
                    </span>
                  )}
                  {caps.edit && editing !== group.id && (
                    <>
                      <select
                        value={group.color}
                        onChange={(event) => void recolor(group.id, event.target.value as SpaceColor)}
                        aria-label={t("spaces.notes.color")}
                        className="h-9 rounded-md border border-border bg-surface px-2 text-caption text-text"
                      >
                        {SPACE_COLORS.map((color) => (
                          <option key={color} value={color}>
                            {t(`spaces.color.${color}` as TranslationKey)}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => {
                          setEditing(group.id);
                          setEditName(group.name);
                        }}
                        aria-label={t("spaces.groups.rename", { name: group.name })}
                        className="rounded-full p-2 text-text-muted hover:bg-surface-soft hover:text-text"
                      >
                        <Pencil size={15} />
                      </button>
                      <button type="button" onClick={() => setConfirmDelete(group.id)} aria-label={t("spaces.groups.delete", { name: group.name })} className="rounded-full p-2 text-text-muted hover:bg-danger/10 hover:text-danger">
                        <Trash2 size={15} />
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {caps.edit && (
          <form onSubmit={create} className="flex gap-2">
            <label htmlFor={inputId} className="sr-only">
              {t("spaces.groups.nameLabel")}
            </label>
            <input id={inputId} value={name} onChange={(event) => setName(event.target.value)} maxLength={SPACE_GROUP_NAME_MAX} placeholder={t("spaces.groups.newPlaceholder")} className={cn(fieldInputClassName, "h-10")} />
            <Button type="submit" disabled={busy || !name.trim()}>
              <Plus size={14} aria-hidden />
              {t("spaces.groups.add")}
            </Button>
          </form>
        )}
        <FormError message={error} />
      </div>
      {deleting && (
        <ConfirmDialog
          id="delete-space-group"
          title={t("spaces.groups.deleteTitle", { name: deleting.name })}
          body={t("spaces.groups.deleteBody")}
          confirmLabel={t("spaces.groups.deleteConfirm")}
          danger
          busy={busy}
          error={null}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            setBusy(true);
            try {
              await deleteSpaceGroup(deleting.id);
              setGroups((list) => list.filter((group) => group.id !== deleting.id));
              setItems((list) => list.map((item) => (item.groupId === deleting.id ? { ...item, groupId: null } : item)));
              setConfirmDelete(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : t("spaces.error.generic"));
              setConfirmDelete(null);
            } finally {
              setBusy(false);
            }
          }}
        />
      )}
    </SpaceDialog>
  );
}

export function GroupPill({ groupId }: { groupId: string | null }) {
  const { groups } = useSpaceContext();
  const group = groups.find((entry) => entry.id === groupId);
  if (!group) return null;
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1 truncate rounded-full px-2 py-0.5 text-caption font-medium", SPACE_COLOR_CLASS[group.color].surface, SPACE_COLOR_CLASS[group.color].text)}>
      <Layers size={11} aria-hidden />
      <span className="truncate">{group.name}</span>
    </span>
  );
}
