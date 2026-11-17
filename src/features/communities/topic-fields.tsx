"use client";

import { fieldInputClassName, fieldLabelClassName } from "@/components/ui/field";
import { COMMUNITY_PURPOSES, CATEGORY_LABEL_KEYS } from "@/lib/communities";
import { DOMAIN_IDS, DOMAIN_LABEL_KEYS, isDomainId, type DomainId } from "@/lib/domains";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { CommunityCategory } from "@/types";

/**
 * Topluluğun KONUSU (ortak ALAN sözlüğü) ve AMACI (genel / öğrenme / vitrin) — oluşturma ve ayar ekranında aynı iki seçici (docs/history/425-*).
 * Eski ortam değerleri (görsel/metin/ses/video/workflow) seçenek olarak sunulmaz; ama topluluğun mevcut değeri buysa listede kalır ki ayar
 * ekranı onu sessizce değiştirmesin.
 */
export function CommunityTopicFields({
  idPrefix,
  domain,
  onDomainChange,
  category,
  onCategoryChange,
  disabled,
}: {
  idPrefix: string;
  domain: DomainId | null;
  onDomainChange: (value: DomainId | null) => void;
  category: CommunityCategory;
  onCategoryChange: (value: CommunityCategory) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const purposes = COMMUNITY_PURPOSES.includes(category) ? COMMUNITY_PURPOSES : [...COMMUNITY_PURPOSES, category];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label htmlFor={`${idPrefix}-domain`} className={fieldLabelClassName}>
          {t("communities.create.domainLabel")}
        </label>
        <select
          id={`${idPrefix}-domain`}
          value={domain ?? ""}
          onChange={(event) => onDomainChange(isDomainId(event.target.value) ? event.target.value : null)}
          disabled={disabled}
          className={fieldInputClassName}
        >
          <option value="">{t("communities.create.domainNone")}</option>
          {DOMAIN_IDS.map((id) => (
            <option key={id} value={id}>
              {t(DOMAIN_LABEL_KEYS[id])}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption text-text-muted">{t("communities.create.domainHelp")}</p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-purpose`} className={fieldLabelClassName}>
          {t("communities.create.purposeLabel")}
        </label>
        <select
          id={`${idPrefix}-purpose`}
          value={category}
          onChange={(event) => onCategoryChange(event.target.value as CommunityCategory)}
          disabled={disabled}
          className={fieldInputClassName}
        >
          {purposes.map((value) => (
            <option key={value} value={value}>
              {t(CATEGORY_LABEL_KEYS[value])}
            </option>
          ))}
        </select>
        <p className="mt-1 text-caption text-text-muted">{t("communities.create.purposeHelp")}</p>
      </div>
    </div>
  );
}
