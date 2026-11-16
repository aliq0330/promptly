"use client";

import { useRef, useState } from "react";
import { ImagePlus } from "@/components/icons/image-plus";
import { Trash2 } from "@/components/icons/trash-2";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { useTranslation } from "@/lib/i18n/language-provider";
import { imageSourceProblem } from "@/lib/image-processing";
import { removeSkillCover, uploadSkillCover } from "@/lib/supabase/skill-cover";
import { SkillCoverImage } from "./skill-cover";

/** Düzenleyicide kapak görseli (docs/history/399-*): isteğe bağlı; yüklenince Skill'in satırı yoksa taslak açılır (`ensureDraft`). Görsel ortak işlemciden geçer (küçültülür, reddedilmez). */
export function SkillCoverField({
  userId,
  skillId,
  coverPath,
  onChange,
  ensureDraft,
  disabled,
}: {
  userId: string;
  skillId: string | null;
  coverPath: string | null;
  onChange: (path: string | null) => void;
  ensureDraft: () => Promise<string | null>;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File) {
    setError(null);
    const problem = imageSourceProblem(file);
    if (problem) return setError(problem);
    setBusy(true);
    try {
      const id = skillId ?? (await ensureDraft());
      if (!id) return setError(t("skill.pkg.needTitleFirst"));
      onChange(await uploadSkillCover(id, userId, file, coverPath));
    } catch (err) {
      console.error("uploadSkillCover", err);
      setError(t("skill.cover.failed"));
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!skillId || !coverPath) return;
    setError(null);
    setBusy(true);
    try {
      await removeSkillCover(skillId, userId, coverPath);
      onChange(null);
    } catch (err) {
      console.error("removeSkillCover", err);
      setError(t("skill.cover.failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-2" data-skill-cover-field="">
      {coverPath && (
        <div className="relative aspect-[4/3] w-full max-w-xs overflow-hidden rounded-lg card-soft">
          <SkillCoverImage path={coverPath} className="absolute inset-0 h-full w-full object-cover" alt={t("skill.cover.alt")} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled || busy} onClick={() => input.current?.click()} data-skill-cover-pick="">
          <ImagePlus size={16} aria-hidden /> {coverPath ? t("skill.cover.change") : t("skill.cover.add")}
        </Button>
        {coverPath && (
          <Button type="button" variant="ghost" size="sm" disabled={disabled || busy} onClick={() => void remove()} data-skill-cover-remove="">
            <Trash2 size={16} aria-hidden /> {t("skill.cover.remove")}
          </Button>
        )}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-label={t("skill.cover.add")}
        data-skill-cover-input=""
        onChange={(event) => {
          const picked = event.target.files?.[0];
          event.target.value = "";
          if (picked) void pick(picked);
        }}
      />
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
    </div>
  );
}
