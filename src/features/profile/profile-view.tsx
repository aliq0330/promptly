"use client";

import { useEffect, useMemo, useState } from "react";
import { Blocks, GitBranch, Heart, SearchX, Sparkles } from "lucide-react";
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
import { fetchLikedPrompts } from "@/lib/supabase/prompts";
import type { Generator, Prompt, PromptContentType, PromptRequest, UserProfile } from "@/types";

function sortPrompts(prompts: Prompt[], sort: ProfileSortKey): Prompt[] {
  const sorted = [...prompts];
  switch (sort) {
    case "oldest":
      return sorted.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case "most-liked":
      return sorted.sort((a, b) => b.likeCount - a.likeCount);
    case "most-remixed":
      return sorted.sort((a, b) => b.remixCount - a.remixCount);
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
  authorGenerators,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  authorPrompts: Prompt[];
  /** This profile's own real prompt requests (Prompt İstekleri) — always public, shown on every profile, not just the owner's (CLAUDE.md prompt-request module). */
  authorRequests: PromptRequest[];
  /** This profile's own real generators — RLS already limits a visitor to the owner's published+public/unlisted ones, drafts only ever coming back for the owner's own profile, so no extra client-side filter is needed. */
  authorGenerators: Generator[];
}) {
  const { user: authUser } = useAuth();

  const [authorPrompts, setAuthorPrompts] = useState(initialAuthorPrompts);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs when a freshly-fetched prompt list (a new array) replaces the previous one, e.g. navigating to a different profile
    setAuthorPrompts(initialAuthorPrompts);
  }, [initialAuthorPrompts]);

  function handleDeleted(promptId: string) {
    setAuthorPrompts((prev) => prev.filter((prompt) => prompt.id !== promptId));
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

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("prompts");
  const [activeType, setActiveType] = useState<PromptContentType | "all">("all");
  const [sort, setSort] = useState<ProfileSortKey>("newest");
  const [search, setSearch] = useState("");

  const remixPrompts = useMemo(
    () => authorPrompts.filter((prompt) => prompt.origin.type !== "original"),
    [authorPrompts],
  );

  const tabs = useMemo(() => {
    const base: { key: ProfileTabKey; label: string; count?: number }[] = [
      { key: "prompts", label: "Promptlar", count: authorPrompts.length },
      { key: "remixes", label: "Türetilen promptlar", count: remixPrompts.length },
      { key: "requests", label: "Prompt İstekleri", count: authorRequests.length },
      { key: "generators", label: "Generatorlar", count: authorGenerators.length },
    ];
    if (isOwnProfile) {
      // "Kaydedilenler" has no single flat count anymore — it's a list of
      // collections now, not a list of prompts (Bölüm 9.22 §1).
      base.push({ key: "saved", label: "Kaydedilenler" }, { key: "liked", label: "Beğeniler", count: likedPrompts.length });
    }
    base.push({ key: "about", label: "Hakkında" });
    return base;
  }, [authorPrompts.length, remixPrompts.length, authorRequests.length, authorGenerators.length, isOwnProfile, likedPrompts.length]);

  const activeSource = useMemo(() => {
    switch (activeTab) {
      case "remixes":
        return remixPrompts;
      case "liked":
        return likedPrompts;
      case "prompts":
      default:
        return authorPrompts;
    }
  }, [activeTab, authorPrompts, remixPrompts, likedPrompts]);

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
    <div className="space-y-5 pb-6">
      <ProfileHeader
        user={user}
        isOwnProfile={isOwnProfile}
        publishedPromptCount={authorPrompts.length}
        remixCount={remixPrompts.length}
        onSelectPrompts={() => setActiveTab("prompts")}
        onSelectRemixes={() => setActiveTab("remixes")}
      />

      <ProfileTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="space-y-4 px-4 lg:px-6">
        {activeTab === "about" ? (
          <ProfileAbout user={user} />
        ) : activeTab === "requests" ? (
          authorRequests.length === 0 ? (
            <ProfileEmptyState
              icon={Sparkles}
              title="Henüz prompt isteği oluşturulmamış."
              description={
                isOwnProfile
                  ? "Topluluktan bir prompt istemek için yeni bir istek oluşturabilirsin."
                  : "Bu kullanıcı henüz bir prompt isteği oluşturmadı."
              }
              action={isOwnProfile ? { label: "İstek oluştur", href: "/requests/new" } : undefined}
            />
          ) : (
            <RequestList requests={authorRequests} />
          )
        ) : activeTab === "generators" ? (
          authorGenerators.length === 0 ? (
            <ProfileEmptyState
              icon={Blocks}
              title="Henüz bir generator oluşturulmamış."
              description={
                isOwnProfile
                  ? "Kendi prompt generatorunu oluşturup başkalarının kullanmasına açabilirsin."
                  : "Bu kullanıcı henüz bir generator yayınlamadı."
              }
              action={isOwnProfile ? { label: "Generator oluştur", href: "/generators/create" } : undefined}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {authorGenerators.map((generator) => (
                <GeneratorCard key={generator.id} generator={generator} />
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
              isOwnProfile={isOwnProfile && (activeTab === "prompts" || activeTab === "remixes")}
              onDeleted={handleDeleted}
              emptyState={
                hasActiveFilters ? (
                  <ProfileEmptyState
                    icon={SearchX}
                    title="Bu filtreye uygun içerik bulunamadı"
                    description="Başka bir içerik türü veya sıralama seçmeyi dene."
                  />
                ) : (
                  <TabEmptyState tab={activeTab} isOwnProfile={isOwnProfile} />
                )
              }
            />
          </>
        )}
      </div>
    </div>
  );
}

function TabEmptyState({ tab, isOwnProfile }: { tab: ProfileTabKey; isOwnProfile: boolean }) {
  if (tab === "remixes") {
    return (
      <ProfileEmptyState
        icon={GitBranch}
        title="İlk türettiğin promptu oluştur"
        description="Başka bir prompttan ilham al ve kendi yorumunu kat."
        action={{ label: "Keşfet", href: "/discover" }}
      />
    );
  }
  if (tab === "liked") {
    return (
      <ProfileEmptyState
        icon={Heart}
        title="Beğendiğin promptlar burada"
        description="Beğendiğin promptlar burada listelenir."
        action={{ label: "Promptları keşfet", href: "/discover" }}
      />
    );
  }
  return (
    <ProfileEmptyState
      icon={Sparkles}
      title="Yaratıcı yolculuğun burada başlıyor"
      description="İlk promptunu oluştur ve galerini keşfedilmeye aç."
      action={isOwnProfile ? { label: "Prompt oluştur", href: "/create" } : undefined}
    />
  );
}
