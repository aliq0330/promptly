import { spaceHref } from "@/lib/spaces";
import { boardPageHref } from "@/lib/team-board";
import { projectLink } from "@/lib/team-projects";
import { copyImages, copyItemsRpc, copyPinComments, type CopyResult, type PinCopyResult } from "./space-copy";
import { createSpace, deleteSpace, updateSpace } from "./spaces";
import { createBoard, createFile, deleteFile } from "./team-projects";

/**
 * "Başka yere kopyala" akışının sırası (docs/history/462-*). Kaynak Space'e HİÇBİR ZAMAN yazılmaz, yalnız en son (ve yalnız istenirse) arşivlenir.
 *
 * Atomiklik: öğe kopyalama (`space_copy_items`) TEK veritabanı işlemidir — hata olursa hiçbir öğe yazılmaz. Bu yüzden görsel ya da öğe adımı başarısız
 * olursa az önce AÇILAN dosya/Space geri silinir ve "hiçbir şey kopyalanmadı" denir. Öğeler yazıldıktan sonraki adımların (yorumlar, arşiv) hatası
 * kopyayı bozmaz: sonuç uyarıyla döner ve kopya yerinde kalır.
 */
export type TransferStep = "file" | "board" | "space" | "media" | "items" | "comments" | "archive";
export type TransferStepState = "run" | "done" | "fail" | "skip";

export type TransferDest =
  | { kind: "newSpace"; title: string }
  | { kind: "space"; spaceId: string }
  | { kind: "teamNew"; teamId: string; projectId: string; fileTitle: string }
  | { kind: "teamFile"; teamId: string; projectId: string; fileId: string; areaId: string };

export interface TransferRequest {
  fromSpaceId: string;
  /** Seçimle kopyalama; boşsa Space'in tamamı. */
  itemIds: string[] | null;
  dest: TransferDest;
  copyComments: boolean;
  archiveSource: boolean;
}

export interface TransferOutcome {
  copy: CopyResult;
  comments: PinCopyResult | null;
  commentsFailed: boolean;
  archived: boolean;
  archiveFailed: boolean;
  /** Sonucu açan adres (yeni dosyanın panosu, dosya, Space). */
  href: string;
}

export class TransferError extends Error {
  step: TransferStep;
  /** Bu akışta açılan dosya/Space geri silindi mi (silinemediyse yetim kalır, kullanıcıya söylenir). */
  rolledBack: boolean;
  created: "file" | "space" | null;
  constructor(message: string, step: TransferStep, created: "file" | "space" | null, rolledBack: boolean) {
    super(message);
    this.step = step;
    this.created = created;
    this.rolledBack = rolledBack;
  }
}

export function transferSteps(req: TransferRequest): TransferStep[] {
  const steps: TransferStep[] = [];
  if (req.dest.kind === "teamNew") steps.push("file", "board");
  if (req.dest.kind === "newSpace") steps.push("space");
  steps.push("media", "items");
  if (req.copyComments) steps.push("comments");
  if (req.archiveSource) steps.push("archive");
  return steps;
}

export async function runTransfer(req: TransferRequest, onStep: (step: TransferStep, state: TransferStepState, meta?: string) => void): Promise<TransferOutcome> {
  let current: TransferStep = "media";
  let created: { kind: "file" | "space"; id: string } | null = null;
  let target = "";
  let href = "";
  try {
    const { dest } = req;
    if (dest.kind === "teamNew") {
      current = "file";
      onStep("file", "run");
      const fileId = await createFile(dest.projectId, dest.fileTitle);
      created = { kind: "file", id: fileId };
      onStep("file", "done");
      current = "board";
      onStep("board", "run");
      target = await createBoard(dest.projectId, dest.fileTitle, fileId);
      onStep("board", "done");
      href = boardPageHref(dest.teamId, dest.projectId, target);
    } else if (dest.kind === "newSpace") {
      current = "space";
      onStep("space", "run");
      target = await createSpace({ title: dest.title, description: "", kind: "free", groups: [] });
      created = { kind: "space", id: target };
      onStep("space", "done");
      href = spaceHref(target);
    } else if (dest.kind === "space") {
      target = dest.spaceId;
      href = spaceHref(target);
    } else {
      target = dest.areaId;
      href = projectLink(dest.teamId, dest.projectId, { file: dest.fileId });
    }

    current = "media";
    onStep("media", "run");
    const { media, failed, total } = await copyImages(req.fromSpaceId, target, req.itemIds);
    onStep("media", "done", total ? `${total - failed}/${total}` : undefined);

    current = "items";
    onStep("items", "run");
    const copy = await copyItemsRpc({ fromSpaceId: req.fromSpaceId, toSpaceId: target, itemIds: req.itemIds, media, failedMedia: failed });
    onStep("items", "done", String(copy.done));

    let comments: PinCopyResult | null = null;
    let commentsFailed = false;
    if (req.copyComments) {
      current = "comments";
      onStep("comments", "run");
      try {
        comments = await copyPinComments({ fromSpaceId: req.fromSpaceId, toSpaceId: target, result: copy, floating: !req.itemIds });
        onStep("comments", "done", String(comments.roots + comments.replies));
      } catch {
        commentsFailed = true;
        onStep("comments", "fail");
      }
    }

    let archived = false;
    let archiveFailed = false;
    if (req.archiveSource) {
      current = "archive";
      onStep("archive", "run");
      try {
        await updateSpace(req.fromSpaceId, { archivedAt: new Date().toISOString() });
        archived = true;
        onStep("archive", "done");
      } catch {
        archiveFailed = true;
        onStep("archive", "fail");
      }
    }
    return { copy, comments, commentsFailed, archived, archiveFailed, href };
  } catch (err) {
    onStep(current, "fail");
    let rolledBack = false;
    if (created) {
      try {
        if (created.kind === "file") await deleteFile(created.id);
        else await deleteSpace(created.id);
        rolledBack = true;
      } catch {
        rolledBack = false;
      }
    }
    throw new TransferError(err instanceof Error ? err.message : String(err), current, created ? created.kind : null, created ? rolledBack : true);
  }
}
