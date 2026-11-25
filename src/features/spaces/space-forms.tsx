"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ImagePlus } from "@/components/icons/image-plus";
import { Loader2 } from "@/components/icons/loader-2";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { fieldControlClassName, fieldLabelClassName, Input } from "@/components/ui/field";
import { OptionGroup } from "@/components/ui/option-group";
import { imageSourceProblem } from "@/lib/image-processing";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import {
  SPACE_DESCRIPTION_MAX,
  SPACE_KIND_LABEL,
  SPACE_KINDS,
  SPACE_TEMPLATE_GROUPS,
  SPACE_TITLE_MAX,
  type SpaceKind,
} from "@/lib/spaces";
import { SPACE_KIND_ICON as KIND_ICON } from "./space-visuals";
import { InlineAlert } from "@/components/ui/inline-alert";

/*
 * Space oluşturma ve ayar formlarının ortak alanları (docs/history/213-*): ad, açıklama, tür, görünürlük (neyin yayımlanacağı
 * açıkça yazılır), başlangıç şablonu ve kapak seçici. Yalnız sunum + yerel doğrulama; yazma çağıranda.
 */


export function TitleField({
  value,
  onChange,
  autoFocus,
  label,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  autoFocus?: boolean;
  /** Varsayılan "Space adı"; başka bağlamlar (ekip: proje/dosya/pano) kendi etiketini verir. */
  label?: string;
  placeholder?: string;
}) {
  const { t } = useTranslation();
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className={fieldLabelClassName}>
        {label ?? t("spaces.form.title")}
      </label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        maxLength={SPACE_TITLE_MAX}
        required
        // Dokunmatik cihazda pencere açılır açılmaz klavyeyi açma: klavye pencereyi ekranın dışına iter (docs/history/218-*).
        autoFocus={autoFocus && !(typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches)}
        placeholder={placeholder ?? t("spaces.form.titlePlaceholder")}
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

export function KindField({ value, onChange, kinds = SPACE_KINDS }: { value: SpaceKind; onChange: (value: SpaceKind) => void; kinds?: readonly SpaceKind[] }) {
  const { t } = useTranslation();
  return (
    <div>
      <p id="space-kind-label" className={fieldLabelClassName}>
        {t("spaces.form.kind")}
      </p>
      <ChoiceGroup<SpaceKind>
        labelledBy="space-kind-label"
        variant="tile"
        value={value}
        onChange={onChange}
        options={kinds.map((kind) => ({ key: kind, label: t(SPACE_KIND_LABEL[kind]), icon: KIND_ICON[kind] }))}
      />
    </div>
  );
}

export function TemplateField({ kind, value, onChange }: { kind: SpaceKind; value: "empty" | "template"; onChange: (value: "empty" | "template") => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <p id="space-template-label" className={fieldLabelClassName}>
        {t("spaces.form.template")}
      </p>
      <OptionGroup<"empty" | "template">
        labelledBy="space-template-label"
        value={value}
        onChange={onChange}
        options={[
          { key: "empty", label: t("spaces.form.templateEmpty"), description: t("spaces.form.templateEmptyHelp") },
          { key: "template", label: t("spaces.form.templateBoard"), description: t("spaces.form.templateBoardHelp", { groups: SPACE_TEMPLATE_GROUPS[kind].map((key) => t(key)).join(" · ") }) },
        ]}
      />
    </div>
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
        <span className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md card-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
          {preview ? <img src={preview} alt="" className="h-full w-full object-cover" /> : <ImagePlus size={20} className="absolute inset-0 m-auto text-text-muted" aria-hidden />}
        </span>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
            {file ? t("spaces.form.coverChange") : t("spaces.form.coverPick")}
          </Button>
          {file && (
            <Button type="button" variant="ghost" size="sm" onClick={() => onChange(null)}>
              <X size={16} aria-hidden />
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
    <InlineAlert>
      {message}
    </InlineAlert>
  );
}

export function SubmitButton({ busy, children, disabled }: { busy: boolean; children: React.ReactNode; disabled?: boolean }) {
  return (
    <Button type="submit" disabled={busy || disabled}>
      {busy && <Loader2 size={16} className="animate-spin" aria-hidden />}
      {children}
    </Button>
  );
}
