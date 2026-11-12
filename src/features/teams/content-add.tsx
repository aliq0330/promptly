"use client";

import { useRouter } from "next/navigation";
import { useCallback, useMemo, useState, type ReactNode } from "react";
import type { IconComponent } from "@/components/icons/icon";
import { SlidersHorizontal } from "@/components/icons/sliders-horizontal";
import { Sparkles } from "@/components/icons/sparkles";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { Workflow as WorkflowIcon } from "@/components/icons/workflow";
import { useSpaceContext } from "@/features/spaces/space-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { fetchSpaceItems, fetchSpacePalettes } from "@/lib/supabase/spaces";
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
  mode: "create" | "pick";
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

export const CONTENT_ADD_ROWS: ContentAddRow[] = KINDS.flatMap(({ kind, icon }) => [
  { key: `create-${kind}`, kind, mode: "create" as const, icon, label: `tf.add.create.${kind}` as TranslationKey, hint: `tf.add.createHint.${kind}` as TranslationKey },
  { key: `pick-${kind}`, kind, mode: "pick" as const, icon, label: `tf.add.pick.${kind}` as TranslationKey, hint: `tf.add.pickHint.${kind}` as TranslationKey },
]);

export interface ContentAddTarget {
  projectId: string;
  fileId: string;
  /** Panodan eklenirse o pano (yansıma da kurulur); dosyadan eklenirse null. */
  boardId: string | null;
}

/**
 * Seçilen satırı çalıştırır ve gerekli pencereyi (`dialog`) verir. `useSpaceContext` içinde kullanılır: dosya eklemesi bitince açık alanın
 * öğeleri/paletleri sunucudan yeniden okunur (yerleşim kaydı bekliyorsa önce yazılır).
 */
export function useContentAdd(target: ContentAddTarget | null): { run: (row: ContentAddRow) => void; dialog: ReactNode } {
  const router = useRouter();
  const { space, items, setItems, setPalettes, flushLayout } = useSpaceContext();
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
      if (!target) return;
      if (row.mode === "create") router.push(teamCreateHref(row.kind, target));
      else setPicking(row.kind);
    },
    [router, target],
  );

  const dialog =
    picking && target ? (
      <ContentPickerDialog
        kind={picking}
        alreadyIds={already}
        onClose={() => setPicking(null)}
        onPick={async (picked) => {
          await attachContent({ fileId: target.fileId, type: picking, id: picked.id, boardId: target.boardId });
          await refresh();
        }}
      />
    ) : null;

  return { run, dialog };
}
