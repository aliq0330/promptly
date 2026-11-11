"use client";

import { useId, useState } from "react";
import { Download } from "@/components/icons/download";
import { FileText } from "@/components/icons/file-text";
import { ImageIcon } from "@/components/icons/image-icon";
import { Link2 } from "@/components/icons/link-2";
import { Lock } from "@/components/icons/lock";
import { SquareTerminal } from "@/components/icons/square-terminal";
import { UserPlus } from "@/components/icons/user-plus";
import { X } from "@/components/icons/x";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { ProjectRoleChip } from "@/features/teams/project-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { boardToJson, buildPdf, exportFileName } from "@/lib/board-export";
import { presentationFrames } from "@/lib/team-board";
import { absoluteUrl, cn } from "@/lib/utils";
import type { SpaceConnection, SpaceItem, SpacePalette } from "@/lib/supabase/spaces";
import { canvasToBlob, downloadBlob, renderBoard } from "./board-export-render";
import type { TeamBoardConfig } from "./board-types";

/**
 * Paylaş penceresi (docs/history/367-*): "Paylaşım" (davet, erişimi olanlar, erişim notu, pano bağlantısı) ve "Dışa aktarma" (PNG, PDF, JSON).
 * Katılım yalnız kullanıcı adı ya da davet bağlantısıdır (e-posta yok). Bağlantıyı yalnız proje üyeleri açar. Dışa aktarma tarayıcıda üretilir.
 */

export interface ShareData {
  title: string;
  items: SpaceItem[];
  connections: SpaceConnection[];
  palettes: SpacePalette[];
  describe: (item: SpaceItem) => { title: string; body: string };
}

type ExportKind = "png" | "pdf" | "json";

export function ShareDialog({
  team,
  data,
  canInvite,
  canExport,
  canEditAccess,
  onInvite,
  onEditAccess,
  onClose,
}: {
  team: TeamBoardConfig;
  data: ShareData;
  canInvite: boolean;
  canExport: boolean;
  canEditAccess: boolean;
  onInvite: () => void;
  onEditAccess: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const titleId = useId();
  const [tab, setTab] = useState<"share" | "export">("share");
  const [copied, setCopied] = useState<"idle" | "ok" | "failed">("idle");
  const [busy, setBusy] = useState<ExportKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const link = absoluteUrl(team.hrefOf(team.currentId));

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied("ok");
    } catch {
      setCopied("failed");
    }
    setTimeout(() => setCopied("idle"), 1800);
  };

  const runExport = async (kind: ExportKind) => {
    setBusy(kind);
    setError(null);
    try {
      if (kind === "json") {
        const json = boardToJson({ title: data.title, items: data.items, connections: data.connections, palettes: data.palettes });
        downloadBlob(new Blob([JSON.stringify(json, null, 2)], { type: "application/json" }), exportFileName(data.title, "json"));
      } else if (kind === "png") {
        const rendered = await renderBoard({ items: data.items, connections: data.connections, palettes: data.palettes, describe: data.describe });
        if (!rendered) throw new Error(t("tb.share.emptyBoard"));
        downloadBlob(await canvasToBlob(rendered.canvas, "image/png"), exportFileName(data.title, "png"));
      } else {
        const frames = presentationFrames(data.items);
        const regions = frames.length > 0 ? frames.map((frame) => ({ x: frame.x, y: frame.y, w: frame.w, h: frame.h })) : [undefined];
        const pages = [];
        for (const region of regions) {
          const rendered = await renderBoard({ items: data.items, connections: data.connections, palettes: data.palettes, describe: data.describe, region, maxSide: 3000 });
          if (!rendered) throw new Error(t("tb.share.emptyBoard"));
          const jpeg = new Uint8Array(await (await canvasToBlob(rendered.canvas, "image/jpeg", 0.9)).arrayBuffer());
          pages.push({ jpeg, width: rendered.width, height: rendered.height });
        }
        downloadBlob(new Blob([buildPdf(pages) as BlobPart], { type: "application/pdf" }), exportFileName(data.title, "pdf"));
      }
    } catch (e) {
      setError(e instanceof Error && e.message ? e.message : t("tb.share.exportFailed"));
    } finally {
      setBusy(null);
    }
  };

  const copyButton = (className?: string) => (
    <button type="button" onClick={() => void copyLink()} data-board-copy-link="" className={cn("flex h-12 w-full items-center justify-center gap-2 rounded-xl text-body font-bold", className)}>
      {copied === "ok" ? <span>{t("common.copied")}</span> : copied === "failed" ? <span>{t("spaces.share.copyFailed")}</span> : (
        <>
          <Lock size={18} aria-hidden />
          {t("tb.share.copyLink")}
        </>
      )}
    </button>
  );

  const exportRows: { kind: ExportKind; icon: typeof ImageIcon; label: string; sub: string }[] = [
    { kind: "png", icon: ImageIcon, label: t("tb.share.png"), sub: t("tb.share.pngSub") },
    { kind: "pdf", icon: FileText, label: t("tb.share.pdf"), sub: t("tb.share.pdfSub") },
    { kind: "json", icon: SquareTerminal, label: t("tb.share.json"), sub: t("tb.share.jsonSub") },
  ];

  return (
    <Modal onClose={onClose} labelledBy={titleId}>
      <div data-testid="board-share-dialog" onClick={(event) => event.stopPropagation()} className="flex max-h-[92dvh] w-full max-w-[32.5rem] flex-col overflow-hidden rounded-[22px] border border-border bg-surface shadow-lg">
        <header className="flex shrink-0 items-center gap-2 px-5 pb-2.5 pt-4">
          <h2 id={titleId} className="min-w-0 flex-1 truncate font-display text-h3 font-extrabold text-text">
            {t("tb.share.title", { name: team.fileTitle ?? team.projectTitle })}
          </h2>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="grid h-10 w-10 place-items-center rounded-full hover:bg-surface-soft">
            <X size={20} aria-hidden />
          </button>
        </header>
        <div className="shrink-0 px-5 pb-3.5">
          <div role="tablist" aria-label={t("tb.share.tabs")} className="flex gap-1 rounded-xl bg-surface-soft p-1">
            {(["share", "export"] as const).map((key) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} data-share-tab={key} className={cn("h-10 flex-1 rounded-lg text-small font-semibold", tab === key ? "bg-surface text-text shadow-xs" : "text-text-secondary")}>
                {t(key === "share" ? "tb.share.tabShare" : "tb.share.tabExport")}
              </button>
            ))}
          </div>
        </div>

        {tab === "share" ? (
          <>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-5 pb-3">
              {canInvite && (
                <button type="button" onClick={onInvite} data-board-invite="" className="flex h-12 w-full items-center gap-2.5 rounded-xl border border-border px-3.5 text-left text-body text-text-secondary hover:bg-surface-soft">
                  <UserPlus size={19} aria-hidden />
                  {t("tb.share.invite")}
                </button>
              )}
              <div className="flex items-center gap-2 pt-1">
                <p className="flex-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tb.share.people")}</p>
                {canEditAccess && (
                  <button type="button" onClick={onEditAccess} data-board-edit-access="" className="text-small font-semibold text-primary">
                    {t("tb.share.editRoles")}
                  </button>
                )}
              </div>
              <ul className="divide-y divide-border-soft" data-testid="board-share-people">
                {team.people.map((person) => (
                  <li key={`${person.type}-${person.id}`} className="flex min-h-14 items-center gap-3">
                    <Avatar src={person.avatarUrl} alt="" size={40} />
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-body font-bold text-text">{person.name}</span>
                      <span className="block truncate text-small text-text-secondary">
                        {person.type === "group" ? t("tm.access.groupSub", { count: person.memberCount ?? 0 }) : person.username ? `@${person.username}` : ""}
                        {person.implicit ? ` · ${t("tp.people.implicit")}` : ""}
                      </span>
                    </span>
                    <ProjectRoleChip role={person.role} />
                  </li>
                ))}
              </ul>
              <p className="pt-1 text-caption font-bold uppercase tracking-[0.06em] text-text-muted">{t("tb.share.access")}</p>
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary">
                  <Lock size={19} aria-hidden />
                </span>
                <span className="min-w-0 leading-tight">
                  <span className="block text-body font-bold text-text">{t(team.accessMode === "all" ? "tb.share.accessAll" : "tb.share.accessMembers")}</span>
                  <span className="block text-small text-text-secondary">{t("tb.share.accessHint")}</span>
                </span>
              </div>
            </div>
            <footer className="shrink-0 space-y-2 border-t border-border-soft px-5 pb-5 pt-3.5 text-center">
              <p className="text-small text-text-secondary">{t("tb.share.onlyMembers")}</p>
              {copyButton("bg-primary text-primary-foreground")}
            </footer>
          </>
        ) : (
          <div className="min-h-0 flex-1 space-y-3.5 overflow-y-auto overscroll-contain px-5 pb-5">
            <section className="space-y-2.5 rounded-2xl border border-border-soft p-4">
              <h3 className="text-body font-bold text-text">{t("tb.share.sendTitle")}</h3>
              <p className="text-small leading-relaxed text-text-secondary">{t("tb.share.sendBody")}</p>
              {canInvite && (
                <button type="button" onClick={onInvite} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-body font-bold text-primary-foreground">
                  <UserPlus size={19} aria-hidden />
                  {t("tb.share.inviteButton")}
                </button>
              )}
              <button type="button" onClick={() => void copyLink()} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-surface text-body font-semibold text-text">
                <Link2 size={19} aria-hidden />
                {copied === "ok" ? t("common.copied") : t("tb.share.copyLink")}
              </button>
              <p className="text-caption leading-snug text-text-muted">{t("tb.share.sendNote")}</p>
            </section>
            <ul className="space-y-1">
              {exportRows.map((row) => {
                const Icon = row.icon;
                return (
                  <li key={row.kind}>
                    <button type="button" disabled={!canExport || busy !== null} onClick={() => void runExport(row.kind)} data-board-export={row.kind} className="flex min-h-16 w-full items-center gap-3 rounded-xl px-1 text-left disabled:opacity-50">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border-soft bg-surface text-primary">
                        <Icon size={22} aria-hidden />
                      </span>
                      <span className="min-w-0 flex-1 leading-tight">
                        <span className="block text-body font-bold text-text">{row.label}</span>
                        <span className="block text-small text-text-secondary">{busy === row.kind ? t("tb.share.exporting") : row.sub}</span>
                      </span>
                      <Download size={21} className="shrink-0 text-text-secondary" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
            {!canExport && <p className="text-small text-text-muted">{t("tb.share.exportRoles")}</p>}
            {error && (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-small text-danger">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
