"use client";

import { useState } from "react";
import { Image as ImageIcon, X } from "lucide-react";
import { TagPicker } from "@/features/prompts/tag-picker";
import type { UseTagPickerResult } from "@/features/prompts/use-tag-picker";
import { GENERATOR_CATEGORY_TOPIC_LABELS, GENERATOR_CATEGORY_TOPICS } from "./generator-category-meta";
import { resizeImageToDataUrlFit } from "@/lib/utils";
import type { GeneratorCategoryTopic } from "@/types";
import type { GeneratorMetaInput } from "@/lib/supabase/generators";

/**
 * Step 1 of the builder — the generator's own metadata (§4/§8/§27): title,
 * short description, topic category (the fixed `GeneratorCategoryTopic`
 * enum — the generator's own discovery topic, entirely unrelated to the
 * field-organization category system that used to exist in step 2 and was
 * removed, see CLAUDE.md), an optional free-typed subcategory, tags
 * (the shared, already-generic `TagPicker` — reused as-is, no
 * generator-specific fork), an optional cover image, visibility, and the
 * generator-level toggles (prompt-editing/saving/negative-prompt).
 * There is no dedicated `generator-covers` Storage bucket (this feature's
 * migration deliberately didn't add one — see CLAUDE.md), so a cover is
 * stored the same way this app already stores every localStorage-era image
 * (avatar edit, request reference image): a real, compact data URL, written
 * straight into `generators.cover_url` — a real Postgres `text` column has
 * no size ceiling the way `localStorage` does, so this is not a downgrade.
 */
export function GeneratorDetailsForm({
  meta,
  onChange,
  tagPicker,
}: {
  meta: GeneratorMetaInput;
  onChange: (patch: Partial<GeneratorMetaInput>) => void;
  tagPicker: UseTagPickerResult;
}) {
  const [coverError, setCoverError] = useState<string | null>(null);

  async function handleCoverChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverError(null);
    try {
      const resized = await resizeImageToDataUrlFit(file, 900);
      onChange({ coverUrl: resized.url });
    } catch {
      setCoverError("Görsel yüklenemedi, lütfen başka bir dosya dene.");
    } finally {
      event.target.value = "";
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <label htmlFor="gen-title" className="mb-1.5 block text-sm font-medium text-text">
          Generator başlığı
        </label>
        <input
          id="gen-title"
          type="text"
          value={meta.title}
          onChange={(event) => onChange({ title: event.target.value })}
          placeholder="Örn. Sinematik Karakter Generatoru"
          className="h-11 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
        />
      </div>

      <div>
        <label htmlFor="gen-description" className="mb-1.5 block text-sm font-medium text-text">
          Kısa açıklama
        </label>
        <textarea
          id="gen-description"
          rows={3}
          value={meta.description}
          onChange={(event) => onChange({ description: event.target.value })}
          placeholder="Bu generator ne üretiyor, kimin için?"
          className="w-full resize-none rounded-md border border-border bg-background px-3 py-2 text-sm text-text placeholder:text-text-muted"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="gen-category" className="mb-1.5 block text-sm font-medium text-text">
            Kategori
          </label>
          <select
            id="gen-category"
            value={meta.category}
            onChange={(event) => onChange({ category: event.target.value as GeneratorCategoryTopic })}
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text"
          >
            {GENERATOR_CATEGORY_TOPICS.map((topic) => (
              <option key={topic} value={topic}>
                {GENERATOR_CATEGORY_TOPIC_LABELS[topic]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="gen-subcategory" className="mb-1.5 block text-sm font-medium text-text">
            Alt kategori <span className="text-text-muted">(opsiyonel)</span>
          </label>
          <input
            id="gen-subcategory"
            type="text"
            value={meta.subcategory ?? ""}
            onChange={(event) => onChange({ subcategory: event.target.value || null })}
            placeholder="Örn. Karakter Tasarımı"
            className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-text placeholder:text-text-muted"
          />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">Etiketler</label>
        <TagPicker picker={tagPicker} />
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-text">
          Kapak görseli <span className="text-text-muted">(opsiyonel)</span>
        </label>
        {meta.coverUrl ? (
          <div className="relative h-32 w-full max-w-xs overflow-hidden rounded-md border border-border">
            {/* eslint-disable-next-line @next/next/no-img-element -- a real, local data URL, not a remote URL next/image would need to be configured for */}
            <img src={meta.coverUrl} alt="" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => onChange({ coverUrl: null })}
              aria-label="Kapak görselini kaldır"
              className="absolute right-1.5 top-1.5 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <label className="flex h-32 w-full max-w-xs cursor-pointer flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-border text-text-muted hover:border-primary hover:text-primary">
            <ImageIcon size={22} />
            <span className="text-xs">Görsel seç</span>
            <input type="file" accept="image/*" onChange={handleCoverChange} className="hidden" />
          </label>
        )}
        {coverError && <p className="mt-1 text-xs text-red-500">{coverError}</p>}
      </div>

      <div>
        <label htmlFor="gen-visibility" className="mb-1.5 block text-sm font-medium text-text">
          Görünürlük
        </label>
        <select
          id="gen-visibility"
          value={meta.visibility}
          onChange={(event) => onChange({ visibility: event.target.value as GeneratorMetaInput["visibility"] })}
          className="h-10 w-full max-w-xs rounded-md border border-border bg-background px-3 text-sm text-text"
        >
          <option value="public">Herkese açık — Keşfet ve aramada görünür</option>
          <option value="unlisted">Yalnızca bağlantıyla — listelenmez, linki olan kullanabilir</option>
          <option value="private">Gizli — yalnızca sen görebilirsin</option>
        </select>
      </div>

      <div className="space-y-2 rounded-md border border-border p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Ayarlar</p>
        <ToggleRow
          label="Oluşturulan promptu düzenlemeye izin ver"
          description="Kullanıcı, generator çıktısını 'Prompt olarak aç'tıktan sonra elle değiştirebilir."
          checked={meta.allowPromptEditing}
          onChange={(checked) => onChange({ allowPromptEditing: checked })}
        />
        <ToggleRow
          label="Oluşturulan promptu kaydetmeye izin ver"
          description="Kullanıcı çıktıyı doğrudan gerçek bir Prompt olarak yayınlayıp kaydedebilir."
          checked={meta.allowSavingGeneratedPrompts}
          onChange={(checked) => onChange({ allowSavingGeneratedPrompts: checked })}
        />
        <ToggleRow
          label="Negatif prompt desteği"
          description="Görsel üretim generatorları için ayrı bir 'Negative Prompt' bölümü ekler."
          checked={meta.enableNegativePrompt}
          onChange={(checked) => onChange({ enableNegativePrompt: checked })}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 py-1">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="mt-0.5" />
      <span>
        <span className="block text-sm text-text">{label}</span>
        <span className="block text-xs text-text-muted">{description}</span>
      </span>
    </label>
  );
}
