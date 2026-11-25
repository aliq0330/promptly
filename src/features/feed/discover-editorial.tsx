"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Heart } from "@/components/icons/heart";
import { Trophy } from "@/components/icons/trophy";
import { TrendingUp } from "@/components/icons/trending-up";
import { Avatar } from "@/components/ui/avatar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { CreatorCard } from "@/features/profile/creator-card";
import { ToolLogo } from "@/features/content/tool-logo";
import { findTool } from "@/lib/ai-tool-catalog";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { supabase } from "@/lib/supabase/client";
import { fetchFeedPage, type FeedEntry } from "@/lib/supabase/feed";
import { fetchPromptsByIds, fetchTopPrompts } from "@/lib/supabase/prompts";
import { fetchCreatorsPage } from "@/lib/supabase/profiles";
import { fetchRecentSkills } from "@/lib/supabase/skills";
import { cn, formatCount, promptHref, tagHref, toolHref } from "@/lib/utils";
import type { Prompt, UserProfile } from "@/types";
import { FeedItemCard } from "./feed-grid";

/**
 * Keşfet'in editoryal açılışı (docs/history/451-*, "Tümü" bölümü): dergi düzeni. Gündemdeki konular (büyüme yüzdesiyle), popüler promptlar
 * (haftanın promptu büyük kapak), metin/ses/video, workflow'lar ve açık istekler, yaratıcılar, yükselen araçlar (8 haftalık çizgi),
 * Skill'ler. Hepsi gerçek satırlardan; boş bölüm çizilmez (yer tutucu yok). Bütün sorgular TEK `Promise.all`'da, 3 dk modül önbelleği (Geri'de
 * yeniden yükleme yok) — docs/history/220-* kuralı.
 */
interface Topic {
  slug: string;
  label: string;
  recent: number;
  previous: number;
  cover: Prompt | null;
}
interface RisingTool {
  id: string;
  total: number;
  weeks: number[];
  growth: number;
  samples: Prompt[];
}
interface Editorial {
  topics: Topic[];
  weekPrompt: Prompt | null;
  popular: Prompt[];
  media: FeedEntry[];
  workflows: FeedEntry[];
  requests: FeedEntry[];
  tools: RisingTool[];
  skills: FeedEntry[];
  creators: UserProfile[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const TTL_MS = 3 * 60 * 1000;
let cache: { data: Editorial; at: number } | null = null;

async function safe<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

const page = (kind: FeedEntry["kind"] | "all", limit: number, extra: { contentType?: "text" | "audio" | "video"; openOnly?: boolean } = {}) =>
  safe(
    fetchFeedPage({
      scope: "all",
      order: "recommended",
      kind,
      taxonomy: { ...EMPTY_TAXONOMY_FILTER, contentType: extra.contentType ?? null },
      openOnly: extra.openOnly,
      limit,
    }).then((result) => result.items),
    [] as FeedEntry[],
  );

async function loadEditorial(): Promise<Editorial> {
  const [topicRows, proven, week, text, audio, video, workflows, requests, toolRows, skills, creators] = await Promise.all([
    safe(
      supabase.rpc("discover_trending_topics", { p_limit: 8 }).then(({ data, error }) => {
        if (error) throw error;
        return (Array.isArray(data) ? data : []) as { slug: string; label: string; recent_count: number; previous_count: number; cover_prompt_id: string | null }[];
      }),
      [],
    ),
    safe(fetchFeedPage({ scope: "all", order: "proven", kind: "prompt", taxonomy: EMPTY_TAXONOMY_FILTER, limit: 1 }).then((result) => result.items), [] as FeedEntry[]),
    // "Popüler": the most liked public prompts of the last 7 days, or of the last 30 while the week is too thin (never padded with older ones).
    Promise.all([
      safe(fetchTopPrompts({ since: new Date(Date.now() - 7 * DAY_MS).toISOString(), limit: 12 }), [] as Prompt[]),
      safe(fetchTopPrompts({ since: new Date(Date.now() - 30 * DAY_MS).toISOString(), limit: 12 }), [] as Prompt[]),
    ]).then(([lastWeek, lastMonth]) => (lastWeek.filter((prompt) => prompt.media.length > 0).length >= 3 ? lastWeek : lastMonth)),
    page("prompt", 2, { contentType: "text" }),
    page("prompt", 1, { contentType: "audio" }),
    page("prompt", 1, { contentType: "video" }),
    page("workflow", 1),
    page("request", 2, { openOnly: true }),
    safe(
      supabase.rpc("discover_rising_tools", { p_limit: 4 }).then(({ data, error }) => {
        if (error) throw error;
        return ((Array.isArray(data) ? data : []) as { tool_id: string; total: number; weeks: number[] | null; growth: number; sample_ids: string[] | null }[]).map((row) => ({
          ...row,
          weeks: Array.isArray(row.weeks) ? row.weeks : [],
          sample_ids: Array.isArray(row.sample_ids) ? row.sample_ids : [],
        }));
      }),
      [],
    ),
    SKILLS_MENU_ENABLED ? safe(fetchRecentSkills(3).then((result) => result.items.map((skill) => ({ kind: "skill" as const, data: skill }))), [] as FeedEntry[]) : Promise.resolve([] as FeedEntry[]),
    safe(fetchCreatorsPage(null, 9).then((result) => result.creators), [] as UserProfile[]),
  ]);

  const promptIds = [...new Set([...topicRows.map((row) => row.cover_prompt_id), ...toolRows.flatMap((row) => row.sample_ids)].filter((id): id is string => Boolean(id)))];
  const prompts = await safe(fetchPromptsByIds(promptIds), [] as Prompt[]);
  const byId = new Map(prompts.map((prompt) => [prompt.id, prompt]));
  const weekPrompt = proven[0]?.kind === "prompt" ? proven[0].data : null;
  const popular = week.filter((prompt) => prompt.id !== weekPrompt?.id && prompt.media.length > 0);
  return {
    topics: topicRows.map((row) => ({
      slug: row.slug,
      label: row.label,
      recent: row.recent_count,
      previous: row.previous_count,
      cover: row.cover_prompt_id ? (byId.get(row.cover_prompt_id) ?? null) : null,
    })),
    weekPrompt: weekPrompt ?? popular[0] ?? null,
    popular: weekPrompt ? popular.slice(0, 7) : popular.slice(1, 8),
    media: [...text, ...audio, ...video],
    workflows,
    requests,
    tools: toolRows.map((row) => ({
      id: row.tool_id,
      total: row.total,
      weeks: row.weeks,
      growth: Number(row.growth),
      samples: row.sample_ids.map((id) => byId.get(id)).filter((prompt): prompt is Prompt => Boolean(prompt)),
    })),
    skills,
    creators,
  };
}

function useEditorial(): Editorial | null {
  const [data, setData] = useState<Editorial | null>(() => (cache && Date.now() - cache.at < TTL_MS ? cache.data : null));
  useEffect(() => {
    if (cache && Date.now() - cache.at < TTL_MS) return;
    let cancelled = false;
    void loadEditorial()
      .catch((): Editorial => ({ topics: [], weekPrompt: null, popular: [], media: [], workflows: [], requests: [], tools: [], skills: [], creators: [] }))
      .then((loaded) => {
        cache = { data: loaded, at: Date.now() };
        if (!cancelled) setData(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return data;
}

function SectionHead({ title, hint, href, onSeeAll }: { title: string; hint: string; href?: string; onSeeAll?: () => void }) {
  const { t } = useTranslation();
  const more = (
    <>
      {t("discover.ed.seeAll")}
      <ArrowRight size={16} aria-hidden />
    </>
  );
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
      <div className="min-w-0 flex-1">
        <h2 className="font-display text-h1 font-bold tracking-[-0.025em] text-text">{title}</h2>
        <p className="text-small text-text-muted">{hint}</p>
      </div>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:text-primary-hover">
          {more}
        </Link>
      ) : onSeeAll ? (
        <button type="button" onClick={onSeeAll} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary hover:text-primary-hover">
          {more}
        </button>
      ) : null}
    </div>
  );
}

function Section({ children, label }: { children: ReactNode; label: string }) {
  return (
    <section className="flex flex-col gap-4" aria-label={label}>
      {children}
    </section>
  );
}

/** Görsel üstü yazı alanı: altta koyu geçiş, beyaz metin (art token'ları). */
function ArtTile({ href, prompt, className, children }: { href: string; prompt: Prompt | null; className?: string; children: ReactNode }) {
  const image = prompt?.media[0];
  return (
    <Link href={href} className={cn("group relative flex flex-col justify-end overflow-hidden rounded-lg bg-surface-soft p-4 text-on-art", className)}>
      {image && (
        <StorageAppearanceImage
          src={image.url}
          alt=""
          color={image.color}
          placeholder={image.placeholder}
          sizes="(min-width: 1024px) 25vw, 50vw"
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 ease-soft group-hover:scale-[1.03] motion-reduce:transition-none"
        />
      )}
      <span aria-hidden className="art-scrim absolute inset-0" />
      <span className="relative flex flex-col gap-1">{children}</span>
    </Link>
  );
}

function Sparkline({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  const points = weeks.map((value, index) => `${2 + (index * 126) / Math.max(1, weeks.length - 1)},${38 - (value / max) * 32}`);
  const line = `M${points.join(" L")}`;
  const last = points[points.length - 1]?.split(",") ?? ["128", "38"];
  return (
    <svg viewBox="0 0 130 40" preserveAspectRatio="none" className="h-10 w-full" aria-hidden>
      <path d={`${line} L128,40 L2,40 Z`} className="fill-primary-soft" />
      <path d={line} className="fill-none stroke-primary" strokeWidth={2} vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3} className="fill-primary" />
    </svg>
  );
}

export function DiscoverEditorial({ onSeeAllCreators }: { onSeeAllCreators: () => void }) {
  const { t } = useTranslation();
  const data = useEditorial();

  if (!data) {
    return (
      <div className="space-y-10" aria-busy="true" aria-label={t("common.loadingAriaLabel")} data-discover-editorial-loading="">
        <div className="flex gap-3 overflow-hidden">
          {[0, 1, 2, 3, 4].map((i) => (
            <span key={i} className="skeleton-shimmer h-36 w-48 shrink-0 rounded-lg" />
          ))}
        </div>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <span className="skeleton-shimmer col-span-2 row-span-2 aspect-square rounded-lg" />
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="skeleton-shimmer aspect-square rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-12" data-discover-editorial="">
      {data.topics.length > 0 && (
        <Section label={t("discover.ed.topics")}>
          <SectionHead title={t("discover.ed.topics")} hint={t("discover.ed.topicsHint")} href="/tags" />
          <ScrollRow className="gap-3">
            {data.topics.map((topic) => {
              const growth = topic.previous > 0 ? Math.round(((topic.recent - topic.previous) * 100) / topic.previous) : null;
              return (
                <ArtTile key={topic.slug} href={tagHref(topic)} prompt={topic.cover} className="h-36 w-48 shrink-0 sm:w-52">
                  <span className="font-display text-h3 font-bold leading-tight">#{topic.label}</span>
                  <span className="flex items-center gap-1.5 text-caption text-on-art-muted">
                    {t("discover.ed.topicCount", { count: formatCount(topic.recent) })}
                    <TrendingUp size={12} aria-hidden />
                    {growth === null ? t("discover.ed.new") : t("discover.ed.growth", { sign: growth > 0 ? "+" : growth < 0 ? "−" : "", value: Math.abs(growth) })}
                  </span>
                </ArtTile>
              );
            })}
          </ScrollRow>
        </Section>
      )}

      {data.weekPrompt && (
        <Section label={t("discover.ed.popular")}>
          <SectionHead title={t("discover.ed.popular")} hint={t("discover.ed.popularHint")} />
          <div className="grid auto-rows-[180px] grid-cols-2 gap-3 sm:auto-rows-[220px] lg:grid-cols-4">
            <ArtTile href={promptHref(data.weekPrompt)} prompt={data.weekPrompt} className="col-span-2 row-span-2 p-6">
              <span className="flex items-center gap-1.5 text-caption font-semibold text-on-art-muted">
                <Trophy size={12} aria-hidden />
                {t("discover.ed.weekPrompt")}
              </span>
              <span className="font-display text-display font-extrabold leading-none tracking-[-0.035em]">{data.weekPrompt.title}</span>
              <span className="mt-2 flex items-center gap-2 text-small">
                <Avatar src={data.weekPrompt.author.avatarUrl} alt="" size={28} />
                <span className="font-semibold">{data.weekPrompt.author.displayName}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-on-art-muted">
                  <Heart size={16} aria-hidden />
                  {formatCount(data.weekPrompt.likeCount)}
                </span>
              </span>
            </ArtTile>
            {data.popular.map((prompt, index) => (
              <ArtTile key={prompt.id} href={promptHref(prompt)} prompt={prompt} className={index === 1 ? "row-span-2" : undefined}>
                <span className="line-clamp-2 font-display text-h3 font-bold leading-tight">{prompt.title}</span>
                <span className="flex items-center gap-2 text-caption text-on-art-muted">
                  <Avatar src={prompt.author.avatarUrl} alt="" size={20} />
                  <span className="truncate">{prompt.author.displayName}</span>
                  <span className="ml-auto inline-flex items-center gap-1">
                    <Heart size={12} aria-hidden />
                    {formatCount(prompt.likeCount)}
                  </span>
                </span>
              </ArtTile>
            ))}
          </div>
        </Section>
      )}

      {data.media.length > 0 && (
        <Section label={t("discover.ed.media")}>
          <SectionHead title={t("discover.ed.media")} hint={t("discover.ed.mediaHint")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.media.map((item) => (
              <FeedItemCard key={`${item.kind}-${item.data.id}`} item={item} />
            ))}
          </div>
        </Section>
      )}

      {(data.workflows.length > 0 || data.requests.length > 0) && (
        <Section label={t("discover.ed.workflows")}>
          <SectionHead title={t("discover.ed.workflows")} hint={t("discover.ed.workflowsHint")} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[...data.workflows, ...data.requests].map((item) => (
              <FeedItemCard key={`${item.kind}-${item.data.id}`} item={item} />
            ))}
          </div>
        </Section>
      )}

      {data.creators.length > 0 && (
        <Section label={t("discover.ed.creators")}>
          <SectionHead title={t("discover.ed.creators")} hint={t("discover.ed.creatorsHint")} onSeeAll={onSeeAllCreators} />
          <ScrollRow className="gap-4">
            {data.creators.slice(0, 8).map((creator) => (
              <div key={creator.id} className="w-64 shrink-0">
                <CreatorCard creator={creator} />
              </div>
            ))}
          </ScrollRow>
        </Section>
      )}

      {data.tools.length > 0 && (
        <Section label={t("discover.ed.tools")}>
          <SectionHead title={t("discover.ed.tools")} hint={t("discover.ed.toolsHint")} href="/discover?section=tools" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.tools.map((tool) => {
              const name = findTool(tool.id)?.name ?? tool.id;
              return (
                <Link key={tool.id} href={toolHref(tool.id)} className="flex flex-col gap-3 rounded-lg card-flat p-4 shadow-card transition-shadow duration-200 hover:shadow-card-hover">
                  <span className="flex items-center gap-3">
                    <ToolLogo toolId={tool.id} name={name} />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-text">{name}</span>
                      <span className="block text-caption text-text-muted">{t("discover.ed.toolUses", { count: formatCount(tool.total) })}</span>
                    </span>
                  </span>
                  <Sparkline weeks={tool.weeks} />
                  <span className="flex items-center justify-between text-small">
                    <span className="text-text-muted">{t("discover.ed.last8")}</span>
                    <span className={cn("inline-flex items-center gap-1 font-semibold", tool.growth >= 0 ? "text-success" : "text-text-secondary")}>
                      <TrendingUp size={16} aria-hidden />
                      {t("discover.ed.growth", { sign: tool.growth > 0 ? "+" : tool.growth < 0 ? "−" : "", value: Math.abs(tool.growth) })}
                    </span>
                  </span>
                  {tool.samples.length > 0 && (
                    <span className="grid grid-cols-3 gap-1">
                      {tool.samples.map((prompt) =>
                        prompt.media[0] ? (
                          <span key={prompt.id} className="relative block aspect-square overflow-hidden rounded-sm bg-surface-soft">
                            <StorageAppearanceImage
                              src={prompt.media[0].url}
                              alt=""
                              color={prompt.media[0].color}
                              placeholder={prompt.media[0].placeholder}
                              sizes="96px"
                              className="object-cover"
                            />
                          </span>
                        ) : null,
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        </Section>
      )}

      {data.skills.length > 0 && (
        <Section label={t("discover.ed.skills")}>
          <SectionHead title={t("discover.ed.skills")} hint={t("discover.ed.skillsHint")} href="/discover?section=skills" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {data.skills.map((item) => (
              <FeedItemCard key={`${item.kind}-${item.data.id}`} item={item} />
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
