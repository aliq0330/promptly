"use client";

import { ChevronRight, Eye } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useKeyboardViewport } from "@/lib/use-keyboard-viewport";
import { cn } from "@/lib/utils";
import type { DraftVariable } from "./prompt-text-editor";

/**
 * Prompt formunun telefon düzeninde (`lg` altı) ekranın altına sabitlenen yuva (docs/history/286-*): sağ sütun (canlı önizleme) yokken
 * iki şey kalır.
 *  - Prompt metni yazılırken (`editing`): klavyenin hemen üstünde tek satırlık önizleme (dokununca önizleme sayfası) ve değişken çipleri
 *    (dokununca imlece `{ad}` ekler) + "Yeni". Düğmeler `mousedown`'ı yutar: düzenleyici odağını ve klavyeyi kaybetmez.
 *  - Aksi hâlde: Taslak | Paylaş çubuğu.
 * Klavye açıkken yuva görünür alanın (`visualViewport`) altına oturur — iOS Safari düzen görünümünü küçültmez.
 */
export function PromptMobileDock({
  editing,
  line,
  variables,
  onOpenPreview,
  onInsert,
  onCreate,
  onSaveDraft,
  onPublish,
  publishLabel,
  publishDimmed,
  busy,
}: {
  editing: boolean;
  /** Çözülmüş prompt metni (tek satıra kırpılır). */
  line: string;
  variables: DraftVariable[];
  onOpenPreview: () => void;
  onInsert: (name: string) => void;
  onCreate: () => void;
  onSaveDraft?: () => void;
  onPublish: () => void;
  publishLabel: string;
  publishDimmed: boolean;
  busy: boolean;
}) {
  const { t } = useTranslation();
  const keyboard = useKeyboardViewport();
  const lift = keyboard && typeof window !== "undefined" ? Math.max(0, window.innerHeight - (keyboard.top + keyboard.height)) : 0;
  const keepFocus = (event: React.SyntheticEvent) => event.preventDefault();

  return (
    <div data-compose-dock="" className="fixed inset-x-0 z-30 border-t border-border-soft bg-background lg:hidden" style={{ bottom: lift }}>
      {editing ? (
        <div data-compose-dock-editing="">
          <button
            type="button"
            onMouseDown={keepFocus}
            onPointerDown={keepFocus}
            onClick={onOpenPreview}
            data-compose-dock-preview=""
            className="mx-2.5 mt-2 flex w-[calc(100%-1.25rem)] items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-left text-[0.6875rem] text-text-secondary"
          >
            <Eye size={14} aria-hidden className="shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate">{line || t("studio.emptyText")}</span>
            <ChevronRight size={14} aria-hidden className="shrink-0 text-text-muted" />
          </button>
          <div className="flex gap-1.5 overflow-x-auto px-2.5 py-2 scrollbar-none" role="toolbar" aria-label={t("studio.values")}>
            {variables.map((variable) => (
              <button
                key={variable.tempId}
                type="button"
                onMouseDown={keepFocus}
            onPointerDown={keepFocus}
                onClick={() => onInsert(variable.name)}
                data-compose-dock-variable={variable.name}
                className="shrink-0 rounded-md bg-primary-soft px-2.5 py-1.5 font-mono text-[0.6875rem] font-medium text-primary"
              >{`{${variable.name}}`}</button>
            ))}
            <button
              type="button"
              onMouseDown={keepFocus}
            onPointerDown={keepFocus}
              onClick={onCreate}
              data-compose-dock-new=""
              className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-[0.6875rem] font-semibold text-primary-foreground"
            >
              + {t("studio.newShort")}
            </button>
          </div>
        </div>
      ) : (
        <div data-compose-bar="" className="flex gap-2 px-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] pt-2">
          {onSaveDraft && (
            <Button type="button" variant="outline" size="md" disabled={busy} onClick={onSaveDraft} data-compose-bar-draft="" className="flex-1">
              {t("compose.draft")}
            </Button>
          )}
          <Button type="button" size="md" disabled={busy} onClick={onPublish} data-compose-bar-publish="" className={cn("flex-1", publishDimmed && "opacity-60")}>
            {publishLabel}
          </Button>
        </div>
      )}
    </div>
  );
}

/** Telefonda önizleme satırına dokununca açılan sayfa: sağ sütunun aynı içeriği (kart, kopyalanacak metin, değerler), altta "Yeni değişken | Bitti". */
export function PromptPreviewSheet({ onClose, onCreate, children }: { onClose: () => void; onCreate: () => void; children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <SpaceDialog
      title={t("studio.previewTitle")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="outline" size="md" onClick={onCreate} className="flex-1">
            {t("studio.newVariable")}
          </Button>
          <Button type="button" size="md" onClick={onClose} data-testid="preview-sheet-done" className="flex-1">
            {t("studio.done")}
          </Button>
        </>
      }
    >
      <div data-preview-sheet="" className="flex flex-col gap-3">
        {children}
      </div>
    </SpaceDialog>
  );
}
