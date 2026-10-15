"use client";

import { Badge } from "@/components/ui/badge";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { GroupRole } from "@/types";

/** Owner / admin / moderator için rol etiketi (normal üyede etiket yok). */
export function RoleBadge({ role }: { role: GroupRole }) {
  const { t } = useTranslation();
  if (role === "member") return null;
  return <Badge variant={role === "owner" ? "default" : "neutral"}>{t(`groups.role.${role}`)}</Badge>;
}
