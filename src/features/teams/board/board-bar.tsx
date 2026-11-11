"use client";

import Link from "next/link";
import { ChevronLeft } from "@/components/icons/chevron-left";
import { Info } from "@/components/icons/info";
import { MessageCircle } from "@/components/icons/message-circle";
import { Share2 } from "@/components/icons/share-2";
import { Avatar } from "@/components/ui/avatar";
import { ProjectRoleChip } from "@/features/teams/project-ui";
import { useTranslation } from "@/lib/i18n/language-provider";
import { cn } from "@/lib/utils";
import type { TeamBoardConfig } from "./board-types";

/**
 * Pano yol çubuğu (docs/history/367-*): geri · üst konum + dosya/proje adı · kişiler · yorumlar · Paylaş · rolün · bilgi.
 * Telefonda aynı öğeler sıkışık satırdır (kişiler ve rol çipi gizli). Uygulama menüleri bu çubuğun dışında, yerinde kalır.
 */
export function TeamBoardBar({
  team,
  commentCount,
  commentsActive,
  onComments,
  onShare,
  onInfo,
}: {
  team: TeamBoardConfig;
  commentCount: number;
  commentsActive: boolean;
  onComments: () => void;
  onShare: () => void;
  onInfo: () => void;
}) {
  const { t } = useTranslation();
  const people = team.people.filter((person) => person.type === "member");
  const shown = people.slice(0, 3);
  const more = people.length - shown.length;
  return (
    <header className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border-soft bg-surface px-3 md:gap-3 md:px-4" data-testid="team-board-bar">
      <Link href={team.backHref} aria-label={t("tp.page.back")} className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-soft bg-surface text-text hover:bg-surface-soft" data-board-back="">
        <ChevronLeft size={20} aria-hidden />
      </Link>
      <div className="min-w-0 flex-1 leading-tight">
        <p className="truncate text-caption text-text-secondary">{team.fileTitle ? `${team.projectTitle} › ${team.teamName}` : team.teamName}</p>
        <h1 className="truncate font-display text-[1.125rem] font-extrabold text-text md:text-[1.25rem]" data-board-title="">
          {team.fileTitle ?? team.projectTitle}
        </h1>
      </div>
      {shown.length > 0 && (
        <div className="hidden items-center md:flex" aria-hidden>
          {shown.map((person, index) => (
            <Avatar key={person.id} src={person.avatarUrl} alt="" size={30} className={cn("border-2 border-surface", index > 0 && "-ml-2")} />
          ))}
          {more > 0 && <span className="-ml-2 grid h-[30px] min-w-[30px] place-items-center rounded-full border-2 border-surface bg-text-secondary px-1 text-[0.6875rem] font-bold text-background">+{more}</span>}
        </div>
      )}
      <button
        type="button"
        onClick={onComments}
        aria-pressed={commentsActive}
        aria-label={t("tb.comments.title")}
        data-testid="board-comments-toggle"
        className={cn("flex h-10 shrink-0 items-center gap-1.5 rounded-full border px-3 text-small font-bold", commentsActive ? "border-warning/40 bg-warning/12 text-text" : "border-border-soft bg-surface text-text hover:bg-surface-soft")}
      >
        <MessageCircle size={19} aria-hidden />
        <span className="tabular-nums" data-board-comment-count="">{commentCount}</span>
      </button>
      <button type="button" onClick={onShare} data-testid="board-share-button" className="flex h-10 shrink-0 items-center gap-1.5 rounded-full bg-primary px-3.5 text-small font-bold text-primary-foreground hover:bg-primary-hover max-sm:w-10 max-sm:justify-center max-sm:px-0" aria-label={t("tb.share.button")}>
        <Share2 size={18} aria-hidden />
        <span className="max-sm:hidden">{t("tb.share.button")}</span>
      </button>
      {team.role && <ProjectRoleChip role={team.role} className="hidden lg:inline-flex" />}
      <button type="button" onClick={onInfo} aria-label={t("tp.info.open")} data-path-info="" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-soft bg-surface text-primary hover:bg-surface-soft">
        <Info size={19} aria-hidden />
      </button>
    </header>
  );
}
