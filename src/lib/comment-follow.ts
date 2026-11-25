import type { CommentTarget } from "@/features/prompts/use-comment-thread";

/** Takip edilebilen içerik türleri (SQL `comment_subscriptions` ile aynı liste; `set_comment_subscription` başkasını reddeder). */
export type CommentFollowKind = "prompt" | "request" | "workflow" | "preset" | "skill";

export interface CommentFollowTarget {
  kind: CommentFollowKind;
  id: string;
}

/**
 * Bir yorum hedefinin takip edilebilir içeriği: sonuç, topluluk gönderisi ve alıntı yorumları takip edilemez
 * (onların bildirimleri kendi akışlarına bağlı); `null` dönerse arayüzde "Takip et" çizilmez.
 */
export function commentFollowTarget(target: CommentTarget): CommentFollowTarget | null {
  if ("promptId" in target) return { kind: "prompt", id: target.promptId };
  if ("requestId" in target) return { kind: "request", id: target.requestId };
  if ("workflowId" in target) return { kind: "workflow", id: target.workflowId };
  if ("presetId" in target) return { kind: "preset", id: target.presetId };
  if ("skillId" in target) return { kind: "skill", id: target.skillId };
  return null;
}

/** Düzenleme geçmişi satırının etiketi: en yeni (şimdiki) sürüm, en eski kayıtlı sürüm ve aradakiler. */
export type CommentVersionLabel = "current" | "first" | "previous";

export function commentVersionLabel(index: number, total: number): CommentVersionLabel {
  if (index === 0) return "current";
  return index === total - 1 ? "first" : "previous";
}

/** Yorumun doğrudan bağlantısı: açık sayfa adresine `hl=comment:<id>` eklenir (bildirimlerdeki biçimle aynı); varsa eski `hl` ve `#…` atılır. */
export function commentLink(pageHref: string, commentId: string): string {
  const url = new URL(pageHref);
  url.searchParams.set("hl", `comment:${commentId}`);
  url.hash = "";
  return url.toString();
}

/** Takip edilen içeriğin (ya da başlığının) sayfa adresi; başlık takibinde `hl=comment:<id>` ile yoruma gider. */
export function commentFollowHref(kind: CommentFollowKind, targetId: string, commentId: string | null): string {
  const base = {
    prompt: "/prompts/local?id=",
    request: "/requests/local?id=",
    workflow: "/workflows/local?id=",
    preset: "/presets/local?id=",
    skill: "/skills/local?id=",
  }[kind];
  return `${base}${targetId}${commentId ? `&hl=comment:${commentId}` : ""}`;
}
