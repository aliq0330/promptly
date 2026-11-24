"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bell } from "@/components/icons/bell";
import { Button } from "@/components/ui/button";
import { SettingsCard } from "@/features/settings/settings-ui";
import { announceNotice } from "@/lib/app-notice";
import { commentFollowHref } from "@/lib/comment-follow";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchMyCommentFollowList, setCommentFollow, type CommentFollowRow } from "@/lib/supabase/comment-follow";

/**
 * Ayarlar → Bildirimler → "Takip ettiğin yorumlar" (docs/history/452-*): içeriğin tüm yorumlarını ya da tek bir yorum başlığını takip ettiğin yerler;
 * "Takibi bırak" `set_comment_subscription`'ı kapatır. Yorum yazınca / yanıt alınca otomatik eklenenler "otomatik" etiketi taşır.
 */
export function CommentFollowSettings() {
  const { t } = useTranslation();
  const [rows, setRows] = useState<CommentFollowRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchMyCommentFollowList()
      .then((list) => {
        setRows(list);
        setFailed(false);
      })
      .catch((err) => {
        console.error("fetchMyCommentFollowList", err);
        setFailed(true);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function unfollow(row: CommentFollowRow) {
    setBusyId(row.id);
    try {
      await setCommentFollow(row.kind, row.targetId, row.commentId, false);
      setRows((current) => (current ? current.filter((item) => item.id !== row.id) : current));
      announceNotice(t("settings.commentFollows.removed"));
    } catch (err) {
      console.error("unfollow", err);
      announceNotice(t("comments.follow.failed"));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <SettingsCard title={t("settings.commentFollows.title")} hint={t("settings.commentFollows.desc")}>
      {failed ? (
        <p className="text-small text-danger" role="alert">
          {t("settings.commentFollows.loadFailed")}
        </p>
      ) : rows === null ? (
        <p className="text-small text-text-muted">{t("common.loading")}</p>
      ) : rows.length === 0 ? (
        <p className="flex items-center gap-2 text-small text-text-muted" data-comment-follows-empty="">
          <Bell size={16} aria-hidden />
          {t("settings.commentFollows.empty")}
        </p>
      ) : (
        <ul className="divide-y divide-border-soft" data-comment-follow-list="">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center gap-3 py-2.5">
              <span className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-soft text-text-secondary">
                <Bell size={16} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <Link href={commentFollowHref(row.kind, row.targetId, row.commentId)} className="block truncate text-small font-medium text-text hover:underline">
                  {row.title || row.commentPreview || row.targetId}
                </Link>
                <span className="block truncate text-caption text-text-muted">
                  {t(row.scope === "content" ? "settings.commentFollows.content" : "settings.commentFollows.thread")}
                  {row.scope === "thread" && row.commentPreview ? ` · ${row.commentPreview}` : ""}
                  {row.auto ? ` · ${t("settings.commentFollows.auto")}` : ""}
                </span>
              </span>
              <Button variant="outline" size="sm" className="h-9" disabled={busyId === row.id} onClick={() => void unfollow(row)}>
                {t("settings.commentFollows.remove")}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </SettingsCard>
  );
}
