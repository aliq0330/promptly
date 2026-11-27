"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowRight } from "@/components/icons/arrow-right";
import { Heart } from "@/components/icons/heart";
import { Trophy } from "@/components/icons/trophy";
import { TrendingUp } from "@/components/icons/trending-up";
import { Avatar } from "@/components/ui/avatar";
import { ScrollRow } from "@/components/ui/scroll-row";
import { ContentRowSmall } from "@/features/content/content-row";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { CreatorCard } from "@/features/profile/creator-card";
import { ToolLogo } from "@/features/content/tool-logo";
import { useAuth } from "@/features/auth/auth-provider";
import { useNearViewportOnce } from "./use-near-viewport";
import { findTool } from "@/lib/ai-tool-catalog";
import { EMPTY_TAXONOMY_FILTER } from "@/lib/content-taxonomy";
import { readSnapshot, writeSnapshot } from "@/lib/feed-snapshot";
import { useTranslation } from "@/lib/i18n/language-provider";
import { SKILLS_MENU_ENABLED } from "@/lib/skills/flag";
import { supabase } from "@/lib/supabase/client";
import { fetchFeedPage, hydrateFeedRows, type FeedEntry, type FeedKind, type FeedRow } from "@/lib/supabase/feed";
import { fetchPromptsByIds, fetchTopPrompts } from "@/lib/supabase/prompts";
import { fetchCreatorsPage } from "@/lib/supabase/profiles";
import { fetchRecentSkills } from "@/lib/supabase/skills";
import { cn, formatCount, promptHref, tagHref, toolHref } from "@/lib/utils";
import type { Prompt, UserProfile } from "@/types";
import { CompactCards } from "@/features/content/content-card";
import { FeedItemCard } from "./feed-grid";

/**
 * Keşfet'in editoryal açılışı (docs/history/451-*, "Tümü" bölümü): dergi düzeni. Gündemdeki konular (büyüme yüzdesiyle), popüler promptlar
 * (haftanın promptu büyük kapak), metin/ses/video, workflow'lar ve açık istekler, yaratıcılar, yükselen araçlar (8 haftalık çizgi),
 * Skill'ler. Hepsi gerçek satırlardan; boş bölüm çizilmez (yer tutucu yok).
 *
 * Yükleme (docs/history/466-*; önceden 12 paralel istek + her şerit için ayrı doldurma sorgusu, küçük sunucuda soğuk bağlantı dalgası):
 *   1. dalga (ekranın üstü): gündem (`discover_trending_topics`) + şeritlerin hepsi TEK RPC'de (`discover_editorial_feed`: aynı `feed_page` /
 *      `feed_page_proven` çağrıları, tek bağlantıda) + popüler promptlar (önce son 7 gün; ancak zayıfsa son 30 gün — sonuç eskisiyle aynı).
 *      Şeritlerin satırları ve konu kapakları TEK doldurma turunda okunur (tür başına bir sorgu).
 *   2. dalga (yaratıcılar, yükselen araçlar, Skill'ler) yalnız o bölümler görünür alana yaklaşınca.
 * Son sonuç bu cihazda saklanır (`feed-snapshot`): Keşfet önce onunla açılır, gerçeği arkadan gelir. 3 dk modül önbelleği (Geri'de yeniden yükleme yok).
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
interface EditorialTop {
  topics: Topic[];
  weekPrompt: Prompt | null;
  popular: Prompt[];
  media: FeedEntry[];
  workflows: FeedEntry[];
  requests: FeedEntry[];
}
interface EditorialExtra {
  tools: RisingTool[];
  skills: FeedEntry[];
  creators: UserProfile[];
}

const DAY_MS = 24 * 60 * 60 * 1000;
const TTL_MS = 3 * 60 * 1000;
const SNAPSHOT_KEY = "discover-editorial";
const EMPTY_TOP: EditorialTop = { topics: [], weekPrompt: null, popular: [], media: [], workflows: [], requests: [] };
const EMPTY_EXTRA: EditorialExtra = { tools: [], skills: [], creators: [] };

/** Modül önbelleği: kişi başına (çıkış/giriş sayfayı baştan yükler, CLAUDE.md §10). */
let cache: { owner: string; top: EditorialTop | null; topAt: number; extra: EditorialExtra | null; extraAt: number } | null = null;

async function safe<T>(promise: PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await promise;
  } catch {
    return fallback;
  }
}

type SectionKey = "proven" | "text" | "audio" | "video" | "workflow" | "request";
const SECTION_KEYS: SectionKey[] = ["proven", "text", "audio", "video", "workflow", "request"];

/** Şerit satırları (henüz doldurulmamış): tek RPC; veritabanında işlev yoksa (migration henüz uygulanmadı) eski altı çağrıya düşer. */
async function loadSectionRows(): Promise<Record<SectionKey, FeedRow[]> | null> {
  const { data, error } = await supabase.rpc("discover_editorial_feed");
  if (error) {
    if (error.code === "PGRST202") return null;
    throw error;
  }
  const out = Object.fromEntries(SECTION_KEYS.map((key) => [key, [] as FeedRow[]])) as Record<SectionKey, FeedRow[]>;
  const rows = (Array.isArray(data) ? data : []) as { section: SectionKey; pos: number; kind: FeedKind; id: string; created_at: string; sort_rank: number }[];
  for (const row of [...rows].sort((a, b) => a.pos - b.pos)) {
    if (out[row.section]) out[row.section].push({ kind: row.kind, id: row.id, created_at: row.created_at, sort_rank: row.sort_rank });
  }
  return out;
}

const legacyPage = (kind: FeedEntry["kind"], limit: number, extra: { contentType?: "text" | "audio" | "video"; openOnly?: boolean } = {}) =>
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

/** Şeritler + konu kapakları, doldurulmuş: tek RPC + tek doldurma turu (ya da eski yol). */
async function loadSections(coverIds: string[]): Promise<{ sections: Record<SectionKey, FeedEntry[]>; covers: Map<string, Prompt> }> {
  const rows = await safe(loadSectionRows(), null);
  if (rows) {
    const coverRows: FeedRow[] = coverIds.map((id) => ({ kind: "prompt", id, created_at: "", sort_rank: 0 }));
    const all = [...SECTION_KEYS.flatMap((key) => rows[key]), ...coverRows];
    const hydrated = await safe(hydrateFeedRows(all), [] as FeedEntry[]);
    const byKey = new Map(hydrated.map((entry) => [`${entry.kind}-${entry.data.id}`, entry]));
    const pick = (list: FeedRow[]) => list.flatMap((row) => byKey.get(`${row.kind}-${row.id}`) ?? []);
    const sections = Object.fromEntries(SECTION_KEYS.map((key) => [key, pick(rows[key])])) as Record<SectionKey, FeedEntry[]>;
    const covers = new Map<string, Prompt>();
    for (const id of coverIds) {
      const entry = byKey.get(`prompt-${id}`);
      if (entry?.kind === "prompt") covers.set(id, entry.data);
    }
    return { sections, covers };
  }
  const [proven, text, audio, video, workflow, request, coverPrompts] = await Promise.all([
    safe(fetchFeedPage({ scope: "all", order: "proven", kind: "prompt", taxonomy: EMPTY_TAXONOMY_FILTER, limit: 1 }).then((result) => result.items), [] as FeedEntry[]),
    legacyPage("prompt", 2, { contentType: "text" }),
    legacyPage("prompt", 1, { contentType: "audio" }),
    legacyPage("prompt", 1, { contentType: "video" }),
    legacyPage("workflow", 1),
    legacyPage("request", 2, { openOnly: true }),
    safe(fetchPromptsByIds(coverIds), [] as Prompt[]),
  ]);
  return { sections: { proven, text, audio, video, workflow, request }, covers: new Map(coverPrompts.map((prompt) => [prompt.id, prompt])) };
}

async function loadTop(): Promise<EditorialTop> {
  const [topicRows, lastWeek] = await Promise.all([
    safe(
      supabase.rpc("discover_trending_topics", { p_limit: 8 }).then(({ data, error }) => {
        if (error) throw error;
        return (Array.isArray(data) ? data : []) as { slug: string; label: string; recent_count: number; previous_count: number; cover_prompt_id: string | null }[];
      }),
      [],
    ),
    safe(fetchTopPrompts({ since: new Date(Date.now() - 7 * DAY_MS).toISOString(), limit: 12 }), [] as Prompt[]),
  ]);
  // "Popüler": son 7 günün en beğenilen herkese açık promptları; hafta zayıfsa (görselli < 3) son 30 gün — eskiden ikisi birden istenirdi, sonuç aynı.
  const coverIds = [...new Set(topicRows.map((row) => row.cover_prompt_id).filter((id): id is string => Boolean(id)))];
  const [week, { sections, covers }] = await Promise.all([
    lastWeek.filter((prompt) => prompt.media.length > 0).length >= 3
      ? Promise.resolve(lastWeek)
      : safe(fetchTopPrompts({ since: new Date(Date.now() - 30 * DAY_MS).toISOString(), limit: 12 }), [] as Prompt[]),
    loadSections(coverIds),
  ]);
  const weekPrompt = sections.proven[0]?.kind === "prompt" ? sections.proven[0].data : null;
  const popular = week.filter((prompt) => prompt.id !== weekPrompt?.id && prompt.media.length > 0);
  return {
    topics: topicRows.map((row) => ({
      slug: row.slug,
      label: row.label,
      recent: row.recent_count,
      previous: row.previous_count,
      cover: row.cover_prompt_id ? (covers.get(row.cover_prompt_id) ?? null) : null,
    })),
    weekPrompt: weekPrompt ?? popular[0] ?? null,
    popular: weekPrompt ? popular.slice(0, 7) : popular.slice(1, 8),
    media: [...sections.text, ...sections.audio, ...sections.video],
    workflows: sections.workflow,
    requests: sections.request,
  };
}

async function loadExtra(): Promise<EditorialExtra> {
  const [toolRows, skills, creators] = await Promise.all([
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
  const sampleIds = [...new Set(toolRows.flatMap((row) => row.sample_ids))];
  const samples = await safe(fetchPromptsByIds(sampleIds), [] as Prompt[]);
  const byId = new Map(samples.map((prompt) => [prompt.id, prompt]));
  return {
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

interface SavedEditorial {
  top: EditorialTop | null;
  extra: EditorialExtra | null;
}

const isFresh = (at: number) => Date.now() - at < TTL_MS;

/** Modül önbelleğine yazar ve iki parçayı birlikte cihaza kaydeder. */
function remember(owner: string, next: Partial<SavedEditorial>) {
  const base = cache?.owner === owner ? cache : { owner, top: null, topAt: 0, extra: null, extraAt: 0 };
  cache = {
    ...base,
    ...(next.top ? { top: next.top, topAt: Date.now() } : {}),
    ...(next.extra ? { extra: next.extra, extraAt: Date.now() } : {}),
  };
  writeSnapshot<SavedEditorial>(owner, SNAPSHOT_KEY, { top: cache.top, extra: cache.extra });
}

/** Önce modül önbelleği, yoksa bu cihazdaki son kopya (anında); sonra ağ. */
function initial<K extends keyof SavedEditorial>(owner: string, part: K): SavedEditorial[K] | null {
  if (cache?.owner === owner && cache[part]) return cache[part];
  return readSnapshot<SavedEditorial>(owner, SNAPSHOT_KEY)?.data[part] ?? null;
}

/** 1. dalga: gündem, popüler, şeritler. */
function useEditorialTop(): EditorialTop | null {
  const { user } = useAuth();
  const owner = user?.id ?? "guest";
  const [top, setTop] = useState<EditorialTop | null>(() => initial(owner, "top"));
  useEffect(() => {
    if (cache?.owner === owner && cache.top && isFresh(cache.topAt)) return;
    let cancelled = false;
    void loadTop()
      .catch((): EditorialTop => EMPTY_TOP)
      .then((loaded) => {
        remember(owner, { top: loaded });
        if (!cancelled) setTop(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [owner]);
  return top;
}

/** 2. dalga (yaratıcılar, yükselen araçlar, Skill'ler): yalnız `want` olunca (bölüm görünür alana yaklaşınca) yüklenir. */
function useEditorialExtra(want: boolean): EditorialExtra | null {
  const { user } = useAuth();
  const owner = user?.id ?? "guest";
  const [extra, setExtra] = useState<EditorialExtra | null>(() => initial(owner, "extra"));
  useEffect(() => {
    if (!want) return;
    if (cache?.owner === owner && cache.extra && isFresh(cache.extraAt)) return;
    let cancelled = false;
    void loadExtra()
      .catch((): EditorialExtra => EMPTY_EXTRA)
      .then((loaded) => {
        remember(owner, { extra: loaded });
        if (!cancelled) setExtra(loaded);
      });
    return () => {
      cancelled = true;
    };
  }, [want, owner]);
  return extra;
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
        <h2 className="font-display text-h1 font-bold text-text">{title}</h2>
        <p className="text-small text-text-muted">{hint}</p>
      </div>
      {href ? (
        <Link href={href} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary-text hover:text-primary-hover">
          {more}
        </Link>
      ) : onSeeAll ? (
        <button type="button" onClick={onSeeAll} className="inline-flex items-center gap-1.5 text-small font-semibold text-primary-text hover:text-primary-hover">
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
  const data = useEditorialTop();

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
          <div className="grid gap-6 lg:grid-cols-2">
            <ArtTile href={promptHref(data.weekPrompt)} prompt={data.weekPrompt} className="min-h-72 p-6 lg:min-h-[26rem]">
              <span className="flex items-center gap-1.5 text-caption font-semibold text-on-art-muted">
                <Trophy size={12} aria-hidden />
                {t("discover.ed.weekPrompt")}
              </span>
              <span className="font-display text-display font-extrabold leading-none">{data.weekPrompt.title}</span>
              <span className="mt-2 flex items-center gap-2 text-small">
                <Avatar src={data.weekPrompt.author.avatarUrl} alt="" size={28} />
                <span className="font-semibold">{data.weekPrompt.author.displayName}</span>
                <span className="ml-auto inline-flex items-center gap-1 text-on-art-muted">
                  <Heart size={16} aria-hidden />
                  {formatCount(data.weekPrompt.likeCount)}
                </span>
              </span>
            </ArtTile>
            {/* Sıralı liste (docs/history/477-*, "D · Yatay satır"): numara + orta boyut satır; ilk üç numara marka renginde. */}
            <ol className="content-start" data-discover-ranking="">
              {data.popular.slice(0, 6).map((prompt, index) => (
                <li key={prompt.id} className="grid grid-cols-[2rem_minmax(0,1fr)] items-center gap-3 border-b border-border last:border-b-0">
                  <span className={cn("text-center font-serif text-h2 font-bold tabular-nums", index < 3 ? "text-primary-text" : "text-text-muted")}>{index + 1}</span>
                  <ContentRowSmall
                    href={promptHref(prompt)}
                    type="prompt"
                    image={prompt.media[0]?.url ?? null}
                    title={prompt.title}
                    meta={prompt.author.displayName}
                    trailing={
                      <span className="inline-flex shrink-0 items-center gap-1 text-caption font-semibold tabular-nums text-text-muted">
                        <Heart size={12} aria-hidden />
                        {formatCount(prompt.likeCount)}
                      </span>
                    }
                  />
                </li>
              ))}
            </ol>
          </div>
        </Section>
      )}

      {data.media.length > 0 && (
        <Section label={t("discover.ed.media")}>
          <SectionHead title={t("discover.ed.media")} hint={t("discover.ed.mediaHint")} />
          <CompactCards>
            <ScrollRow className="items-start gap-4" data-discover-strip="media">
              {data.media.map((item) => (
                <div key={`${item.kind}-${item.data.id}`} className="w-58 shrink-0">
                  <FeedItemCard item={item} />
                </div>
              ))}
            </ScrollRow>
          </CompactCards>
        </Section>
      )}

      {(data.workflows.length > 0 || data.requests.length > 0) && (
        <Section label={t("discover.ed.workflows")}>
          <SectionHead title={t("discover.ed.workflows")} hint={t("discover.ed.workflowsHint")} />
          <CompactCards>
            <ScrollRow className="items-start gap-4" data-discover-strip="workflows">
              {[...data.workflows, ...data.requests].map((item) => (
                <div key={`${item.kind}-${item.data.id}`} className="w-58 shrink-0">
                  <FeedItemCard item={item} />
                </div>
              ))}
            </ScrollRow>
          </CompactCards>
        </Section>
      )}

      <EditorialExtraSections onSeeAllCreators={onSeeAllCreators} />
    </div>
  );
}

/**
 * 2. dalga (docs/history/466-*): yaratıcılar, yükselen araçlar, Skill'ler — yalnız bu bölüm görünür alana yaklaşınca (800 px önce) yüklenir.
 * Gözlenen kap bileşenle birlikte bağlanır (gözlemci ilk çizimde öğeyi bulur); veri gelene kadar boş, bölümler yer tutucu çizmez.
 */
function EditorialExtraSections({ onSeeAllCreators }: { onSeeAllCreators: () => void }) {
  const { t } = useTranslation();
  const [ref, near] = useNearViewportOnce<HTMLDivElement>("800px");
  const data = useEditorialExtra(near);
  return (
    <div ref={ref} className="space-y-12" data-discover-editorial-extra="">
      {/* Veri gelene kadar yaratıcı şeridi boyunda iskelet (gözlemciyi beklemeden): içerik gelince altındaki liste yerinden zıplamasın. */}
      {!data && (
        <div className="flex flex-col gap-4" aria-busy="true" aria-label={t("common.loadingAriaLabel")}>
          <span className="skeleton-shimmer h-10 w-56 rounded-md" />
          <div className="flex gap-4 overflow-hidden">
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className="skeleton-shimmer h-44 w-64 shrink-0 rounded-lg" />
            ))}
          </div>
        </div>
      )}
      {data && (
        <>
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
              <CompactCards>
                <ScrollRow className="items-start gap-4" data-discover-strip="skills">
                  {data.skills.map((item) => (
                    <div key={`${item.kind}-${item.data.id}`} className="w-58 shrink-0">
                      <FeedItemCard item={item} />
                    </div>
                  ))}
                </ScrollRow>
              </CompactCards>
            </Section>
          )}
        </>
      )}
    </div>
  );
}
