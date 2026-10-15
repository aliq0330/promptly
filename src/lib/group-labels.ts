import type { TFunction } from "@/lib/i18n/language-provider";

/** "1 üye" / "12 üye" — İngilizcede tekil/çoğul ayrımı için iki anahtar. */
export function memberCountText(t: TFunction, count: number): string {
  return count === 1 ? t("groups.memberCountOne") : t("groups.memberCount", { count });
}
