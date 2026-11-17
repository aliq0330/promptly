import { DOMAIN_IDS, DOMAIN_LABEL_KEYS, type DomainId } from "@/lib/domains";

/**
 * Profil ilgi alanları = ortak ALAN sözlüğü (docs/history/425-*): `profiles.interests` alan kimliği (`art`, `photography`…) taşır; ayrı bir
 * ilgi alanı listesi YOKTUR. Önceki sürümün Türkçe metin değerleri `normalizeInterests` / SQL `interest_domain` ile alana çözülür.
 * Bu modül yalnız eski ad/sabitleri korur; yeni kod doğrudan `@/lib/domains` kullanır.
 */
export const INTEREST_OPTIONS = DOMAIN_IDS;
export type InterestOption = DomainId;
export const INTEREST_OPTION_LABELS = DOMAIN_LABEL_KEYS;
