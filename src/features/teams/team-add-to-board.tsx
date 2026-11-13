"use client";

import { useEffect, useState } from "react";
import { Check } from "@/components/icons/check";
import { Plus } from "@/components/icons/plus";
import { Presentation } from "@/components/icons/presentation";
import { Button } from "@/components/ui/button";
import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { FormError, SubmitButton } from "@/features/spaces/space-forms";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchPlacements, placeItems } from "@/lib/supabase/team-board";
import { createBoard } from "@/lib/supabase/team-projects";
import { cn } from "@/lib/utils";

/**
 * "Panoya ekle" (docs/history/376-*): dosya asıl, pano yalnız gösterim yeridir. Bu pencere dosyadaki bir öğeyi AYNI dosyanın bir ya da
 * birkaç panosunda gösterir (yansıma kurar; öğe taşınmaz, kopyalanmaz, dosyada kalır). Zaten gösterildiği panolar işaretli ve seçilemez;
 * dosyada hiç pano yoksa ya da yenisi istenirse "Pano ekle" ile önce pano açılır. Sunucu yalnız görünen öğeyi yerleştirir ve atlananı sayar —
 * hiç yerleştirilmezse burada açıkça söylenir. Yansıma kimliği verilse bile asıl öğe yerleştirilir.
 */

export interface BoardChoice {
  id: string;
  title: string;
  /** Panonun dosyası (proje geneli panoda `null`). */
  fileId: string | null;
  fileTitle: string | null;
  itemCount: number;
}

export function AddToBoardDialog({
  itemIds,
  projectId,
  fileId,
  boards,
  onClose,
  onDone,
}: {
  /** Yerleştirilecek öğelerin kimlikleri (docs/history/378-*: birden çok öğe toplu eklenir; yansıma kimliği de verilebilir, sunucu asıl öğeyi yerleştirir). */
  itemIds: string[];
  projectId: string;
  /** Yeni pano bu dosyada açılır; yerleştirme yalnız bu dosyanın panolarına yapılır. */
  fileId: string;
  boards: BoardChoice[];
  onClose: () => void;
  /** Yerleştirilen panolar (yeni açılan dahil) ve ilk yerleştirmenin pano satırı kimliği (odak için). */
  onDone: (boardIds: string[], firstBoardItemId: string | null) => void;
}) {
  const { t } = useTranslation();
  const own = boards.filter((board) => board.fileId === fileId);
  const [placed, setPlaced] = useState<Set<string> | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [creating, setCreating] = useState(own.length === 0);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tek öğede zaten gösterildiği panolar işaretli ve seçilemez; toplu eklemede panonun hepsi seçilebilir (sunucu görünmeyeni/zaten olanı atlar ve sayar).
  const idsKey = itemIds.join(",");
  const single = itemIds.length === 1 ? itemIds[0] : null;
  useEffect(() => {
    if (!single) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- toplu eklemede yerleşim okunmaz
      setPlaced(new Set());
      return;
    }
    let alive = true;
    fetchPlacements([single]).then(
      (map) => alive && setPlaced(new Set(map.get(single) ?? [])),
      () => alive && setPlaced(new Set()),
    );
    return () => {
      alive = false;
    };
  }, [single, idsKey]);

  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const nothingChosen = selected.size === 0 && !creating;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (nothingChosen) return setError(t("tp.addToBoard.pick"));
    if (creating && !title.trim()) return setError(t("tp.error.titleRequired"));
    setBusy(true);
    setError(null);
    try {
      const targets = [...selected];
      if (creating) targets.push(await createBoard(projectId, title.trim(), fileId));
      let first: string | null = null;
      let done = 0;
      const boardIds: string[] = [];
      for (const board of targets) {
        const result = await placeItems(board, itemIds);
        if (result.placed > 0) {
          done += result.placed;
          boardIds.push(board);
          first ??= result.ids[0] ?? null;
        }
      }
      if (done === 0) {
        setError(t("tb.move.none"));
        // Yeni pano açıldıysa seçili kalır: tekrar deneme panoyu ikinci kez açmaz.
        if (creating) {
          const created = targets[targets.length - 1];
          setSelected(new Set([...selected, created]));
          setCreating(false);
        }
        setBusy(false);
        return;
      }
      onDone(boardIds, first);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
      setBusy(false);
    }
  };

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
          <SubmitButton busy={busy} disabled={nothingChosen}>
            {t("tp.item.addToBoard")}
          </SubmitButton>
        </>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-surface-soft px-3 py-2.5 text-small text-text-secondary" data-add-to-board-note>
          {t("tf.addToBoard.note")}
        </p>
        {own.length === 0 && (
          <p className="rounded-xl bg-surface-soft px-3 py-2.5 text-small text-text-secondary" data-add-to-board-empty>
            {t("tp.addToBoard.noBoards")}
          </p>
        )}
        {own.length > 0 && (
          <ul className="space-y-2" role="group" aria-label={t("tp.addToBoard.pick")}>
            {own.map((board) => {
              const here = placed?.has(board.id) === true;
              const on = here || selected.has(board.id);
              return (
                <li key={board.id}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    disabled={here || busy}
                    onClick={() => toggle(board.id)}
                    data-add-to-board={board.id}
                    data-add-to-board-placed={here ? "" : undefined}
                    className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border px-3 text-left transition-colors disabled:opacity-50", on ? "border-primary bg-primary-soft" : "border-border-soft bg-surface hover:bg-surface-soft")}
                  >
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                      <Presentation size={18} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-bold text-text">{board.title}</span>
                      <span className="block truncate text-caption text-text-secondary">{here ? t("tf.addToBoard.already") : t("tp.addToBoard.items", { count: board.itemCount })}</span>
                    </span>
                    <span aria-hidden className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md border-2", on ? "border-primary bg-primary text-primary-foreground" : "border-border-strong")}>
                      {on && <Check size={12} />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="space-y-2">
          <button
            type="button"
            role="checkbox"
            aria-checked={creating}
            onClick={() => setCreating((open) => !open)}
            data-add-to-board-new=""
            className={cn("flex min-h-14 w-full items-center gap-3 rounded-lg border border-dashed px-3 text-left transition-colors", creating ? "border-primary bg-primary-soft" : "border-border hover:bg-surface-soft")}
          >
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Plus size={18} />
            </span>
            <span className="text-small font-bold text-text">{t("tp.board.new")}</span>
          </button>
          {creating && (
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
        <FormError message={error} />
      </div>
    </SpaceDialog>
  );
}
