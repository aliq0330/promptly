"use client";

import { Chip, ChipRow } from "@/components/ui/chip";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { AdminContentType } from "@/lib/supabase/admin";
import { ADMIN_CONTENT_TYPES, CONTENT_TYPE_KEY } from "./format";

/** Tümü / Görsel / Metin / Ses / Video — the same content-type filter the site uses everywhere. */
export function TypeFilter({ value, onChange }: { value: AdminContentType | null; onChange: (next: AdminContentType | null) => void }) {
  const { t } = useTranslation();
  return (
    <ChipRow scroll>
      <Chip selected={value === null} onClick={() => onChange(null)}>
        {t("common.all")}
      </Chip>
      {ADMIN_CONTENT_TYPES.map((type) => (
        <Chip key={type} selected={value === type} onClick={() => onChange(value === type ? null : type)}>
          {t(CONTENT_TYPE_KEY[type])}
        </Chip>
      ))}
    </ChipRow>
  );
}
