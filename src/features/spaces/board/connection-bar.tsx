"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, ArrowRight, Check, Minus, MoreHorizontal, Spline, Trash2, X, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import { CONNECTOR_ARROWS, CONNECTOR_ROUTES, CONNECTOR_STYLES } from "@/lib/space-connectors";
import type { SpaceConnection, SpaceConnectionPatch } from "@/lib/supabase/spaces";
import { SPACE_COLORS } from "@/lib/spaces";
import { cn } from "@/lib/utils";
import { SpaceMenu } from "../space-menu";
import { SPACE_COLOR_CLASS } from "../space-visuals";

const STYLE_ICON: Record<(typeof CONNECTOR_STYLES)[number], LucideIcon> = { solid: Minus, dashed: MoreHorizontal, dotted: MoreHorizontal };
const ARROW_ICON: Record<(typeof CONNECTOR_ARROWS)[number], LucideIcon> = { end: ArrowRight, start: ArrowRight, both: ArrowLeftRight, none: Minus };
const ROUTE_ICON: Record<(typeof CONNECTOR_ROUTES)[number], LucideIcon> = { curve: Spline, straight: Minus, elbow: ArrowRight };

/**
 * Seçili okun düzenleme çubuğu (docs/history/262-*): etiket, çizgi stili, ok başı, yol, renk, yönü çevir, sil. Yalnız düzenleyiciye;
 * görüntüleyici oku seçip etiketini okuyabilir ama değiştiremez (çubuk yalnız "seçimi bırak" gösterir).
 */
export function ConnectionBar({
  connection,
  editable,
  onPatch,
  onReverse,
  onDelete,
  onClose,
}: {
  connection: SpaceConnection;
  editable: boolean;
  onPatch: (patch: SpaceConnectionPatch) => void;
  onReverse: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(connection.label);
  // Başka bir ok seçilince ya da etiket dışarıdan değişince alan yeniden doldurulur.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- the field mirrors the selected arrow's label
    setLabel(connection.label);
  }, [connection.id, connection.label]);
  const commitLabel = () => {
    const next = label.trim();
    if (next !== connection.label) onPatch({ label: next });
  };

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <div role="toolbar" aria-label={t("spaces.connect.selected")} data-board-connection-bar={connection.id} className="scrollbar-none pointer-events-auto flex max-w-full items-center gap-1 overflow-x-auto rounded-full border border-border-soft bg-surface px-2 py-1 shadow-pop">
        {editable ? (
          <>
            <input
              value={label}
              maxLength={80}
              onChange={(event) => setLabel(event.target.value)}
              onBlur={commitLabel}
              onKeyDown={(event) => {
                event.stopPropagation();
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitLabel();
                  (event.target as HTMLInputElement).blur();
                }
              }}
              placeholder={t("spaces.connect.labelPlaceholder")}
              aria-label={t("spaces.connect.labelField")}
              className="h-8 w-36 shrink-0 rounded-full border border-border bg-surface-soft px-3 text-small text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
            />
            <SpaceMenu
              label={t("spaces.connect.style")}
              align="left"
              trigger={<Minus size={17} aria-hidden />}
              items={CONNECTOR_STYLES.map((style) => ({ key: style, label: `${connection.lineStyle === style ? "✓ " : ""}${t(`spaces.connect.style.${style}`)}`, icon: STYLE_ICON[style], onSelect: () => onPatch({ lineStyle: style }) }))}
            />
            <SpaceMenu
              label={t("spaces.connect.arrow")}
              align="left"
              trigger={<ArrowRight size={17} aria-hidden />}
              items={CONNECTOR_ARROWS.map((arrow) => ({ key: arrow, label: `${connection.arrow === arrow ? "✓ " : ""}${t(`spaces.connect.arrow.${arrow}`)}`, icon: ARROW_ICON[arrow], onSelect: () => onPatch({ arrow }) }))}
            />
            <SpaceMenu
              label={t("spaces.connect.route")}
              align="left"
              trigger={<Spline size={17} aria-hidden />}
              items={CONNECTOR_ROUTES.map((route) => ({ key: route, label: `${connection.route === route ? "✓ " : ""}${t(`spaces.connect.route.${route}`)}`, icon: ROUTE_ICON[route], onSelect: () => onPatch({ route }) }))}
            />
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border-soft" />
            <div role="radiogroup" aria-label={t("spaces.connect.color")} className="flex shrink-0 items-center gap-1 px-1">
              {SPACE_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={connection.color === color}
                  aria-label={t(`spaces.color.${color}`)}
                  title={t(`spaces.color.${color}`)}
                  onClick={() => onPatch({ color })}
                  className={cn("flex h-6 w-6 items-center justify-center rounded-full ring-offset-2 ring-offset-surface", SPACE_COLOR_CLASS[color].dot, connection.color === color && "ring-2 ring-primary")}
                >
                  {connection.color === color && <Check size={12} className="text-background" aria-hidden />}
                </button>
              ))}
            </div>
            <span aria-hidden className="mx-0.5 h-5 w-px shrink-0 bg-border-soft" />
            <BarButton icon={ArrowLeftRight} label={t("spaces.connect.reverse")} onClick={onReverse} />
            <BarButton icon={Trash2} label={t("spaces.connect.delete")} onClick={onDelete} danger />
          </>
        ) : (
          <span className="shrink-0 px-2 text-caption font-semibold text-text-secondary">{connection.label || t("spaces.connect.selected")}</span>
        )}
        <BarButton icon={X} label={t("spaces.connect.clear")} onClick={onClose} />
      </div>
    </div>
  );
}

function BarButton({ icon: Icon, label, onClick, danger }: { icon: LucideIcon; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors", danger ? "text-danger hover:bg-danger/10" : "text-text-secondary hover:bg-surface-soft hover:text-text")}
    >
      <Icon size={17} aria-hidden />
    </button>
  );
}
