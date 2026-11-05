import type { PromptComment } from "@/types";

/**
 * "Çalıştı mı?" davetinin (docs/history/341-*) detay sayfasındaki öteki bölümlerle konuşma yolu — `PROMPT_COPIED_EVENT` kalıbı: bölümler birbirini
 * içe aktarmaz, pencere olayıyla haberleşir. Biri yorumu yazar, yorum listesi o yorumu kendiliğinden listeye ekler; biri "Sonucunu paylaş" der,
 * sonuç bölümü kendi ekleme penceresini açar.
 */
export const PROMPT_COMMENT_POSTED_EVENT = "promptly:prompt-comment-posted";
export const PROMPT_ADD_RESULT_EVENT = "promptly:prompt-add-result";

export interface PromptCommentPostedDetail {
  promptId: string;
  comment: PromptComment;
}

export function announceCommentPosted(detail: PromptCommentPostedDetail) {
  window.dispatchEvent(new CustomEvent<PromptCommentPostedDetail>(PROMPT_COMMENT_POSTED_EVENT, { detail }));
}

export function requestAddResult(promptId: string) {
  window.dispatchEvent(new CustomEvent<{ promptId: string }>(PROMPT_ADD_RESULT_EVENT, { detail: { promptId } }));
}
