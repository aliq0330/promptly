"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchAdminUserActivity, type AdminActivityItem, type AdminActivityKind } from "@/lib/supabase/admin";
import { formatCount, formatRelativeTime } from "@/lib/utils";
import { formatDateTime, kindKey } from "./format";

const PAGE = 30;

function ActivityRow({ item, kind }: { item: AdminActivityItem; kind: AdminActivityKind }) {
  const { t, language } = useTranslation();
  const meta = item.meta;
  const str = (key: string): string | null => (typeof meta[key] === "string" && meta[key] ? (meta[key] as string) : null);
  const num = (key: string): number | null => (typeof meta[key] === "number" ? (meta[key] as number) : null);
  const status = str("status");
  const likes = num("likes");
  const commentCount = num("comments");

  let title = item.body;
  let subtitle: string | null = null;
  if (kind === "posts") {
    title = item.body || "—";
    subtitle = str("description");
  } else if (kind === "comments") {
    const target = str("target_title");
    subtitle = target ? t("admin.user.onTarget", { title: target }) : null;
  } else if (kind === "saves") {
    const collection = str("collection");
    subtitle = collection ? t("admin.user.inCollection", { name: collection }) : null;
  } else if (kind === "likes" && item.label === "comment") {
    const author = str("comment_author");
    subtitle = author ? t("admin.user.commentBy", { name: author }) : null;
  } else if (kind === "follows") {
    const username = str("username");
    subtitle = username ? `@${username}` : null;
  } else if (kind === "reports") {
    subtitle = str("status");
  }

  return (
    <li className="space-y-1 rounded-lg border border-border-soft p-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <Badge variant="neutral">{t(kindKey(item.label))}</Badge>
        {kind === "posts" && str("content_type") && <Badge variant="neutral">{t(`contentType.${str("content_type")}` as never)}</Badge>}
        {meta.is_reply === true && <Badge variant="neutral">{t("admin.user.reply")}</Badge>}
        {meta.deleted === true && <Badge variant="warning">{t("admin.user.deletedItem")}</Badge>}
        {status === "draft" && <Badge variant="warning">{t("admin.user.draftStatus")}</Badge>}
        {str("visibility") === "private" && <Badge variant="warning">{t("admin.user.privateStatus")}</Badge>}
        <span className="text-caption text-text-muted" title={formatDateTime(item.createdAt, language)}>
          {formatRelativeTime(item.createdAt, language)}
        </span>
      </div>
      {title && <p className="break-words text-small font-medium text-text">{title}</p>}
      {subtitle && <p className="line-clamp-2 break-words text-caption text-text-muted">{subtitle}</p>}
      {kind === "posts" && (likes !== null || commentCount !== null) && (
        <p className="text-caption tabular-nums text-text-muted">
          {formatCount(likes ?? 0)} {t("admin.stats.likes").toLowerCase()} · {formatCount(commentCount ?? 0)} {t("admin.stats.comments").toLowerCase()}
        </p>
      )}
      {item.href && (
        <Link href={item.href} className="inline-flex items-center gap-1 text-caption font-medium text-primary hover:underline">
          <ExternalLink size={12} aria-hidden /> {t("moderation.open")}
        </Link>
      )}
    </li>
  );
}

export function ActivityList({ userId, kind }: { userId: string; kind: AdminActivityKind }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<AdminActivityItem[] | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchAdminUserActivity(userId, kind, null, PAGE)
      .then((rows) => {
        if (cancelled) return;
        setItems(rows);
        setHasMore(rows.length >= PAGE);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [userId, kind]);

  const loadMore = useCallback(async () => {
    if (!items || items.length === 0 || loadingMore) return;
    setLoadingMore(true);
    try {
      const rows = await fetchAdminUserActivity(userId, kind, items[items.length - 1].createdAt, PAGE);
      setItems((prev) => [...(prev ?? []), ...rows]);
      setHasMore(rows.length >= PAGE);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [items, loadingMore, userId, kind]);

  if (error) return <p className="text-small text-danger">{t("admin.loadFailed")}</p>;
  if (!items) return <p className="text-small text-text-muted">{t("common.loading")}</p>;
  if (items.length === 0) return <p className="text-small text-text-muted">{t("admin.user.activityEmpty")}</p>;
  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {items.map((item) => (
          <ActivityRow key={`${item.id}-${item.createdAt}`} item={item} kind={kind} />
        ))}
      </ul>
      {hasMore && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" disabled={loadingMore} onClick={loadMore}>
            {loadingMore ? t("common.loadingMore") : t("common.loadMore")}
          </Button>
        </div>
      )}
    </div>
  );
}
