"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import type { IconComponent } from "@/components/icons/icon";
import { Modal } from "@/components/ui/modal";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { useSpaceContext } from "@/features/spaces/space-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchSpaceItems, fetchSpacePalettes, updateSpaceItem } from "@/lib/supabase/spaces";
import { attachContent } from "@/lib/supabase/team-board";
import { teamCreateHref, type TeamCreateKind } from "@/lib/team-create";
import { ContentPickerDialog } from "./content-picker";

/**
 * "Ekle" — dosyada ve panoda AYNI satırlar, AYNI davranış (docs/history/376-*): Prompt, İstek, Workflow ve Ayar paketi için iki eylem.
 *  - Oluştur: gerçek oluşturma ekranı açılır (formda yazılmaz); bağlam `?teamProject=&teamFile=[&teamBoard=]` ile gider, içerik ekibe özgü
 *    oluşur ve yayınlanınca dosyaya (panodan gelindiyse panoya da) eklenir.
 *  - Seç: `ContentPickerDialog` (Paylaştıklarım / Başkalarının paylaştıkları + gelişmiş arama). Seçilen içerik dosyaya başvuru olarak girer.
 * İki yüzey de (dosya "Ekle" penceresi ve pano araç çubuğu) bu satır tanımını ve `useContentAdd`'i kullanır; ikinci bir ekleme yolu yazılmaz.
 */

export interface ContentAddRow {
  key: string;
  kind: TeamCreateKind;
  icon: IconComponent;
  label: TranslationKey;
  hint: TranslationKey;
}

const KINDS: { kind: TeamCreateKind; icon: IconComponent }[] = [
  { kind: "prompt", icon: SquareTerminal },
  { kind: "request", icon: Sparkles },
  { kind: "workflow", icon: WorkflowIcon },
  { kind: "preset", icon: SlidersHorizontal },
];

/** Tür başına TEK satır ("Prompt"): dokununca ekranın ortasında "Oluştur" / "Seç" seçimi açılır (`ContentAddChoice`). */
export const CONTENT_ADD_ROWS: ContentAddRow[] = KINDS.map(({ kind, icon }) => ({
  key: kind,
  kind,
  icon,
  label: `tf.add.kind.${kind}` as TranslationKey,
  hint: `tf.add.kindHint.${kind}` as TranslationKey,
}));

/** Ekranın ortasında açılan küçük pencere: bu türden yeni bir içerik oluştur ya da paylaşılmış olanı seç. */
function ContentAddChoice({ kind, onCreate, onPick, onClose }: { kind: TeamCreateKind; onCreate: () => void; onPick: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const titleId = `content-add-choice-${kind}`;
  return (
    <Modal onClose={onClose} labelledBy={titleId} overLayers centered>
      <div className="w-full max-w-sm space-y-4 rounded-lg border border-border bg-surface p-5" data-content-add-choice={kind}>
        <h2 id={titleId} className="text-h3 font-bold text-text">
          {t(`tf.add.choiceTitle.${kind}` as TranslationKey)}
        </h2>
        <div className="grid gap-3">
          <button type="button" onClick={onCreate} data-add-choice="create" className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-3.5 text-left transition-colors hover:bg-surface-soft">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Plus size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-small font-bold text-text">{t("tf.add.choice.create")}</span>
              <span className="block text-caption text-text-secondary">{t(`tf.add.createHint.${kind}` as TranslationKey)}</span>
            </span>
          </button>
          <button type="button" onClick={onPick} data-add-choice="pick" className="flex items-center gap-3 rounded-lg border border-border-soft bg-surface p-3.5 text-left transition-colors hover:bg-surface-soft">
            <span aria-hidden className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
              <Search size={20} />
            </span>
            <span className="min-w-0">
              <span className="block text-small font-bold text-text">{t("tf.add.choice.pick")}</span>
              <span className="block text-caption text-text-secondary">{t(`tf.add.pickHint.${kind}` as TranslationKey)}</span>
            </span>
          </button>
        </div>
      </div>
    </Modal>
  );
}

export interface ContentAddTarget {
  projectId: string;
  fileId: string;
  /** Panodan eklenirse o pano (yansıma da kurulur); dosyadan eklenirse null. */
  boardId: string | null;
  /** Klasörün (grup) içinden eklenirse o grup (docs/history/378-*): oluşturma dönüşünde ve "Seç"te içerik bu gruba girer. */
  groupId?: string | null;
}

/**
 * Seçilen satırı çalıştırır ve gerekli pencereyi (`dialog`) verir. `useSpaceContext` içinde kullanılır: dosya eklemesi bitince açık alanın
 * öğeleri/paletleri sunucudan yeniden okunur (yerleşim kaydı bekliyorsa önce yazılır).
 */
export function useContentAdd(target: ContentAddTarget | null): { run: (row: ContentAddRow) => void; dialog: ReactNode } {
  const router = useRouter();
  const { space, items, setItems, setPalettes, flushLayout } = useSpaceContext();
  const [choosing, setChoosing] = useState<TeamCreateKind | null>(null);
  const [picking, setPicking] = useState<TeamCreateKind | null>(null);

  const refresh = useCallback(async () => {
    await flushLayout().catch(() => undefined);
    const [fresh, palettes] = await Promise.all([fetchSpaceItems(space.id), fetchSpacePalettes(space.id, true).catch(() => null)]);
    setItems(() => fresh);
    if (palettes) setPalettes(() => palettes);
  }, [space.id, flushLayout, setItems, setPalettes]);

  const already = useMemo(() => {
    const ids = new Set<string>();
    for (const item of items) {
      if (item.kind === "prompt" && !item.isDraft && item.promptId) ids.add(item.promptId);
      else if (item.kind === "content" && item.contentId) ids.add(item.contentId);
    }
    return ids;
  }, [items]);

  const run = useCallback(
    (row: ContentAddRow) => {
      if (target) setChoosing(row.kind);
    },
    [target],
  );

  const choice =
    choosing && target ? (
      <ContentAddChoice
        kind={choosing}
        onClose={() => setChoosing(null)}
        onCreate={() => {
          setChoosing(null);
          router.push(teamCreateHref(choosing, target));
        }}
        onPick={() => {
          setChoosing(null);
          setPicking(choosing);
        }}
      />
    ) : null;

  const dialog =
    picking && target ? (
      <ContentPickerDialog
        kind={picking}
        alreadyIds={already}
        onClose={() => setPicking(null)}
        onPick={async (picked) => {
          const attached = await attachContent({ fileId: target.fileId, type: picking, id: picked.id, boardId: target.boardId });
          if (target.groupId) await updateSpaceItem(attached.itemId, { groupId: target.groupId }).catch(() => undefined);
          await refresh();
        }}
      />
    ) : null;

  return {
    run,
    dialog: (
      <>
        {choice}
        {dialog}
      </>
    ),
  };
}
