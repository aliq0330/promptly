import { isGiphyId } from "./giphy.ts";
import type { CommentAttachment, CommentAttachmentType, CommentMedia } from "@/types";

/**
 * Yorum ekinin saf modeli (docs/history/307-*): `prompt_comments` satırındaki sütunlar ↔ uygulama tipleri. Ağ/Supabase içermez, birim testlidir;
 * `lib/supabase/comments.ts` bunu kullanır. Biçimi bozuk satır sessizce eksiz sayılır — asla bir adrese/yola dönüşmez.
 */

export interface CommentExtrasColumns {
  media_kind?: string | null;
  media_ref?: string | null;
  media_width?: number | null;
  media_height?: number | null;
  attach_type?: string | null;
  attach_id?: string | null;
}

export const COMMENT_ATTACHMENT_TYPES: readonly CommentAttachmentType[] = ["prompt", "request", "workflow", "preset", "space"];

/** Fotoğraf yolu biçimi: `{yazar}/{uuid}.{uzantı}` (veritabanı CHECK'iyle AYNI; yazar kimliği ayrıca satırın `author_id`'sine eşit olmalıdır). */
const PHOTO_PATH = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/;

export function mapCommentMedia(row: Pick<CommentExtrasColumns, "media_kind" | "media_ref" | "media_width" | "media_height">): CommentMedia | null {
  const ref = row.media_ref;
  if (!ref) return null;
  const width = typeof row.media_width === "number" ? row.media_width : null;
  const height = typeof row.media_height === "number" ? row.media_height : null;
  if (row.media_kind === "gif" && isGiphyId(ref)) return { kind: "gif", gifId: ref, width, height };
  if (row.media_kind === "photo" && PHOTO_PATH.test(ref)) return { kind: "photo", path: ref, width, height };
  return null;
}

export function mapCommentAttachment(row: Pick<CommentExtrasColumns, "attach_type" | "attach_id">): CommentAttachment | null {
  const type = COMMENT_ATTACHMENT_TYPES.find((candidate) => candidate === row.attach_type);
  return type && row.attach_id ? { type, id: row.attach_id } : null;
}

export interface CommentExtrasInput {
  media?: CommentMedia | null;
  attachment?: CommentAttachment | null;
}

/** `prompt_comments` INSERT'üne eklenecek sütunlar (ek yoksa boş nesne → eski davranış birebir). */
export function extrasColumns(extras: CommentExtrasInput | undefined): Record<string, unknown> {
  const columns: Record<string, unknown> = {};
  const media = extras?.media;
  if (media) {
    columns.media_kind = media.kind;
    columns.media_ref = media.kind === "gif" ? media.gifId : media.path;
    columns.media_width = media.width;
    columns.media_height = media.height;
  }
  if (extras?.attachment) {
    columns.attach_type = extras.attachment.type;
    columns.attach_id = extras.attachment.id;
  }
  return columns;
}
