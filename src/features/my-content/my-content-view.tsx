"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  Blocks,
  FileText,
  Search,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
  Workflow as WorkflowIcon,
} from "lucide-react";
import { PageContainer, PageHeader } from "@/components/ui/page-header";
import { Tabs } from "@/components/ui/tabs";
import { Chip, ChipRow } from "@/components/ui/chip";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { buttonClassName } from "@/components/ui/button";
import { staggerStyle } from "@/components/ui/entrance";
import { useAuth } from "@/features/auth/auth-provider";
import {
  SortSelect,
  type ContentSortKey,
} from "@/features/content/sort-select";
import { PromptCard } from "@/features/prompts/prompt-card";
import { RequestCard } from "@/features/requests/request-card";
import { GeneratorCard } from "@/features/generators/generator-card";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import { PresetCard } from "@/features/presets/preset-card";
import { ProfileDraftsPanel } from "@/features/profile/profile-drafts-panel";
import { fetchPromptsByAuthor } from "@/lib/supabase/prompts";
import { fetchRequestsByAuthor } from "@/lib/supabase/requests";
import { fetchGeneratorsByAuthor } from "@/lib/supabase/generators";
import { fetchWorkflowsByCreator } from "@/lib/supabase/workflows";
import { fetchPresetsByCreator } from "@/lib/supabase/presets";
import { useTranslation } from "@/lib/i18n/language-provider";
import type {
  Generator,
  Preset,
  Prompt,
  PromptRequest,
  Workflow,
} from "@/types";

type Kind =
  | "prompts"
  | "requests"
  | "generators"
  | "workflows"
  | "presets"
  | "drafts";
type VisibilityFilter = "all" | "public" | "private";

interface Entry {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  likeCount: number;
  /** "unlisted" generators are not private, so they count as public here. */
  isPrivate: boolean;
  node: ReactNode;
}

/**
 * "İçeriklerim" — the signed-in member's own published prompts, requests,
 * generators, workflows and presets in one place, with a visibility filter,
 * search and sort. Drafts reuse the profile's drafts panel. Data comes from
 * the same per-author fetchers the profile uses; RLS returns a member their
 * own private rows too.
 */
export function MyContentView() {
  const { t } = useTranslation();
  const { user } = useAuth();

  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [requests, setRequests] = useState<PromptRequest[]>([]);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  const [kind, setKind] = useState<Kind>("prompts");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [sort, setSort] = useState<ContentSortKey>("newest");
  const [search, setSearch] = useState("");

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    Promise.all([
      fetchPromptsByAuthor(userId),
      fetchRequestsByAuthor(userId),
      fetchGeneratorsByAuthor(userId),
      fetchWorkflowsByCreator(userId),
      fetchPresetsByCreator(userId),
    ]).then(([p, r, g, w, pr]) => {
      if (cancelled) return;
      setPrompts(p.filter((x) => x.status === "published"));
      setRequests(r);
      setGenerators(g.filter((x) => x.status === "published"));
      setWorkflows(w.filter((x) => x.status === "published"));
      setPresets(pr.filter((x) => x.status === "published"));
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  const entries = useMemo<Record<Exclude<Kind, "drafts">, Entry[]>>(
    () => ({
      prompts: prompts.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        isPrivate: p.visibility === "private",
        node: (
          <PromptCard
            prompt={p}
            onDeleted={() =>
              setPrompts((prev) => prev.filter((x) => x.id !== p.id))
            }
          />
        ),
      })),
      requests: requests.map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        createdAt: r.createdAt,
        likeCount: r.likeCount,
        isPrivate: r.visibility === "private",
        node: <RequestCard request={r} />,
      })),
      generators: generators.map((g) => ({
        id: g.id,
        title: g.title,
        description: g.description,
        createdAt: g.createdAt,
        likeCount: g.likeCount,
        isPrivate: g.visibility === "private",
        node: (
          <GeneratorCard
            generator={g}
            onDeleted={() =>
              setGenerators((prev) => prev.filter((x) => x.id !== g.id))
            }
          />
        ),
      })),
      workflows: workflows.map((w) => ({
        id: w.id,
        title: w.title,
        description: w.description,
        createdAt: w.createdAt,
        likeCount: w.likeCount,
        isPrivate: w.visibility === "private",
        node: <WorkflowCard workflow={w} />,
      })),
      presets: presets.map((p) => ({
        id: p.id,
        title: p.title,
        description: p.description,
        createdAt: p.createdAt,
        likeCount: p.likeCount,
        isPrivate: p.visibility === "private",
        node: <PresetCard preset={p} />,
      })),
    }),
    [prompts, requests, generators, workflows, presets],
  );

  const kindTabs = useMemo(
    () => [
      {
        key: "prompts" as const,
        label: t("feed.filterPrompts"),
        count: prompts.length,
        icon: SquareTerminal,
      },
      {
        key: "requests" as const,
        label: t("nav.requests"),
        count: requests.length,
        icon: Sparkles,
      },
      {
        key: "generators" as const,
        label: t("nav.generators"),
        count: generators.length,
        icon: Blocks,
      },
      {
        key: "workflows" as const,
        label: t("nav.workflows"),
        count: workflows.length,
        icon: WorkflowIcon,
      },
      {
        key: "presets" as const,
        label: t("nav.presets"),
        count: presets.length,
        icon: SlidersHorizontal,
      },
      { key: "drafts" as const, label: t("profile.tabDrafts"), icon: FileText },
    ],
    [
      t,
      prompts.length,
      requests.length,
      generators.length,
      workflows.length,
      presets.length,
    ],
  );

  const createLinks: Record<
    Exclude<Kind, "drafts">,
    { href: string; label: string }
  > = {
    prompts: { href: "/create?mode=prompt", label: t("create.promptTitle") },
    requests: { href: "/requests/new", label: t("create.requestTitle") },
    generators: {
      href: "/generators/create",
      label: t("create.generatorTitle"),
    },
    workflows: { href: "/workflows/create", label: t("workflow.create") },
    presets: { href: "/presets/create", label: t("preset.create") },
  };

  const needle = search.trim().toLocaleLowerCase("tr");
  const visible = useMemo(() => {
    if (kind === "drafts") return [];
    let list = entries[kind];
    if (visibility !== "all")
      list = list.filter((e) => e.isPrivate === (visibility === "private"));
    if (needle)
      list = list.filter((e) =>
        `${e.title} ${e.description}`.toLocaleLowerCase("tr").includes(needle),
      );
    return [...list].sort((a, b) => {
      if (sort === "most-liked") return b.likeCount - a.likeCount;
      const diff =
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      return sort === "oldest" ? diff : -diff;
    });
  }, [entries, kind, visibility, needle, sort]);

  const total = kind === "drafts" ? 0 : entries[kind].length;
  const isFiltered = visibility !== "all" || needle.length > 0;

  return (
    <PageContainer className="space-y-5">
      <PageHeader
        eyebrow={t("account.groupAccount")}
        title={t("myContent.title")}
        description={t("myContent.description")}
      />

      <Tabs
        items={kindTabs}
        active={kind}
        onChange={setKind}
        ariaLabel={t("myContent.kindsAria")}
        variant="segmented"
      />

      {kind === "drafts" ? (
        user && <ProfileDraftsPanel userId={user.id} />
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="group"
              aria-label={t("myContent.visibilityAria")}
              className="min-w-0"
            >
              <ChipRow scroll>
                <Chip
                  selected={visibility === "all"}
                  onClick={() => setVisibility("all")}
                >
                  {t("common.all")}
                </Chip>
                <Chip
                  selected={visibility === "public"}
                  onClick={() => setVisibility("public")}
                >
                  {t("visibility.public")}
                </Chip>
                <Chip
                  selected={visibility === "private"}
                  onClick={() => setVisibility("private")}
                >
                  {t("visibility.private")}
                </Chip>
              </ChipRow>
            </div>
            <div className="flex items-center gap-2">
              <label className="relative min-w-0 flex-1 sm:w-56 sm:flex-none">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted"
                />
                <input
                  type="search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t("myContent.searchPlaceholder")}
                  aria-label={t("myContent.searchPlaceholder")}
                  className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-small text-text placeholder:text-text-muted sm:h-9"
                />
              </label>
              <SortSelect value={sort} onChange={setSort} />
            </div>
          </div>

          {loading ? (
            <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
              {[0, 1, 2].map((i) => (
                <Skeleton
                  key={i}
                  className="mb-4 h-56 w-full break-inside-avoid rounded-xl"
                />
              ))}
            </div>
          ) : visible.length === 0 ? (
            total === 0 ? (
              <EmptyState
                icon={FileText}
                title={t("myContent.emptyTitle")}
                description={t("myContent.emptyBody")}
                action={createLinks[kind]}
              />
            ) : (
              <EmptyState
                icon={Search}
                title={t("myContent.noMatchTitle")}
                description={t("myContent.noMatchBody")}
                compact
              />
            )
          ) : (
            <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
              {visible.map((entry, index) => (
                <div
                  key={entry.id}
                  className="pb-3 animate-grid-in break-inside-avoid sm:pb-4"
                  style={staggerStyle(index)}
                >
                  {entry.node}
                </div>
              ))}
            </div>
          )}

          {!loading && total > 0 && !isFiltered && (
            <div className="flex justify-center">
              <Link
                href={createLinks[kind].href}
                className={buttonClassName({ variant: "outline" })}
              >
                {t("myContent.createNew")} · {createLinks[kind].label}
              </Link>
            </div>
          )}
        </>
      )}
    </PageContainer>
  );
}
