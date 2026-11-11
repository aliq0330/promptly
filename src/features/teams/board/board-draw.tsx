"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { SPACE_COLOR_CLASS } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SPACE_COLORS, SPACE_ITEM_BODY_MAX, SPACE_ITEM_TITLE_MAX, type SpaceColor } from "@/lib/spaces";
import { parseShape, parseText, STROKE_WIDTHS, TEXT_SIZES, TEXT_SIZE_PX, type ShapeData, type TextData, type TextSize } from "@/lib/team-board";
import type { SpaceItem } from "@/lib/supabase/spaces";
import { cn } from "@/lib/utils";

/**
 * Ekip panosunun çizim öğeleri (docs/history/367-*): çerçeve, metin, şekil (dikdörtgen/oval/çizgi/ok/serbest kalem). Renkler token'dır (hex yok).
 * Şekiller SVG'dir ve kutunun GERÇEK ölçüsünde çizilir (çizgi kalınlığı yakınlaştırmayla birlikte ölçeklenir).
 */

export const COLOR_VAR: Record<SpaceColor, string> = {
  neutral: "var(--color-text-secondary)",
  primary: "var(--color-primary)",
  secondary: "var(--color-secondary)",
  success: "var(--color-success)",
  warning: "var(--color-warning)",
  danger: "var(--color-danger)",
};

/** Çerçeve: iç alan olayları geçirir (içindeki öğelerle seçim kutusu çizilebilsin); yalnız başlık ve kenar şeritleri taşır/seçer. */
function FrameBody({ item, lowDetail }: { item: SpaceItem; lowDetail: boolean }) {
  const { t } = useTranslation();
  return (
    <div className="relative h-full w-full" data-frame-body="">
      <div className="absolute inset-0 rounded-md border border-border-strong bg-surface shadow-card" />
      <span className="pointer-events-auto absolute inset-x-0 top-0 h-3 cursor-move" aria-hidden />
      <span className="pointer-events-auto absolute inset-x-0 bottom-0 h-3 cursor-move" aria-hidden />
      <span className="pointer-events-auto absolute inset-y-0 left-0 w-3 cursor-move" aria-hidden />
      <span className="pointer-events-auto absolute inset-y-0 right-0 w-3 cursor-move" aria-hidden />
      {!lowDetail && (
        <span className={cn("pointer-events-auto absolute -top-6 left-0 max-w-full cursor-move truncate text-caption font-semibold", SPACE_COLOR_CLASS[item.color].text)} data-frame-title="">
          {item.title || t("tb.kind.frame")}
        </span>
      )}
    </div>
  );
}

function TextBody({ item }: { item: SpaceItem }) {
  const data = parseText(item.data);
  return (
    <div
      className={cn("h-full w-full overflow-hidden whitespace-pre-wrap break-words leading-snug", data.bold && "font-bold", item.color === "neutral" ? "text-text" : SPACE_COLOR_CLASS[item.color].text)}
      style={{ fontSize: TEXT_SIZE_PX[data.size] }}
    >
      {item.body}
    </div>
  );
}

/** Şekil çizimi (öğe ve sürükleme önizlemesi ortak kullanır). `w`/`h` dünya biriminde kutudur. */
export function ShapeSvg({ w, h, data, color }: { w: number; h: number; data: ShapeData; color: SpaceColor }) {
  const stroke = COLOR_VAR[color];
  const sw = data.sw;
  const common = { stroke, strokeWidth: sw, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const fill = data.fill ? stroke : "none";
  const fillOpacity = data.fill ? 0.14 : 0;
  const pts = data.points.map(([x, y]) => [x * w, y * h] as const);
  let body: React.ReactNode = null;
  if (data.shape === "rect") body = <rect x={sw / 2} y={sw / 2} width={Math.max(1, w - sw)} height={Math.max(1, h - sw)} rx={Math.min(10, w / 6)} fill={fill} fillOpacity={fillOpacity} {...common} />;
  else if (data.shape === "oval") body = <ellipse cx={w / 2} cy={h / 2} rx={Math.max(1, (w - sw) / 2)} ry={Math.max(1, (h - sw) / 2)} fill={fill} fillOpacity={fillOpacity} {...common} />;
  else if (pts.length >= 2) {
    const d = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    body = <path d={d} fill="none" {...common} />;
    if (data.shape === "arrow") {
      const [bx, by] = pts[pts.length - 1];
      const [ax, ay] = pts[Math.max(0, pts.length - 2)];
      const angle = Math.atan2(by - ay, bx - ax);
      const size = 8 + sw * 2.5;
      const head = [Math.PI * 0.85, -Math.PI * 0.85].map((turn) => `${(bx + Math.cos(angle + turn) * size).toFixed(1)} ${(by + Math.sin(angle + turn) * size).toFixed(1)}`);
      body = (
        <>
          {body}
          <path d={`M${head[0]} L${bx.toFixed(1)} ${by.toFixed(1)} L${head[1]}`} fill="none" {...common} />
        </>
      );
    }
  }
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="block overflow-visible" aria-hidden>
      {body}
    </svg>
  );
}

/** Çerçeve / metin / şekil gövdesi (`BoardItem` çağırır). */
export function DrawingBody({ item, lowDetail }: { item: SpaceItem; lowDetail: boolean }) {
  if (item.kind === "frame") return <FrameBody item={item} lowDetail={lowDetail} />;
  if (item.kind === "text") return <TextBody item={item} />;
  return <ShapeSvg w={item.w} h={item.h} data={parseShape(item.data)} color={item.color} />;
}

// ---------------------------------------------------------------------------------------------
// Pencereler
// ---------------------------------------------------------------------------------------------

function ColorRow({ value, onChange, label }: { value: SpaceColor; onChange: (color: SpaceColor) => void; label: string }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {SPACE_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={value === color}
          aria-label={color}
          onClick={() => onChange(color)}
          className={cn("h-9 w-9 rounded-full border-2 transition-transform", value === color ? "scale-110 border-text" : "border-transparent")}
          style={{ background: COLOR_VAR[color] }}
        />
      ))}
    </div>
  );
}

export interface TextValues {
  body: string;
  color: SpaceColor;
  data: TextData;
}

/** Metin öğesi penceresi (ekleme ve düzenleme). */
export function TextItemDialog({ item, onClose, onSave }: { item: SpaceItem | null; onClose: () => void; onSave: (values: TextValues) => Promise<void> }) {
  const { t } = useTranslation();
  const initial = parseText(item?.data);
  const [body, setBody] = useState(item?.body ?? "");
  const [color, setColor] = useState<SpaceColor>(item?.color ?? "neutral");
  const [size, setSize] = useState<TextSize>(initial.size);
  const [bold, setBold] = useState(initial.bold);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async () => {
    if (!body.trim()) {
      setError(t("tb.text.required"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await onSave({ body: body.trim(), color, data: { size, bold } });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("spaces.error.generic"));
      setBusy(false);
    }
  };
  return (
    <SpaceDialog
      title={t(item ? "tb.text.editTitle" : "tb.text.addTitle")}
      onClose={onClose}
      busy={busy}
      formTestId="board-text-dialog"
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-small font-semibold text-text">{t("tb.text.label")}</span>
          <textarea value={body} onChange={(event) => setBody(event.target.value)} maxLength={SPACE_ITEM_BODY_MAX} rows={4} className="w-full rounded-lg border border-border bg-background px-3 py-2 text-body" />
        </label>
        <div className="space-y-1.5">
          <span className="text-small font-semibold text-text">{t("tb.text.size")}</span>
          <div role="radiogroup" aria-label={t("tb.text.size")} className="flex gap-2">
            {TEXT_SIZES.map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={size === option}
                onClick={() => setSize(option)}
                className={cn("h-10 min-w-12 rounded-full border px-3 font-semibold", size === option ? "border-text bg-text text-background" : "border-border bg-surface text-text-secondary")}
              >
                {t(`tb.text.size.${option}` as const)}
              </button>
            ))}
            <button type="button" aria-pressed={bold} onClick={() => setBold((value) => !value)} className={cn("h-10 rounded-full border px-4 font-bold", bold ? "border-text bg-text text-background" : "border-border bg-surface text-text-secondary")}>
              B
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <span className="text-small font-semibold text-text">{t("tb.style.color")}</span>
          <ColorRow value={color} onChange={setColor} label={t("tb.style.color")} />
        </div>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

/** Çerçeve penceresi (yeniden adlandırma + renk). */
export function FrameDialog({ item, onClose, onSave }: { item: SpaceItem; onClose: () => void; onSave: (values: { title: string; color: SpaceColor }) => Promise<void> }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState(item.title);
  const [color, setColor] = useState<SpaceColor>(item.color);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SpaceDialog
      title={t("tb.frame.editTitle")}
      onClose={onClose}
      busy={busy}
      formTestId="board-frame-dialog"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await onSave({ title: title.trim(), color });
          onClose();
        } catch (e) {
          setError(e instanceof Error ? e.message : t("spaces.error.generic"));
          setBusy(false);
        }
      }}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy}>
            {t("common.save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block space-y-1.5">
          <span className="text-small font-semibold text-text">{t("tb.frame.name")}</span>
          <input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={SPACE_ITEM_TITLE_MAX} className="h-11 w-full rounded-lg border border-border bg-background px-3 text-body" />
        </label>
        <div className="space-y-1.5">
          <span className="text-small font-semibold text-text">{t("tb.style.color")}</span>
          <ColorRow value={color} onChange={setColor} label={t("tb.style.color")} />
        </div>
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}

// ---------------------------------------------------------------------------------------------
// Seçim çubuğundaki stil denetimleri
// ---------------------------------------------------------------------------------------------

/** Seçili çizim öğeleri için renk + (şekilde) kalınlık/dolgu + (metinde) boyut/kalın. */
export function StyleControls({ items, onPatch }: { items: SpaceItem[]; onPatch: (patch: (item: SpaceItem) => { color?: SpaceColor; data?: Record<string, unknown> }) => void }) {
  const { t } = useTranslation();
  const shapes = items.filter((item) => item.kind === "shape");
  const texts = items.filter((item) => item.kind === "text");
  const first = items[0];
  const fillable = shapes.some((item) => ["rect", "oval"].includes(parseShape(item.data).shape));
  const shapeData = shapes[0] ? parseShape(shapes[0].data) : null;
  const textData = texts[0] ? parseText(texts[0].data) : null;
  return (
    <div className="flex shrink-0 items-center gap-1 px-1" data-board-style="">
      <div role="radiogroup" aria-label={t("tb.style.color")} className="flex items-center gap-1">
        {SPACE_COLORS.map((color) => (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={first.color === color}
            aria-label={color}
            onClick={() => onPatch(() => ({ color }))}
            className={cn("h-5 w-5 rounded-full border-2", first.color === color ? "border-text" : "border-transparent")}
            style={{ background: COLOR_VAR[color] }}
          />
        ))}
      </div>
      {shapeData && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border-soft" />
          {STROKE_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              aria-label={t("tb.style.stroke", { width })}
              aria-pressed={shapeData.sw === width}
              onClick={() => onPatch((item) => (item.kind === "shape" ? { data: { ...parseShape(item.data), sw: width } } : {}))}
              className={cn("flex h-8 w-8 items-center justify-center rounded-full", shapeData.sw === width ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}
            >
              <span className="block w-4 rounded-full bg-current" style={{ height: width }} />
            </button>
          ))}
          {fillable && (
            <button
              type="button"
              aria-label={t("tb.style.fill")}
              aria-pressed={shapeData.fill}
              onClick={() => onPatch((item) => (item.kind === "shape" ? { data: { ...parseShape(item.data), fill: !shapeData.fill } } : {}))}
              className={cn("flex h-8 items-center rounded-full px-2.5 text-caption font-semibold", shapeData.fill ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}
            >
              {t("tb.style.fill")}
            </button>
          )}
        </>
      )}
      {textData && (
        <>
          <span aria-hidden className="mx-1 h-5 w-px bg-border-soft" />
          {TEXT_SIZES.map((size) => (
            <button
              key={size}
              type="button"
              aria-pressed={textData.size === size}
              onClick={() => onPatch((item) => (item.kind === "text" ? { data: { ...parseText(item.data), size } } : {}))}
              className={cn("h-8 min-w-8 rounded-full px-2 text-caption font-bold", textData.size === size ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}
            >
              {t(`tb.text.size.${size}` as const)}
            </button>
          ))}
          <button
            type="button"
            aria-label={t("tb.text.bold")}
            aria-pressed={textData.bold}
            onClick={() => onPatch((item) => (item.kind === "text" ? { data: { ...parseText(item.data), bold: !textData.bold } } : {}))}
            className={cn("h-8 w-8 rounded-full text-caption font-extrabold", textData.bold ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-surface-soft")}
          >
            B
          </button>
        </>
      )}
    </div>
  );
}
