"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Ban } from "@/components/icons/ban";
import { Bell } from "@/components/icons/bell";
import { BellOff } from "@/components/icons/bell-off";
import { ChartNoAxesColumn } from "@/components/icons/chart-no-axes-column";
import { Check } from "@/components/icons/check";
import { Copy } from "@/components/icons/copy";
import { Download } from "@/components/icons/download";
import { Flag } from "@/components/icons/flag";
import { FolderMinus } from "@/components/icons/folder-minus";
import { Loader2 } from "@/components/icons/loader-2";
import { Pencil } from "@/components/icons/pencil";
import { PenLine } from "@/components/icons/pen-line";
import { Pin } from "@/components/icons/pin";
import { PinOff } from "@/components/icons/pin-off";
import { Share2 } from "@/components/icons/share-2";
import { Shapes } from "@/components/icons/shapes";
import { Bookmark } from "@/components/icons/bookmark";
import { UserMinus } from "@/components/icons/user-minus";
import { UserPlus } from "@/components/icons/user-plus";
import { Volume2 } from "@/components/icons/volume-2";
import { VolumeX } from "@/components/icons/volume-x";
import { X } from "@/components/icons/x";
import { TrashIcon } from "@/components/ui/motion-icons";
import { ActionMenu, ActionMenuRows, type ActionMenuRow } from "@/components/ui/action-menu";
import { useAuth } from "@/features/auth/auth-provider";
import { useCardExit } from "@/features/content/content-card";
import { ExportPromptsModal } from "@/features/exchange/export-prompts-modal";
import { usePostInterest } from "@/features/feed/use-post-interest";
import { ConfirmDialog } from "@/features/groups/confirm-dialog";
import { useBlockState } from "@/features/moderation/use-block-state";
import { useReport } from "@/features/moderation/report-provider";
import { useMuteToggle } from "@/features/notifications/mute-store";
import { usePinToggle } from "@/features/profile/profile-pins";
import { useFollowState } from "@/features/profile/use-follow-state";
import { usePostScope } from "@/features/communities/post-scope";
import { useQuoteScope } from "@/features/quotes/quote-scope";
import { AddToSpaceModal } from "@/features/spaces/add-to-space-modal";
import { SaveToCollectionModal } from "@/features/collections/save-to-collection-modal";
import { StatisticsModal, type StatisticsTarget } from "@/features/statistics/statistics-modal";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { notificationHrefBase } from "@/lib/notification-mirror";
import { POST_MENU_GROUPS, POST_MENU_LAYOUT, postMenuItems, type PostMenuFlags, type PostMenuGroup, type PostMenuItemId, type PostMenuKind, type PostMenuSurface } from "@/lib/post-menu";
import { friendlyServerMessage } from "@/lib/supabase/server-errors";
import { fetchPromptForExport } from "@/lib/supabase/prompt-exchange";
import { deleteRealPrompt } from "@/lib/supabase/prompts";
import { deleteWorkflow } from "@/lib/supabase/workflows";
import { deletePreset } from "@/lib/supabase/presets";
import { deleteRealRequest } from "@/lib/supabase/requests";
import { deletePromptResult } from "@/lib/supabase/prompt-results";
import type { PinKind } from "@/lib/supabase/profile-pins";
import { presetHref, promptHref, requestHref, resultHref, skillHref, workflowHref } from "@/lib/utils";
import type { Preset, Prompt, PromptRequest, PromptResult, Skill, UserProfile, Workflow } from "@/types";
import { DeletePromptDialog } from "./delete-prompt-dialog";
import { usePostMenuExtras, usePostMenuOptions, type PostMenuExtra } from "./post-menu-extras";
import { ShareModal, type ShareModalTarget } from "./share-modal";
import { SuggestEditModal } from "./suggest-edit-modal";

/**
 * Gönderi ⋮ menüsü (docs/history/480-*): kartın ve detay sayfasının TEK menüsü. Hangi satırın hangi yüzeyde, kimin gönderisinde göründüğü saf
 * `lib/post-menu.ts`'tedir (birim testli); bu bileşen satırları çizer ve eylemlerini bağlar. Yatay üç nokta düğmesi, `md`+'da açılır panel, telefonda
 * alttan açılan kart (`ActionMenu`). Satırlar gruplara ayrılır (paylaş · kaydet · içerik · kişi · güvenlik), olumsuz satırlar kırmızı, olumlu yeşildir.
 *
 * Bağlantıyı kopyala burada YOKTUR (Paylaş penceresindedir); "Paylaş…" yalnız kartta (detayın eylem çubuğunda zaten Paylaş var). Menünün durum
 * kancaları (takip, engel, sessize alma, ilgi, sabit) yalnız menü AÇIKKEN çalışır: kapalı kartlar hiçbir istek atmaz.
 *
 * Hedef bir `target` nesnesidir (kimlik + sayaçlar + yazar bir arada gerekir: Paylaş, İstatistik, takip…); bir Skill de aynı menüyü kullanır. Başvuru
 * gönderisi / alıntı sayfasında (`PostScope` / `QuoteScope`) yerel satır çizilmez, yalnız üstten gelen ekstralar (`PostMenuExtras`) durur.
 */
export type PostMenuTarget =
  | { kind: "prompt"; prompt: Prompt }
  | { kind: "request"; request: PromptRequest }
  | { kind: "workflow"; workflow: Workflow }
  | { kind: "preset"; preset: Preset }
  | { kind: "result"; result: PromptResult }
  | { kind: "skill"; skill: Skill };

interface Resolved {
  kind: PostMenuKind;
  id: string;
  title: string;
  author: UserProfile;
  communityId: string | null;
  href: string;
  editHref: string | null;
  publicPublished: boolean;
  share: ShareModalTarget;
  stats: StatisticsTarget | null;
}

function resolve(target: PostMenuTarget): Resolved {
  switch (target.kind) {
    case "prompt": {
      const p = target.prompt;
      return {
        kind: "prompt",
        id: p.id,
        title: p.title,
        author: p.author,
        communityId: p.communityId ?? null,
        href: promptHref(p),
        editHref: `/create?edit=${p.id}`,
        publicPublished: p.status === "published" && p.visibility === "public",
        share: { contentType: "prompt", prompt: p },
        stats: { contentType: "prompt", contentId: p.id, likeCount: p.likeCount, commentCount: p.commentCount, saveCount: p.saveCount, copyCount: p.copyCount },
      };
    }
    case "request": {
      const r = target.request;
      return {
        kind: "request",
        id: r.id,
        title: r.title,
        author: r.author,
        communityId: r.communityId ?? null,
        href: requestHref(r),
        editHref: `/requests/new?edit=${r.id}`,
        publicPublished: !r.isDraft && (r.visibility ?? "public") === "public",
        share: { contentType: "request", request: r },
        stats: { contentType: "request", contentId: r.id, likeCount: r.likeCount, commentCount: r.commentCount },
      };
    }
    case "workflow": {
      const w = target.workflow;
      return {
        kind: "workflow",
        id: w.id,
        title: w.title,
        author: w.creator,
        communityId: w.communityId ?? null,
        href: workflowHref(w),
        editHref: `/workflows/create?edit=${w.id}`,
        publicPublished: w.status === "published" && w.visibility === "public",
        share: { contentType: "workflow", workflow: w },
        stats: { contentType: "workflow", contentId: w.id, likeCount: w.likeCount, commentCount: w.commentCount, saveCount: w.saveCount },
      };
    }
    case "preset": {
      const p = target.preset;
      return {
        kind: "preset",
        id: p.id,
        title: p.title,
        author: p.creator,
        communityId: p.communityId ?? null,
        href: presetHref(p),
        editHref: `/presets/create?edit=${p.id}`,
        publicPublished: p.status === "published" && p.visibility === "public",
        share: { contentType: "preset", preset: p },
        stats: { contentType: "preset", contentId: p.id, likeCount: p.likeCount, commentCount: p.commentCount, saveCount: p.saveCount },
      };
    }
    case "skill": {
      const s = target.skill;
      return {
        kind: "skill",
        id: s.id,
        title: s.title,
        author: s.creator,
        communityId: null,
        href: skillHref(s),
        editHref: `/skills/create?edit=${s.id}`,
        publicPublished: s.status === "published" && s.visibility === "public",
        share: { contentType: "skill", skill: s },
        stats: { contentType: "skill", contentId: s.id, likeCount: s.likeCount, commentCount: s.commentCount, saveCount: s.saveCount },
      };
    }
    default: {
      const r = target.result;
      return {
        kind: "result",
        id: r.id,
        title: r.originalPrompt?.title ?? "",
        author: r.creator,
        communityId: null,
        href: resultHref(r),
        editHref: null,
        publicPublished: true,
        share: { contentType: "prompt_result", result: r },
        stats: null,
      };
    }
  }
}

type ModalKind = "share" | "space" | "collection" | "export" | "stats" | "suggest" | "delete" | "block";

export function PostMenu({
  target,
  surface = "card",
  onDeleted,
  onEdit,
  onDelete,
  collectionRemoval,
}: {
  target: PostMenuTarget;
  /** `detail`: sayfanın bant köşesindeki belirgin düğme ve detaya özgü satır kümesi; `card` (varsayılan): kart. */
  surface?: PostMenuSurface;
  /** Gerçek ve başarılı bir silmeden sonra çağrılır — liste kartı yeniden yüklemeden kaldırsın. */
  onDeleted?: () => void;
  /** Yalnız sonuç hedefi: "Düzenle" bir sayfaya gitmez, çağıranın penceresini açar. */
  onEdit?: () => void;
  /** Kendi silme akışı olan hedefler (Skill: sayfanın kendi onayı): verilirse "Sil" bunu çağırır, menü API'ye dokunmaz. */
  onDelete?: () => void;
  /** Yalnız izleyenin SAHİBİ olduğu bir koleksiyonun içinde: "Koleksiyondan kaldır" (gönderinin kendisini silmez). */
  collectionRemoval?: { onRemove: () => Promise<void> };
}) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const info = useMemo(() => resolve(target), [target]);
  const extras = usePostMenuExtras();
  const options = usePostMenuOptions();
  // Başvuru gönderisi / alıntı sayfasında içeriğin KENDİ yönetimi orijinalin sayfasında kalır; menü yalnız gönderi işlerini (ekstralar) taşır.
  const postScope = usePostScope();
  const quoteScope = useQuoteScope();
  const scoped = Boolean(postScope ?? quoteScope);
  const cardExit = useCardExit();
  const [modal, setModal] = useState<ModalKind | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [confirmingRemove, setConfirmingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isOwn = user?.id === info.author.id;
  const flags: PostMenuFlags = {
    kind: info.kind,
    surface,
    isOwn,
    signedIn: Boolean(user),
    communityContent: Boolean(info.communityId),
    scoped,
    publicPublished: info.publicPublished,
    inCollection: Boolean(collectionRemoval),
    hasResultEdit: Boolean(onEdit),
    // Üst bileşen satırları getiriyorsa (Sana özel / Keşfet) ya da bu liste ilgi sormuyorsa (Takip Ettiklerin) menü kendi satırlarını eklemez.
    interestFromParent: !options.interest || extras.some((extra) => extra.key.startsWith("interest-")),
  };
  const ids = postMenuItems(flags).filter((id) => id !== "delete" || info.kind !== "skill" || Boolean(onDelete));
  if (ids.length === 0 && extras.length === 0) return null;

  const asksInDialog = info.kind === "prompt";

  async function performDelete(close?: () => void) {
    setBusy(true);
    setError(null);
    try {
      if (info.kind === "preset") await deletePreset(info.id);
      else if (info.kind === "workflow") await deleteWorkflow(info.id);
      else if (info.kind === "request") await deleteRealRequest(info.id);
      else if (info.kind === "result") await deletePromptResult(info.id);
      else await deleteRealPrompt(info.id);
      setModal(null);
      close?.();
      // Kart önce küçülüp solar, sonra listeden çıkar (docs/history/335-*).
      void cardExit(() => onDeleted?.());
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.deleteFailed"));
      setBusy(false);
      setConfirmingDelete(false);
    }
  }

  async function performRemoveFromCollection(close: () => void) {
    if (!collectionRemoval) return;
    setBusy(true);
    setError(null);
    try {
      await cardExit(() => collectionRemoval.onRemove());
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("common.removeFailed"));
      setBusy(false);
      setConfirmingRemove(false);
    }
  }

  const stop = (node: ReactNode) => (
    // Portal'daki pencerenin olayları React ağacında kartın bağlantısına kadar kabarmasın (kart açılmasın).
    <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      {node}
    </div>
  );
  const closeModal = () => !busy && setModal(null);

  return (
    <>
      <ActionMenu label={t("common.postOptions")} surface={surface} title={info.title || t("common.postOptions")} dataAttrs={{ "data-post-menu": surface }}>
        {(close, { sheet }) => (
          <PostMenuRows
            info={info}
            ids={ids}
            extras={extras}
            sheet={sheet}
            close={close}
            openModal={setModal}
            onEdit={onEdit}
            onDelete={onDelete}
            confirmingDelete={confirmingDelete}
            askDelete={() => setConfirmingDelete(true)}
            performDelete={(closeMenu) => void performDelete(closeMenu)}
            asksInDialog={asksInDialog}
            confirmingRemove={confirmingRemove}
            askRemove={() => setConfirmingRemove(true)}
            performRemove={() => void performRemoveFromCollection(close)}
            busy={busy}
            error={error}
          />
        )}
      </ActionMenu>

      {modal === "share" && stop(<ShareModal target={info.share} onClose={() => setModal(null)} />)}
      {modal === "space" && info.kind !== "result" && stop(<AddToSpaceModal target={{ type: info.kind, id: info.id }} onClose={() => setModal(null)} />)}
      {modal === "collection" && stop(<SaveToCollectionModal {...collectionProps(info)} onClose={() => setModal(null)} />)}
      {modal === "export" && info.kind === "prompt" && stop(<ExportPromptsModal single load={() => fetchPromptForExport(info.id, user?.id).then((item) => (item ? [item] : []))} onClose={() => setModal(null)} />)}
      {modal === "stats" && info.stats && stop(<StatisticsModal target={info.stats} onClose={() => setModal(null)} />)}
      {modal === "suggest" && info.kind === "prompt" && target.kind === "prompt" && user &&
        stop(<SuggestEditModal promptId={info.id} proposerId={user.id} promptText={target.prompt.promptText} onClose={() => setModal(null)} />)}
      {modal === "delete" && info.kind === "prompt" && stop(<DeletePromptDialog promptId={info.id} deleting={busy} error={error} onConfirm={() => void performDelete()} onClose={closeModal} />)}
      {modal === "block" && (
        <BlockDialog author={info.author} onClose={() => setModal(null)} />
      )}
    </>
  );
}

function collectionProps(info: Resolved): { promptId?: string; workflowId?: string; presetId?: string; skillId?: string } {
  if (info.kind === "workflow") return { workflowId: info.id };
  if (info.kind === "preset") return { presetId: info.id };
  if (info.kind === "skill") return { skillId: info.id };
  return { promptId: info.id };
}


/** Menü açıkken kurulan satırlar: durum kancaları (takip, engel, sessize alma, ilgi, sabit) yalnız burada çalışır. */
function PostMenuRows({
  info,
  ids,
  extras,
  sheet,
  close,
  openModal,
  onEdit,
  onDelete,
  confirmingDelete,
  askDelete,
  performDelete,
  asksInDialog,
  confirmingRemove,
  askRemove,
  performRemove,
  busy,
  error,
}: {
  info: Resolved;
  ids: PostMenuItemId[];
  extras: PostMenuExtra[];
  sheet: boolean;
  close: () => void;
  openModal: (modal: ModalKind) => void;
  onEdit?: () => void;
  onDelete?: () => void;
  confirmingDelete: boolean;
  askDelete: () => void;
  performDelete: (close: () => void) => void;
  asksInDialog: boolean;
  confirmingRemove: boolean;
  askRemove: () => void;
  performRemove: () => void;
  busy: boolean;
  error: string | null;
}) {
  const { t } = useTranslation();
  const { openReport } = useReport();
  const has = (id: PostMenuItemId) => ids.includes(id);

  const pinKind = info.kind === "result" ? null : (info.kind as PinKind);
  const pin = usePinToggle(pinKind ?? "prompt", info.id, has("pin") && pinKind !== null);
  const follow = useFollowState(info.author, { enabled: has("follow") });
  const block = useBlockState(info.author, { enabled: has("block") });
  const personMute = useMuteToggle("actor", has("mute") ? info.author.id : null, info.author.displayName);
  const contentMute = useMuteToggle("content", has("notify") ? notificationHrefBase(info.href) : null, info.title);
  const interestKind = info.kind === "result" ? null : (info.kind as PinKind);
  const interest = usePostInterest(has("interested") && interestKind ? { kind: interestKind, id: info.id } : null);

  const fail = (err: unknown, fallbackKey: Parameters<typeof t>[0]) => {
    console.error("post menu", err);
    const message = err instanceof Error ? err.message : "";
    // Bilinen bir sunucu kodu (sabit sınırı, hız sınırı) istek katmanında zaten duyuruldu.
    if (message === friendlyServerMessage("pin_limit") || message === friendlyServerMessage("rate_limit")) return;
    announceNotice(t(fallbackKey));
  };

  const all: (ActionMenuRow & { order: number })[] = [];
  const add = (id: PostMenuItemId, row: Omit<ActionMenuRow, "group" | "key">) => {
    const layout = POST_MENU_LAYOUT[id];
    all.push({ key: id, group: layout.group, order: layout.order, ...row });
  };

  if (has("share")) add("share", { label: t("common.share"), icon: <Share2 size={16} />, onSelect: () => openModal("share"), attrs: { "data-post-menu-item": "share" } });
  if (has("space")) add("space", { label: t("spaces.add.menu"), icon: <Shapes size={16} />, onSelect: () => openModal("space"), attrs: { "data-add-to-space": "", "data-post-menu-item": "space" } });
  if (has("collection")) add("collection", { label: t("postMenu.addToCollection"), icon: <Bookmark size={16} />, onSelect: () => openModal("collection"), attrs: { "data-post-menu-item": "collection" } });
  if (has("export")) add("export", { label: t("exchange.export.menu"), icon: <Download size={16} />, onSelect: () => openModal("export"), attrs: { "data-export-prompt": "", "data-post-menu-item": "export" } });
  if (has("stats") && info.stats) add("stats", { label: t("postMenu.stats"), icon: <ChartNoAxesColumn size={16} />, onSelect: () => openModal("stats"), attrs: { "data-post-menu-item": "stats" } });
  if (has("edit")) {
    if (info.kind === "result") add("edit", { label: t("common.edit"), icon: <Pencil size={16} />, onSelect: onEdit, attrs: { "data-post-menu-item": "edit" } });
    else if (info.editHref) add("edit", { label: t("common.edit"), icon: <Pencil size={16} />, href: info.editHref + (info.communityId ? `&community=${info.communityId}` : ""), attrs: { "data-post-menu-item": "edit" } });
  }
  if (has("duplicate")) add("duplicate", { label: t("common.duplicate"), icon: <Copy size={16} />, href: `/create?duplicate=${info.id}`, attrs: { "data-post-menu-item": "duplicate" } });
  if (has("pin") && pinKind) {
    add("pin", {
      label: pin.pinned ? t("postMenu.unpin") : t("postMenu.pin"),
      icon: pin.pinned ? <PinOff size={16} /> : <Pin size={16} />,
      disabled: !pin.loaded,
      attrs: { "data-post-menu-item": "pin" },
      onSelect: () => {
        const next = !pin.pinned;
        pin
          .toggle()
          .then(() => announceNotice(t(next ? "postMenu.pinDone" : "postMenu.unpinDone")))
          .catch((err) => fail(err, "postMenu.pinFailed"));
      },
    });
  }
  if (has("suggest")) add("suggest", { label: t("prompt.suggestEdit"), icon: <PenLine size={16} />, onSelect: () => openModal("suggest"), attrs: { "data-post-menu-item": "suggest" } });
  if (has("follow")) {
    add("follow", {
      label: follow.isFollowing ? t("postMenu.unfollow") : t("postMenu.follow"),
      icon: follow.isFollowing ? <UserMinus size={16} /> : <UserPlus size={16} />,
      tone: follow.isFollowing ? "danger" : "default",
      disabled: follow.loading,
      onSelect: () => void follow.toggle(),
      attrs: { "data-post-menu-item": "follow" },
    });
  }
  if (has("interested")) {
    add("interested", { label: t("interest.yes"), icon: <Check size={16} />, tone: "positive", selected: interest.status === "interested", disabled: !interest.ready, onSelect: () => interest.answer(interest.status === "interested" ? null : "interested"), attrs: { "data-post-menu-item": "interested" } });
    add("notInterested", { label: t("interest.no"), icon: <X size={16} />, tone: "danger", selected: interest.status === "not_interested", disabled: !interest.ready, onSelect: () => interest.answer(interest.status === "not_interested" ? null : "not_interested"), attrs: { "data-post-menu-item": "not-interested" } });
  }
  if (has("notify")) {
    add("notify", {
      label: contentMute.muted ? t("postMenu.notifyResume") : t("postMenu.notifyPause"),
      icon: contentMute.muted ? <Bell size={16} /> : <BellOff size={16} />,
      disabled: !contentMute.loaded,
      attrs: { "data-post-menu-item": "notify" },
      onSelect: () => {
        contentMute
          .toggle()
          .then((nowMuted) => announceNotice(t(nowMuted ? "postMenu.notifyPaused" : "postMenu.notifyResumed")))
          .catch((err) => fail(err, "nc.actionFailed"));
      },
    });
  }
  if (has("mute")) {
    add("mute", {
      label: personMute.muted ? t("postMenu.unmute") : t("postMenu.mute"),
      icon: personMute.muted ? <Volume2 size={16} /> : <VolumeX size={16} />,
      tone: personMute.muted ? "default" : "danger",
      disabled: !personMute.loaded,
      attrs: { "data-post-menu-item": "mute" },
      onSelect: () => {
        personMute
          .toggle()
          .then((nowMuted) => announceNotice(t(nowMuted ? "nc.mutedPerson" : "nc.unmutedPerson", { name: info.author.displayName })))
          .catch((err) => fail(err, "nc.actionFailed"));
      },
    });
  }
  if (has("block")) {
    add("block", {
      label: block.isBlocked ? t("postMenu.unblock") : t("postMenu.block"),
      icon: <Ban size={16} />,
      tone: block.isBlocked ? "default" : "danger",
      disabled: block.loading,
      attrs: { "data-post-menu-item": "block" },
      onSelect: () => (block.isBlocked ? void block.toggle() : openModal("block")),
    });
  }
  const reportType = info.kind === "result" ? null : info.kind;
  if (has("report") && reportType) {
    add("report", {
      label: t("postMenu.report"),
      icon: <Flag size={16} />,
      tone: "danger",
      attrs: { "data-post-menu-item": "report" },
      onSelect: () => openReport({ type: reportType, id: info.id, title: info.title, subtitle: `@${info.author.username}` }),
    });
  }
  if (has("removeFromCollection")) {
    add("removeFromCollection", {
      label: confirmingRemove ? t("common.confirmDelete") : t("common.removeFromCollection"),
      icon: busy && confirmingRemove ? <Loader2 size={16} className="animate-spin" /> : <FolderMinus size={16} />,
      tone: "danger",
      keepOpen: true,
      disabled: busy,
      attrs: { "data-post-menu-item": "remove-from-collection" },
      onSelect: () => (confirmingRemove ? performRemove() : askRemove()),
    });
  }
  if (has("delete")) {
    add("delete", {
      label: confirmingDelete && !asksInDialog && !onDelete ? t("common.confirmDelete") : t("common.delete"),
      icon: busy && confirmingDelete ? <Loader2 size={16} className="animate-spin" /> : <TrashIcon size={16} />,
      tone: "danger",
      keepOpen: !onDelete && !asksInDialog,
      disabled: busy,
      attrs: { "data-post-menu-item": "delete" },
      onSelect: () => {
        if (onDelete) onDelete();
        else if (asksInDialog) openModal("delete");
        else if (confirmingDelete) performDelete(close);
        else askDelete();
      },
    });
  }

  // Üstten gelen ekstralar (İlişki haritası, İlgimi çekiyor/çekmiyor [Sana özel akışı], topluluk işleri…) kendi grubunda/sırasında araya girer.
  const extraRows: (ActionMenuRow & { order: number })[] = extras.map((extra) => ({
    key: `extra-${extra.key}`,
    label: extra.label,
    icon: extra.icon,
    group: extra.group ?? "content",
    order: extra.order ?? 1000,
    tone: extra.tone ?? (extra.danger ? "danger" : "default"),
    selected: extra.selected,
    onSelect: extra.onSelect,
    attrs: { "data-post-menu-extra": extra.key },
  }));
  all.push(...extraRows);
  all.sort((a, b) => POST_MENU_GROUPS.indexOf(a.group as PostMenuGroup) - POST_MENU_GROUPS.indexOf(b.group as PostMenuGroup) || a.order - b.order);

  return (
    <>
      <ActionMenuRows rows={all} close={close} sheet={sheet} />
      {error && (
        <p role="alert" className="px-3 py-1 text-caption text-danger">
          {error}
        </p>
      )}
    </>
  );
}

/** "Engelle" onayı: engelleme geri alınabilir ama etkisi büyüktür (takip, görünürlük, etkileşim kesilir). */
function BlockDialog({ author, onClose }: { author: UserProfile; onClose: () => void }) {
  const { t } = useTranslation();
  const block = useBlockState(author);
  const [busy, setBusy] = useState(false);
  return (
    <div onClick={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
      <ConfirmDialog
        id="post-block-title"
        title={t("postMenu.blockTitle", { name: author.displayName })}
        body={t("postMenu.blockBody")}
        confirmLabel={t("postMenu.block")}
        danger
        busy={busy || block.loading}
        error={null}
        onCancel={onClose}
        onConfirm={() => {
          setBusy(true);
          void block.toggle().finally(() => {
            setBusy(false);
            onClose();
          });
        }}
      />
    </div>
  );
}
