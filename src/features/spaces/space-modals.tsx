"use client";

import { useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "@/components/icons/check";
import { Loader2 } from "@/components/icons/loader-2";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { CreatePageShell } from "@/features/content/create-page-shell";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import {
  createSpace,
  deleteSpace,
  fetchSpaceItems,
  updateSpace,
  uploadSpaceImage,
  type Space,
  type SpaceItem,
} from "@/lib/supabase/spaces";
import { SPACE_TEMPLATE_GROUPS, spaceHref, type SpaceKind } from "@/lib/spaces";
import { CoverPicker, DescriptionField, FormError, KindField, SubmitButton, TemplateField, TitleField } from "./space-forms";
import { SpaceImage } from "./space-visuals";

/** Gövdenin İÇİNDE yazılmış alt düğme satırı (Vazgeç / Kaydet) için: kayan gövdenin altına yapışır (`has-[[data-dialog-footer]]:pb-0` altındaki boşluğu kaldırır). `footer` prop'u varsa gerek yok. */
export const DIALOG_FOOTER_CLASS = "sticky bottom-0 z-10 -mx-5 mt-4 flex justify-end gap-2 border-t border-border-soft bg-surface px-5 py-3";

/**
 * Ortak pencere gövdesi (docs/history/242-*): başlık + ✕ SABİT üstte, `footer` (Vazgeç / Kaydet) SABİT altta, yalnız ortası kayar; kart en çok
 * ekranın %75'i (`Modal`). `onSubmit` verilirse gövde + footer tek `<form>`dur (Enter ve submit düğmesi çalışır).
 */
export function SpaceDialog({
  title,
  onClose,
  children,
  footer,
  onSubmit,
  formTestId,
  wide,
  busy,
  overLayers,
  eyebrow,
  leading,
  drawer,
  page,
}: {
  title: string;
  /** Oluşturma akışı: telefonda `Modal` yerine tam ekran sayfa kabuğu (docs/history/473-*). */
  page?: boolean;
  /** Öğe çekmecesi (docs/history/371-*): md+ sağa yapışık tam yükseklikte panel, telefonda alt sayfa — ekip projesindeki öğe çekmecesiyle aynı kalıp. */
  drawer?: boolean;
  /** Başlığın üstünde küçük büyük harfli etiket (ör. "ERİŞİM"). */
  eyebrow?: string;
  /** Başlığın solunda küçük görsel (ör. kişinin baş harfleri). */
  leading?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  formTestId?: string;
  wide?: boolean;
  busy?: boolean;
  overLayers?: boolean;
}) {
  const { t } = useTranslation();
  const id = useId();
  const wideScreen = useMediaQuery("(min-width: 768px)");
  if (page && !wideScreen) {
    return (
      <CreatePageShell title={title} onClose={onClose} busy={busy} onSubmit={onSubmit} footer={footer} formTestId={formTestId}>
        {children}
      </CreatePageShell>
    );
  }
  const content = (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 has-[[data-dialog-footer]]:pb-0">{children}</div>
      {footer && <div className="flex shrink-0 justify-end gap-2 border-t border-border-soft bg-surface px-5 py-3">{footer}</div>}
    </>
  );
  return (
    <Modal onClose={busy ? () => undefined : onClose} labelledBy={id} overLayers={overLayers} variant={drawer ? (wideScreen ? "side" : "sheet") : "dialog"}>
      <div
        data-space-drawer={drawer ? "" : undefined}
        className={
          drawer
            ? "flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface max-md:rounded-t-xl md:w-[32.5rem] md:max-w-full md:border-l md:border-border"
            : cn("flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-lg card-flat shadow-lg", wide ? "max-w-xl" : "max-w-md")
        }
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border-soft px-5 py-4">
          {leading}
          <div className="min-w-0 flex-1">
            {eyebrow && <p className="text-caption font-semibold text-text-muted">{eyebrow}</p>}
            <h2 id={id} className="truncate text-h3 font-bold text-text">
              {title}
            </h2>
          </div>
          <button type="button" onClick={onClose} disabled={busy} aria-label={t("common.close")} className="rounded-sm p-1.5 text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={20} />
          </button>
        </div>
        {onSubmit ? (
          <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col" data-testid={formTestId}>
            {content}
          </form>
        ) : (
          content
        )}
      </div>
    </Modal>
  );
}

/**
 * Yeni Space: ad (zorunlu), açıklama, tür, görünürlük (varsayılan Özel), başlangıç şablonu, kapak. Başarıda Space'in sayfasına
 * gider. Kapak yüklenemezse Space yine oluşmuştur: pencere bunu söyler ve Space'e geçmeyi önerir (sessizce yutulmaz).
 */
export function CreateSpaceModal({ onClose, onCreated, initialKind }: { onClose: () => void; onCreated?: (id: string) => void; initialKind?: SpaceKind }) {
  const { t } = useTranslation();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<SpaceKind>(initialKind ?? "moodboard");
  const [template, setTemplate] = useState<"empty" | "template">("template");
  const [cover, setCover] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdWithoutCover, setCreatedWithoutCover] = useState<string | null>(null);

  function finish(id: string) {
    if (onCreated) onCreated(id);
    else router.push(spaceHref(id));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaces.error.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    let id: string;
    try {
      id = await createSpace({
        title,
        description,
        kind,
        groups: template === "template" ? SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)) : [],
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
      return;
    }
    if (cover) {
      try {
        const { url } = await uploadSpaceImage(id, cover);
        await updateSpace(id, { coverUrl: url });
      } catch {
        setBusy(false);
        setCreatedWithoutCover(id);
        return;
      }
    }
    finish(id);
  }

  if (createdWithoutCover) {
    return (
      <SpaceDialog title={t("spaces.create.title")} onClose={() => finish(createdWithoutCover)}>
        <div className="space-y-4">
          <p role="alert" className="rounded-md bg-warning-soft px-3 py-2 text-small text-text">
            {t("spaces.create.coverFailed")}
          </p>
          <div className="flex justify-end">
            <Button type="button" onClick={() => finish(createdWithoutCover)}>
              {t("spaces.create.openSpace")}
            </Button>
          </div>
        </div>
      </SpaceDialog>
    );
  }

  return (
    <SpaceDialog page
      title={t("spaces.create.title")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={submit}
      formTestId="create-space-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{busy ? t("spaces.create.creating") : t("spaces.create.submit")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} autoFocus />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} />
        <TemplateField kind={kind} value={template} onChange={setTemplate} />
        <CoverPicker file={cover} onChange={setCover} />
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/**
 * Space ayarları (yalnız sahip): ad, açıklama, tür, kapak (yükle / Space'teki bir görseli seç / kaldır). Space'ler hep özeldir
 * (docs/history/459-*). Kaydetme gerçekten güncellenen satırı döner; hata pencerede kalır.
 */
export function SpaceSettingsModal({
  space,
  images,
  onClose,
  onSaved,
}: {
  space: Space;
  /** Kapak seçimi için Space'in görselleri; verilmezse pencere kendisi yükler (kart menüsünden açılınca). */
  images?: SpaceItem[];
  onClose: () => void;
  onSaved: (space: Space) => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(space.title);
  const [description, setDescription] = useState(space.description);
  const [kind, setKind] = useState<SpaceKind>(space.kind);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverItemId, setCoverItemId] = useState<string | null>(space.coverItemId);
  const [removeUpload, setRemoveUpload] = useState(false);
  const [loadedImages, setLoadedImages] = useState<SpaceItem[] | null>(images ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (images) return;
    let alive = true;
    fetchSpaceItems(space.id)
      .then((list) => alive && setLoadedImages(list.filter((item) => item.kind === "image")))
      .catch(() => alive && setLoadedImages([]));
    return () => {
      alive = false;
    };
  }, [images, space.id]);

  const imageItems = (images ?? loadedImages ?? []).filter((item) => item.kind === "image").slice(0, 24);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) {
      setError(t("spaces.error.titleRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // Yüklenen kapak, seçilen görselden önce gelir: yeni bir görsel SEÇEN kullanıcı yüklenmiş kapağı bırakmak istiyor demektir.
      let coverUrl: string | null | undefined;
      if (coverFile) coverUrl = (await uploadSpaceImage(space.id, coverFile)).url;
      else if (removeUpload || (coverItemId !== space.coverItemId && coverItemId !== null && space.coverUrl)) coverUrl = null;
      const saved = await updateSpace(space.id, {
        title,
        description,
        kind,
        coverItemId,
        ...(coverUrl !== undefined ? { coverUrl } : {}),
      });
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("spaces.error.generic"));
      setBusy(false);
    }
  }

  return (
    <SpaceDialog
      title={t("spaces.settings.title")}
      onClose={onClose}
      busy={busy}
      wide
      onSubmit={submit}
      formTestId="space-settings-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy}>{t("common.save")}</SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <TitleField value={title} onChange={setTitle} />
        <DescriptionField value={description} onChange={setDescription} />
        <KindField value={kind} onChange={setKind} />
        <CoverPicker
          file={coverFile}
          onChange={(file) => {
            setCoverFile(file);
            if (file) setRemoveUpload(false);
          }}
        />
        {space.coverUrl && !coverFile && (
          <label className="flex items-center gap-2 text-small text-text-secondary">
            <input type="checkbox" checked={removeUpload} onChange={(event) => setRemoveUpload(event.target.checked)} className="accent-primary" />
            {t("spaces.settings.removeUploadedCover")}
          </label>
        )}
        <div>
          <p className="mb-1.5 text-label font-medium text-text">{t("spaces.settings.coverFromImages")}</p>
          {loadedImages === null && !images ? (
            <Loader2 size={16} className="animate-spin text-text-muted" aria-label={t("common.loading")} />
          ) : imageItems.length === 0 ? (
            <p className="text-caption text-text-muted">{t("spaces.settings.noImages")}</p>
          ) : (
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
              <button
                type="button"
                onClick={() => setCoverItemId(null)}
                aria-pressed={coverItemId === null}
                className={cn("flex aspect-square items-center justify-center rounded-md border text-caption text-text-muted", coverItemId === null ? "border-primary ring-2 ring-primary/30" : "border-border-soft")}
              >
                {t("spaces.settings.coverAuto")}
              </button>
              {imageItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setCoverItemId(item.id)}
                  aria-pressed={coverItemId === item.id}
                  aria-label={item.title || t("spaces.images.untitled")}
                  className={cn("relative aspect-square overflow-hidden rounded-md border", coverItemId === item.id ? "border-primary ring-2 ring-primary/30" : "border-border-soft")}
                >
                  <SpaceImage url={item.mediaUrl} alt="" className="absolute inset-0" />
                  {coverItemId === item.id && <Check size={16} className="absolute right-1 top-1 rounded-full bg-primary p-0.5 text-primary-foreground" aria-hidden />}
                </button>
              ))}
            </div>
          )}
        </div>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}

/** Silme onayı: geri alınamaz; Promptly gönderilerine dokunulmadığını söyler. */
export function DeleteSpaceDialog({ space, onClose, onDeleted }: { space: Pick<Space, "id" | "title">; onClose: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <ConfirmDialog
      id="delete-space"
      title={t("spaces.delete.title")}
      body={t("spaces.delete.body", { title: space.title })}
      confirmLabel={t("spaces.delete.confirm")}
      danger
      busy={busy}
      error={error}
      onCancel={onClose}
      onConfirm={async () => {
        setBusy(true);
        setError(null);
        try {
          await deleteSpace(space.id);
          onDeleted();
        } catch (err) {
          setError(err instanceof Error ? err.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
    />
  );
}
