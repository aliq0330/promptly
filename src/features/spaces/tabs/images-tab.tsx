"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Grid2x2, ImageIcon, Layers, List, Loader2, Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { SectionMenu } from "@/features/content/section-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { imageSourceProblem } from "@/lib/image-processing";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn, formatRelativeTime } from "@/lib/utils";
import { matchesQuery } from "@/lib/spaces";
import { uploadSpaceImage } from "@/lib/supabase/spaces";
import { useSpaceContext } from "../space-provider";
import { GroupPill, GroupsManagerModal, ItemDetailModal, resolveSource, sourceReasonKey, usePlaceNewItems, useItemTitle } from "../space-items";
import { SpaceImage } from "../space-visuals";

/** Grup süzgecinin değerleri: hepsi, grupsuz ya da bir grup kimliği. */
type GroupFilter = "all" | "none" | string;

/**
 * Görseller (docs/history/213-*): Space'e eklenen bütün görseller — arama (başlık, not, kaynak gönderi başlığı/metni), grup
 * süzgeci, ızgara/liste, ayrıntı penceresi. Düzenleyici kendi görsellerini yükleyebilir (Space'in özel klasörüne, küçültülerek) ve
 * grupları yönetebilir. Küçük önizlemeler yalnız görünür olunca istenir (`loading="lazy"`); büyük görsel yalnız ışık kutusunda.
 */
export function ImagesTab({ onShowOnBoard, focusId }: { onShowOnBoard: (id: string) => void; focusId?: string | null }) {
  const { t, language } = useTranslation();
  const { space, items, groups, sources, readable, caps, addItems } = useSpaceContext();
  const place = usePlaceNewItems();
  const itemTitle = useItemTitle();
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<GroupFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [openId, setOpenId] = useState<string | null>(null);
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [upload, setUpload] = useState<{ done: number; total: number } | null>(null);
  const [uploadErrors, setUploadErrors] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Adresteki öğe ("focus") bir kez açılır; kapatıldıktan sonra öğeler değişse de yeniden açılmaz.
  const handledFocus = useRef<string | null>(null);
  useEffect(() => {
    if (!focusId || handledFocus.current === focusId || !items.some((item) => item.id === focusId && item.kind === "image")) return;
    handledFocus.current = focusId;
    setOpenId(focusId);
  }, [focusId, items]);

  const images = useMemo(
    () =>
      items
        .filter((item) => item.kind === "image")
        .filter((item) => (group === "all" ? true : group === "none" ? !item.groupId : item.groupId === group))
        .filter((item) => {
          const source = resolveSource(item, sources, readable);
          return matchesQuery(query, item.title, item.note, source.prompt?.title, source.prompt?.promptText);
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items, group, query, sources, readable],
  );
  const total = items.filter((item) => item.kind === "image").length;

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const list = [...files];
    const errors: string[] = [];
    setUploadErrors([]);
    setUpload({ done: 0, total: list.length });
    for (const file of list) {
      const problem = imageSourceProblem(file);
      if (problem) {
        errors.push(`${file.name}: ${problem}`);
        setUpload((state) => state && { ...state, done: state.done + 1 });
        continue;
      }
      try {
        const uploaded = await uploadSpaceImage(space.id, file);
        await addItems(place([{ spaceId: space.id, kind: "image", mediaUrl: uploaded.url, mediaWidth: uploaded.width, mediaHeight: uploaded.height, title: file.name.replace(/\.[^.]+$/, "").slice(0, 120) }]));
      } catch (err) {
        errors.push(`${file.name}: ${err instanceof Error ? err.message : t("spaces.error.upload")}`);
      }
      setUpload((state) => state && { ...state, done: state.done + 1 });
    }
    setUpload(null);
    setUploadErrors(errors);
  }

  return (
    <div className="space-y-4" data-testid="space-images">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="relative min-w-0 flex-1">
          <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("spaces.images.search")}
            aria-label={t("spaces.images.search")}
            className="h-11 w-full rounded-full border border-border bg-surface pl-10 pr-4 text-small text-text placeholder:text-text-muted"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={t("spaces.home.viewLabel")} className="flex rounded-full border border-border bg-surface p-0.5">
            {(["grid", "list"] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setView(key)}
                aria-pressed={view === key}
                aria-label={t(key === "grid" ? "spaces.home.viewGrid" : "spaces.home.viewList")}
                className={cn("flex h-9 w-10 items-center justify-center rounded-full", view === key ? "bg-text text-background" : "text-text-muted hover:text-text")}
              >
                {key === "grid" ? <Grid2x2 size={16} aria-hidden /> : <List size={16} aria-hidden />}
              </button>
            ))}
          </div>
          {caps.edit && (
            <>
              <Button variant="outline" onClick={() => setGroupsOpen(true)}>
                <Layers size={16} aria-hidden />
                {t("spaces.groups.manage")}
              </Button>
              <Button onClick={() => fileRef.current?.click()} disabled={upload !== null} data-testid="upload-images">
                {upload ? <Loader2 size={16} className="animate-spin" aria-hidden /> : <Upload size={16} aria-hidden />}
                {upload ? t("spaces.images.uploading", { done: upload.done, total: upload.total }) : t("spaces.images.upload")}
              </Button>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                className="sr-only"
                tabIndex={-1}
                data-testid="upload-images-input"
                onChange={(event) => {
                  void handleFiles(event.target.files);
                  event.target.value = "";
                }}
              />
            </>
          )}
        </div>
      </div>

      {groups.length > 0 &&
        (groups.length + 2 >= 4 ? (
          // docs/history/236-*: dört ya da daha çok grup seçeneği tek menüde; az olunca çipler kalır.
          <div className="flex items-center">
            <SectionMenu
              items={[
                { key: "all", label: t("spaces.groups.all") },
                ...groups.map((entry) => ({ key: entry.id, label: entry.name })),
                { key: "none", label: t("spaces.groups.none") },
              ]}
              active={group}
              onChange={setGroup}
              ariaLabel={t("spaces.groups.filter")}
              title={t("spaces.groups.filter")}
            />
          </div>
        ) : (
          <ChipRow aria-label={t("spaces.groups.filter")}>
            <Chip selected={group === "all"} onClick={() => setGroup("all")}>
              {t("spaces.groups.all")}
            </Chip>
            {groups.map((entry) => (
              <Chip key={entry.id} selected={group === entry.id} onClick={() => setGroup(entry.id)}>
                {entry.name}
              </Chip>
            ))}
            <Chip selected={group === "none"} onClick={() => setGroup("none")}>
              {t("spaces.groups.none")}
            </Chip>
          </ChipRow>
        ))}

      {uploadErrors.length > 0 && (
        <div role="alert" className="space-y-1 rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
          <p className="font-semibold">{t("spaces.images.uploadFailed")}</p>
          {uploadErrors.map((message) => (
            <p key={message} className="break-words">
              {message}
            </p>
          ))}
        </div>
      )}

      {total === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={t("spaces.images.empty")}
          description={caps.edit ? t("spaces.images.emptyEditor") : undefined}
          action={caps.edit ? { label: t("spaces.images.upload"), onClick: () => fileRef.current?.click() } : undefined}
        />
      ) : images.length === 0 ? (
        <EmptyState icon={Search} title={t("spaces.home.noResults")} compact />
      ) : view === "grid" ? (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {images.map((item) => {
            const source = resolveSource(item, sources, readable);
            const reason = sourceReasonKey(source.state);
            return (
              <li key={item.id} data-image-item={item.id}>
                <button type="button" onClick={() => setOpenId(item.id)} className="group block w-full space-y-1.5 text-left focus-visible:outline-none">
                  <SpaceImage
                    url={item.mediaUrl}
                    alt={itemTitle(item)}
                    available={!reason}
                    reason={reason ? t(reason) : undefined}
                    className="aspect-square w-full rounded-md ring-primary transition-shadow group-hover:shadow-card-hover group-focus-visible:ring-2"
                  />
                  <span className="block truncate text-small font-medium text-text">{itemTitle(item)}</span>
                  <GroupPill groupId={item.groupId} />
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="space-y-2">
          {images.map((item) => {
            const source = resolveSource(item, sources, readable);
            const reason = sourceReasonKey(source.state);
            return (
              <li key={item.id} data-image-item={item.id}>
                <button type="button" onClick={() => setOpenId(item.id)} className="flex w-full items-center gap-3 rounded-lg border border-border-soft bg-surface p-2 text-left hover:bg-surface-soft">
                  <SpaceImage url={item.mediaUrl} alt="" available={!reason} className="h-16 w-16 shrink-0 rounded-md" />
                  <span className="min-w-0 flex-1 space-y-0.5">
                    <span className="block truncate text-small font-semibold text-text">{itemTitle(item)}</span>
                    <span className="block truncate text-caption text-text-muted">
                      {source.prompt ? source.prompt.author.displayName : reason ? t(reason) : t("spaces.images.ownUpload")} · {formatRelativeTime(item.createdAt, language)}
                    </span>
                    {item.note && <span className="block truncate text-caption text-text-secondary">{item.note}</span>}
                  </span>
                  <GroupPill groupId={item.groupId} />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {caps.edit && total > 0 && <p className="text-caption text-text-muted">{t("spaces.overview.fromPromptlyHint")}</p>}

      {openId && <ItemDetailModal itemId={openId} onClose={() => setOpenId(null)} onShowOnBoard={onShowOnBoard} />}
      {groupsOpen && <GroupsManagerModal onClose={() => setGroupsOpen(false)} />}
    </div>
  );
}
