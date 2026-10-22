"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { BadgeCheck, ImagePlus, LayoutDashboard, Loader2, Shapes, Sofa, Swords, UserRound, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChoiceCard, fieldControlClassName, fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { imageSourceProblem } from "@/lib/image-processing";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import {
  SPACE_DESCRIPTION_MAX,
  SPACE_KIND_LABEL,
  SPACE_KINDS,
  SPACE_TEMPLATE_GROUPS,
  SPACE_TITLE_MAX,
  SPACE_VISIBILITIES,
  SPACE_VISIBILITY_LABEL,
  type SpaceKind,
  type SpaceVisibility,
} from "@/lib/spaces";
import type { TranslationKey } from "@/lib/i18n/translations";
import { VISIBILITY_ICON } from "./space-visuals";

/*
 * Space oluşturma ve ayar formlarının ortak alanları (docs/history/213-*): ad, açıklama, tür, görünürlük (neyin yayımlanacağı
 * açıkça yazılır), başlangıç şablonu ve kapak seçici. Yalnız sunum + yerel doğrulama; yazma çağıranda.
 */

export const KIND_ICON: Record<SpaceKind, LucideIcon> = {
  moodboard: LayoutDashboard,
  character: UserRound,
  brand: BadgeCheck,
  game_world: Swords,
  interior: Sofa,
  free: Shapes,
};

const VISIBILITY_HELP: Record<SpaceVisibility, TranslationKey> = {
  private: "spaces.visibility.privateHelp",
  link: "spaces.visibility.linkHelp",
  public: "spaces.visibility.publicHelp",
};

export function TitleField({ value, onChange, autoFocus }: { value: string; onChange: (value: string) => void; autoFocus?: boolean }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={fieldLabelClassName}>
        {t("spaces.form.title")}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={SPACE_TITLE_MAX}
        required
        autoFocus={autoFocus}
        placeholder={t("spaces.form.titlePlaceholder")}
        className={fieldInputClassName}
      />
    </div>
  );
}

export function DescriptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={fieldLabelClassName}>
        {t("spaces.form.description")} <span className="font-normal text-text-muted">{t("spaces.form.optional")}</span>
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={SPACE_DESCRIPTION_MAX}
        rows={2}
        placeholder={t("spaces.form.descriptionPlaceholder")}
        className={cn(fieldControlClassName, "resize-none py-2.5")}
      />
    </div>
  );
}

export function KindField({ value, onChange }: { value: SpaceKind; onChange: (value: SpaceKind) => void }) {
  const { t } = useTranslation();
  return (
    <fieldset>
      <legend className={fieldLabelClassName}>{t("spaces.form.kind")}</legend>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {SPACE_KINDS.map((kind) => {
          const Icon = KIND_ICON[kind];
          return (
            <label
              key={kind}
              className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-border-soft bg-background px-3 py-2 text-small text-text transition-colors hover:border-border-strong has-checked:border-primary/50 has-checked:bg-primary-soft/40"
            >
              <input type="radio" name="space-kind" value={kind} checked={value === kind} onChange={() => onChange(kind)} className="sr-only" />
              <Icon size={16} className="shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 truncate">{t(SPACE_KIND_LABEL[kind])}</span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function VisibilityField({ value, onChange, name = "space-visibility" }: { value: SpaceVisibility; onChange: (value: SpaceVisibility) => void; name?: string }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className={fieldLabelClassName}>{t("spaces.form.visibility")}</legend>
      {SPACE_VISIBILITIES.map((visibility) => {
        const Icon = VISIBILITY_ICON[visibility];
        return (
          <ChoiceCard key={visibility}>
            <input type="radio" name={name} value={visibility} checked={value === visibility} onChange={() => onChange(visibility)} className="mt-1 accent-primary" />
            <Icon size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden />
            <span className="min-w-0">
              <span className="block font-medium">{t(SPACE_VISIBILITY_LABEL[visibility])}</span>
              <span className="block text-caption text-text-muted">{t(VISIBILITY_HELP[visibility])}</span>
            </span>
          </ChoiceCard>
        );
      })}
    </fieldset>
  );
}

export function TemplateField({ kind, value, onChange }: { kind: SpaceKind; value: "empty" | "template"; onChange: (value: "empty" | "template") => void }) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className={fieldLabelClassName}>{t("spaces.form.template")}</legend>
      <ChoiceCard>
        <input type="radio" name="space-template" checked={value === "empty"} onChange={() => onChange("empty")} className="mt-1 accent-primary" />
        <span>
          <span className="block font-medium">{t("spaces.form.templateEmpty")}</span>
          <span className="block text-caption text-text-muted">{t("spaces.form.templateEmptyHelp")}</span>
        </span>
      </ChoiceCard>
      <ChoiceCard>
        <input type="radio" name="space-template" checked={value === "template"} onChange={() => onChange("template")} className="mt-1 accent-primary" />
        <span className="min-w-0">
          <span className="block font-medium">{t("spaces.form.templateBoard")}</span>
          <span className="block text-caption text-text-muted">
            {t("spaces.form.templateBoardHelp", { groups: SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)).join(" · ") })}
          </span>
        </span>
      </ChoiceCard>
    </fieldset>
  );
}

/** Kapak dosyası seçici: önizleme + kaldır. Ağır fotoğraf reddedilmez (yüklemede küçülür); yalnız kaynak tavanı sınırdır. */
export function CoverPicker({ file, onChange }: { file: File | null; onChange: (file: File | null) => void }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  return (
    <div>
      <span className={fieldLabelClassName}>
        {t("spaces.form.cover")} <span className="font-normal text-text-muted">{t("spaces.form.optional")}</span>
      </span>
      <div className="flex items-center gap-3">
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-border-soft bg-surface-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} className="absolute inset-0 m-auto text-text-muted" aria-hidden />}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {file ? t("spaces.form.coverChange") : t("spaces.form.coverPick")}
          </Button>
          {file && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X size={14} aria-hidden />
              {t("spaces.form.coverRemove")}
            </Button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            event.target.value = "";
            if (!next) return;
            const issue = imageSourceProblem(next);
            setProblem(issue);
            if (!issue) onChange(next);
          }}
        />
      </div>
      {problem && <p className="mt-1.5 text-caption text-danger">{problem}</p>}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md bg-danger/10 px-3 py-2 text-small text-danger">
      {message}
    </p>
  );
}

export function SubmitButton({ busy, children, disabled }: { busy: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={busy || disabled}>
      {busy && <Loader2 size={14} className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
