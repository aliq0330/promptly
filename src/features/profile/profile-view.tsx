"use client";

import { PageContainer } from "@/components/ui/page-header";

import { useEffect, useMemo, useState } from "react";
import { Blocks, Heart, SearchX, Sparkles, Workflow as WorkflowIcon } from "lucide-react";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, type ProfileTabKey } from "./profile-tabs";
import { ProfileToolbar, type ProfileSortKey } from "./profile-toolbar";
import { ProfileContentGrid } from "./profile-content-grid";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileAbout } from "./profile-about";
import { RequestList } from "@/features/requests/request-list";
import { CollectionsPanel } from "@/features/collections/collections-panel";
import { GeneratorCard } from "@/features/generators/generator-card";
import { useAuth } from "@/features/auth/auth-provider";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchLikedPrompts } from "@/lib/supabase/prompts";
import { fetchWorkflowsByCreator } from "@/lib/supabase/workflows";
import { WorkflowCard } from "@/features/workflows/workflow-card";
import type { Generator, Prompt, PromptContentType, PromptRequest, UserProfile, Workflow } from "@/types";

function sortPrompts(prompts: Prompt[], sort: ProfileSortKey): Prompt[] {
  const sorted = [...prompts];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "most-liked":
      return sorted.sort((a, b) => b.likeCount - a.likeCount);
    case "newest":
    default:
      return sorted.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export function ProfileView({
  user,
  isOwnProfile,
  authorPrompts: initialAuthorPrompts,
  authorRequests,
  authorGenerators: initialAuthorGenerators,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  authorPrompts: Prompt[];
  /** This profile's own real prompt requests (Prompt İstekleri) — always public, shown on every profile, not just the owner's (CLAUDE.md prompt-request module). */
  authorRequests: PromptRequest[];
  /** This profile's own real generators — RLS already limits a visitor to the owner's published+public/unlisted ones, drafts only ever coming back for the owner's own profile, so no extra client-side filter is needed. */
  authorGenerators: Generator[];
}) {
  const { t } = useTranslation();
  const { user: authUser } = useAuth();

  const [authorPrompts, setAuthorPrompts] = useState(initialAuthorPrompts);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched prompt list (a new array) replaces the previous one, e.g. navigating to a different profile
    setAuthorPrompts(initialAuthorPrompts);
  }, [initialAuthorPrompts]);

  function handleDeleted(promptId: string) {
    setAuthorPrompts((prev) => prev.filter((prompt) => prompt.id !== promptId));
  }

  const [authorGenerators, setAuthorGenerators] = useState(initialAuthorGenerators);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched generator list (a new array) replaces the previous one, e.g. navigating to a different profile
    setAuthorGenerators(initialAuthorGenerators);
  }, [initialAuthorGenerators]);

  function handleGeneratorDeleted(generatorId: string) {
    setAuthorGenerators((prev) => prev.filter((generator) => generator.id !== generatorId));
  }

  // Real likes — only ever fetched for one's own profile, and only for the
  // signed-in real viewer (RLS keeps prompt_likes' "did I like this"
  // private to its own user regardless). "Kaydedilenler" no longer has a
  // flat, separate list of its own here — it IS the collections view now
  // (CollectionsPanel, starting with the default "Genel" collection), so
  // there's nothing left to fetch/hold at this level for it (CLAUDE.md
  // Bölüm 9.22 §1 — the old "Tümü" sub-tab and its state were removed
  // structurally, not just hidden with CSS).
  const [likedPrompts, setLikedPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOwnProfile || !authUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch for someone else's profile or a signed-out viewer
      setLikedPrompts([]);
      return;
    }
    fetchLikedPrompts(authUser.id).then((prompts) => {
      if (!cancelled) setLikedPrompts(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, authUser]);

  // RLS: a visitor gets this creator's published workflows, the owner their drafts too.
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchWorkflowsByCreator(user.id).then((list) => !cancelled && setWorkflows(list));
    return () => {
      cancelled = true;
    };
  }, [user.id]);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("prompts");
  const [activeType, setActiveType] = useState<PromptContentType | "all">("all");
  const [sort, setSort] = useState<ProfileSortKey>("newest");
  const [search, setSearch] = useState("");

  const tabs = useMemo(() => {
    const base: { key: ProfileTabKey; label: string; count?: number }[] = [
      { key: "prompts", label: t("feed.filterPrompts"), count: authorPrompts.length },
      { key: "requests", label: t("nav.requests"), count: authorRequests.length },
      { key: "generators", label: t("nav.generators"), count: authorGenerators.length },
      { key: "workflows", label: t("nav.workflows"), count: workflows.length },
    ];
    if (isOwnProfile) {
      // "Kaydedilenler" has no single flat count anymore — it's a list of
      // collections now, not a list of prompts (Bölüm 9.22 §1).
      base.push({ key: "saved", label: t("profile.tabSaved") }, { key: "liked", label: t("profile.tabLiked"), count: likedPrompts.length });
    }
    base.push({ key: "about", label: t("profile.tabAbout") });
    return base;
  }, [authorPrompts.length, authorRequests.length, authorGenerators.length, workflows.length, isOwnProfile, likedPrompts.length, t]);

  const activeSource = useMemo(() => {
    switch (activeTab) {
      case "liked":
        return likedPrompts;
      case "prompts":
      default:
        return authorPrompts;
    }
  }, [activeTab, authorPrompts, likedPrompts]);

  const availableTypes = useMemo(() => {
    const types = new Set<PromptContentType>();
    activeSource.forEach((prompt) => types.add(prompt.contentType));
    return Array.from(types);
  }, [activeSource]);

  const normalizedSearch = search.trim().toLocaleLowerCase("tr");

  const filtered = useMemo(() => {
    let items = activeSource;
    if (activeType !== "all") {
      items = items.filter((prompt) => prompt.contentType === activeType);
    }
    if (normalizedSearch) {
      items = items.filter(
        (prompt) =>
          prompt.title.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.description.toLocaleLowerCase("tr").includes(normalizedSearch) ||
          prompt.tags.some((tag) => tag.label.toLocaleLowerCase("tr").includes(normalizedSearch)),
      );
    }
    return sortPrompts(items, sort);
  }, [activeSource, activeType, normalizedSearch, sort]);

  const hasActiveFilters = activeType !== "all" || normalizedSearch.length > 0;

  function clearFilters() {
    setActiveType("all");
    setSearch("");
  }

  return (
    <PageContainer className="space-y-5">
      <ProfileHeader
        user={user}
        isOwnProfile={isOwnProfile}
        publishedPromptCount={authorPrompts.length}
        onSelectPrompts={() => setActiveTab("prompts")}
      />

      <ProfileTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="space-y-4">
        {activeTab === "about" ? (
          <ProfileAbout user={user} />
        ) : activeTab === "requests" ? (
          authorRequests.length === 0 ? (
            <ProfileEmptyState
              icon={Sparkles}
              title={t("profile.noRequestsYetTitle")}
              description={
                isOwnProfile
                  ? t("profile.noRequestsYetOwnBody")
                  : t("profile.noRequestsYetOtherBody")
              }
              action={isOwnProfile ? { label: t("create.requestTitle"), href: "/requests/new" } : undefined}
            />
          ) : (
            <RequestList requests={authorRequests} />
          )
        ) : activeTab === "generators" ? (
          authorGenerators.length === 0 ? (
            <ProfileEmptyState
              icon={Blocks}
              title={t("profile.noGeneratorsYetTitle")}
              description={
                isOwnProfile
                  ? t("profile.noGeneratorsYetOwnBody")
                  : t("profile.noGeneratorsYetOtherBody")
              }
              action={isOwnProfile ? { label: t("create.generatorTitle"), href: "/generators/create" } : undefined}
            />
          ) : (
            <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
              {authorGenerators.map((generator) => (
                <div key={generator.id} className="mb-3 break-inside-avoid sm:mb-4">
                  <GeneratorCard generator={generator} onDeleted={() => handleGeneratorDeleted(generator.id)} />
                </div>
              ))}
            </div>
          )
        ) : activeTab === "workflows" ? (
          workflows.length === 0 ? (
            <ProfileEmptyState
              icon={WorkflowIcon}
              title={t("workflow.noneYetTitle")}
              description={isOwnProfile ? t("workflow.noneYetBody") : t("workflow.noneYetOtherBody")}
              action={isOwnProfile ? { label: t("workflow.create"), href: "/workflows/create" } : undefined}
            />
          ) : (
            <div className="columns-1 gap-3 sm:columns-2 sm:gap-4 xl:columns-3">
              {workflows.map((workflow) => (
                <div key={workflow.id} className="mb-3 break-inside-avoid sm:mb-4">
                  <WorkflowCard workflow={workflow} />
                </div>
              ))}
            </div>
          )
        ) : activeTab === "saved" ? (
          // No more separate flat "Tümü" list here — Kaydedilenler IS the
          // collections view now, "Genel" (the default, general-save
          // bucket) always shown first (CLAUDE.md Bölüm 9.22 §1). Removed
          // structurally, not hidden: no sub-tab state, no filter/sort
          // toolbar, no second data source for this tab anymore.
          <CollectionsPanel ownerId={user.id} ownerProfile={user} />
        ) : (
          <>
            {activeSource.length > 0 && (
              <ProfileToolbar
                availableTypes={availableTypes}
                activeType={activeType}
                onTypeChange={setActiveType}
                sort={sort}
                onSortChange={setSort}
                search={search}
                onSearchChange={setSearch}
                showSearch={activeSource.length > 8}
                hasActiveFilters={hasActiveFilters}
                onClear={clearFilters}
              />
            )}

            <ProfileContentGrid
              prompts={filtered}
              isOwnProfile={isOwnProfile && activeTab === "prompts"}
              onDeleted={handleDeleted}
              emptyState={
                hasActiveFilters ? (
                  <ProfileEmptyState
                    icon={SearchX}
                    title={t("profile.noMatchForFilterTitle")}
                    description={t("profile.noMatchForFilterBody")}
                  />
                ) : (
                  <TabEmptyState tab={activeTab} isOwnProfile={isOwnProfile} />
                )
              }
            />
          </>
        )}
      </div>
    </PageContainer>
  );
}

function TabEmptyState({ tab, isOwnProfile }: { tab: ProfileTabKey; isOwnProfile: boolean }) {
  const { t } = useTranslation();
  if (tab === "liked") {
    return (
      <ProfileEmptyState
        icon={Heart}
        title={t("profile.likedPromptsHereTitle")}
        description={t("profile.likedPromptsHereBody")}
        action={{ label: t("profile.explorePrompts"), href: "/discover" }}
      />
    );
  }
  return (
    <ProfileEmptyState
      icon={Sparkles}
      title={t("profile.creativeJourneyStartsHereTitle")}
      description={t("profile.creativeJourneyStartsHereBody")}
      action={isOwnProfile ? { label: t("create.promptTitle"), href: "/create" } : undefined}
    />
  );
}
