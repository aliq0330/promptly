import type { ShareModalTarget } from "@/features/prompts/share-modal";
import type { TranslationKey } from "@/lib/i18n/translations";
import type { QuoteContentType } from "@/lib/supabase/quotes";

/**
 * "Alıntıla" hedefi (akışta + topluluklarda; eskiden "Topluluklarda duyur"): yalnız topluluğa ait OLMAYAN içerik; herkese açık + yayında değilse satır
 * nedeniyle kapalı durur (topluluk paylaşımı hiçbir içeriği otomatik açmaz). Sonuç ve topluluk gönderisi alıntılanamaz (`null`).
 * Alıntıla düğmesi detay sayfasının eylem çubuğundadır (docs/history/480-*; eskiden Paylaş penceresindeydi).
 */
export function announceTarget(target: ShareModalTarget): { type: QuoteContentType; id: string; blockedKey: TranslationKey | null } | null {
  if (target.contentType === "prompt") {
    const x = target.prompt;
    if (x.communityId) return null;
    return { type: "prompt", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "request") {
    const x = target.request;
    if (x.communityId) return null;
    return { type: "request", id: x.id, blockedKey: !x.isDraft && (x.visibility ?? "public") === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "workflow") {
    const x = target.workflow;
    if (x.communityId) return null;
    return { type: "workflow", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "preset") {
    const x = target.preset;
    if (x.communityId) return null;
    return { type: "preset", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  if (target.contentType === "skill") {
    const x = target.skill;
    return { type: "skill", id: x.id, blockedKey: x.status === "published" && x.visibility === "public" ? null : "share.announce.notPublic" };
  }
  return null;
}
