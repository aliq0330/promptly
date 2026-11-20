import { absoluteUrl } from "@/lib/utils";
import { composeCommunityPostShareBody } from "./community-post-share-format";
import { composePresetShareBody } from "./preset-share-format";
import { composeSkillShareBody } from "./skill-share-format";
import { composeSpaceShareBody } from "./space-share-format";
import { composeWorkflowShareBody } from "./workflow-share-format";

/**
 * Sohbete gönderilecek paylaşımın TEK kuralı (docs/history/447-*): hem sohbet ekranı (`?sharePromptId=` … bekleyen paylaşım) hem de Paylaş
 * penceresinin kişi ızgarası aynı gövdeyi kurar. Prompt/İstek mesajın gömme sütunlarıyla, diğerleri (`messages`'ta gömme sütunu yok)
 * tanınabilir düz metin bloğuyla gider; yeni mesaj şeması YOK.
 */
export type ShareMessageType = "prompt" | "request" | "workflow" | "preset" | "space" | "skill" | "community_post";

export interface ShareMessageRef {
  type: ShareMessageType;
  id: string;
  title: string;
}

export interface ShareMessagePayload {
  body?: string;
  sharedPromptId?: string;
  sharedRequestId?: string;
}

/** `?sharePromptId=…` biçimindeki paylaşım sorgusundan paylaşılacak içeriği çözer (`ShareModal`'ın `messageParam`'ı); tanınmazsa `null`. */
export function shareRefFromQuery(query: string | null, title: string): ShareMessageRef | null {
  if (!query) return null;
  const params = new URLSearchParams(query);
  const pairs: [string, ShareMessageType][] = [
    ["sharePromptId", "prompt"],
    ["shareRequestId", "request"],
    ["shareWorkflowId", "workflow"],
    ["sharePresetId", "preset"],
    ["shareSpaceId", "space"],
    ["shareSkillId", "skill"],
    ["sharePostId", "community_post"],
  ];
  for (const [key, type] of pairs) {
    const id = params.get(key);
    if (id) return { type, id, title };
  }
  return null;
}

/** Bir paylaşımın mesaj yükü; `note` boş olabilir. Paylaşım yoksa yalnız notun kendisi gider. */
export function composeShareMessage(share: ShareMessageRef | null, note: string): ShareMessagePayload {
  const trimmed = note.trim();
  if (!share) return { body: trimmed || undefined };
  switch (share.type) {
    case "prompt":
      return { body: trimmed || undefined, sharedPromptId: share.id };
    case "request":
      return { body: trimmed || undefined, sharedRequestId: share.id };
    case "workflow":
      return { body: composeWorkflowShareBody(trimmed, share.title, share.id) };
    case "preset":
      return { body: composePresetShareBody(trimmed, share.title, share.id) };
    case "space":
      return { body: composeSpaceShareBody(trimmed, share.title, share.id) };
    case "skill":
      return { body: composeSkillShareBody(trimmed, share.title, share.id, (path) => absoluteUrl(path)) };
    case "community_post":
      return { body: composeCommunityPostShareBody(trimmed, share.title, share.id) };
  }
}
