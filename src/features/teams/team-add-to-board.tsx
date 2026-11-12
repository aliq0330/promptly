"use client";

import { useState } from "react";
import { Plus } from "@/components/icons/plus";
import { Presentation } from "@/components/icons/presentation";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useSpaceContext } from "@/features/spaces/space-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { transferItems } from "@/lib/supabase/team-board";
import { createBoard } from "@/lib/supabase/team-projects";
import { cn } from "@/lib/utils";

/**
 * "Panoya ekle" (docs/history/376-*): dosyanın öğeleri görünmez bir kapta durur, pano değildir (docs/history/368-*). Bu pencere öğeyi projedeki
 * mevcut bir panoya aktarır (sunucu: `team_transfer_items` — dosya kabı ile pano arasında aktarım serbesttir); proje/dosyada hiç pano yoksa
 * "Pano ekle" ile önce pano açılır. Varsayılan TAŞIMADIR (öğe panoya aittir); "Dosyada da kalsın" kopyalar. Onaylı içeriği yalnız lider taşıyabilir,
 * düzenleyici kopyalar — sunucu atlananı sayar, hiç öğe aktarılmazsa burada açıkça söylenir.
 */

export interface BoardChoice {
  id: string;
  title: string;
  /** Panonun dosyası (proje geneli panoda `null`). */
  fileId: string | null;
  fileTitle: string | null;
  itemCount: number;
}

const NEW_BOARD = "__new__";

export function AddToBoardDialog({
  item,
  projectId,
  fileId,
  boards,
  onClose,
  onDone,
}: {
  item: SpaceItem;
  projectId: string;
  /** Yeni pano bu dosyada açılır; `null` (eski proje geneli alan) ise "Pano ekle" sunulmaz. */
  fileId: string | null;
  boards: BoardChoice[];
  onClose: () => void;
  onDone: (boardId: string, newItemId: string | null) => void;
}) {
  const { t } = useTranslation();
  const { space } = useSpaceContext();
  const canCreate = Boolean(fileId);
  const [selected, setSelected] = useState<string | null>(boards.length === 0 && canCreate ? NEW_BOARD : null);
  const [title, setTitle] = useState("");
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Aynı dosyanın panoları önce, diğer dosyalar ve proje geneli sonra.
  const sameFile = boards.filter((board) => board.fileId === fileId);
  const others = boards.filter((board) => board.fileId !== fileId);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selected) return setError(t("tp.addToBoard.pick"));
    if (selected === NEW_BOARD && !title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    setError(null);
    try {
      const boardId = selected === NEW_BOARD ? await createBoard(projectId, title.trim(), fileId ?? "") : selected;
      const result = await transferItems({ fromSpace: space.id, toSpace: boardId, items: [item], copy: keep });
      if (result.done === 0) {
        setError(t("tb.move.none"));
        // Yeni pano açıldıysa seçili kalır: tekrar deneme panoyu ikinci kez açmaz.
        if (selected === NEW_BOARD) setSelected(boardId);
        setBusy(false);
        return;
      }
      onDone(boardId, result.newIds[0] ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
      setBusy(false);
    }
  };

  const row = (board: BoardChoice, showFile: boolean) => (
    <li key={board.id}>
      <button
        type="button"
        role="radio"
        aria-checked={selected === board.id}
        onClick={() => setSelected(board.id)}
        data-add-to-board={board.id}
        className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border px-3 text-left transition-colors", selected === board.id ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft")}
      >
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
          <Presentation size={18} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-small font-bold text-text">{board.title}</span>
          <span className="block truncate text-caption text-text-secondary">
            {showFile && board.fileTitle ? `${board.fileTitle} · ` : ""}
            {t("tp.addToBoard.items", { count: board.itemCount })}
          </span>
        </span>
        <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-full border-2", selected === board.id ? "border-primary" : "border-border-strong")}>
          {selected === board.id && <span className="h-2.5 w-2.5 rounded-full bg-primary" />}
        </span>
      </button>
    </li>
  );

  return (
    <SpaceDialog
      title={t("tp.item.addToBoard")}
      onClose={onClose}
      busy={busy}
      onSubmit={(event) => void submit(event)}
      formTestId="add-to-board-form"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <SubmitButton busy={busy} disabled={!selected}>
            {t("tp.item.addToBoard")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        {boards.length === 0 && (
          <p className="rounded-xl bg-surface-soft px-3 py-2.5 text-small text-text-secondary" data-add-to-board-empty>
            {t(canCreate ? "tp.addToBoard.noBoards" : "tp.addToBoard.noBoardsNoFile")}
          </p>
        )}
        {boards.length > 0 && (
          <div role="radiogroup" aria-label={t("tp.addToBoard.pick")} className="space-y-3">
            {sameFile.length > 0 && <ul className="space-y-2">{sameFile.map((board) => row(board, false))}</ul>}
            {others.length > 0 && (
              <>
                {sameFile.length > 0 && <p className="text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tp.addToBoard.otherFiles")}</p>}
                <ul className="space-y-2">{others.map((board) => row(board, true))}</ul>
              </>
            )}
          </div>
        )}
        {canCreate && (
          <div className="space-y-2">
            <button
              type="button"
              role="radio"
              aria-checked={selected === NEW_BOARD}
              onClick={() => setSelected(NEW_BOARD)}
              data-add-to-board-new=""
              className={cn("flex min-h-14 w-full items-center gap-3 rounded-2xl border border-dashed px-3 text-left transition-colors", selected === NEW_BOARD ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-soft")}
            >
              <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <Plus size={18} />
              </span>
              <span className="text-small font-bold text-text">{t("tp.board.new")}</span>
            </button>
            {selected === NEW_BOARD && (
              <div>
                <label htmlFor="add-to-board-title" className={fieldLabelClassName}>
                  {t("tp.name.board")}
                </label>
                <input
                  id="add-to-board-title"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={80}
                  placeholder={t("tp.name.boardPlaceholder")}
                  className={fieldInputClassName}
                  data-add-to-board-title=""
                />
              </div>
            )}
          </div>
        )}
        <label className="flex min-h-11 items-center gap-2.5 text-small font-semibold text-text">
          <input type="checkbox" checked={keep} onChange={(event) => setKeep(event.target.checked)} className="h-5 w-5 accent-[var(--color-primary)]" data-add-to-board-keep="" />
          {t("tp.addToBoard.keep")}
        </label>
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
