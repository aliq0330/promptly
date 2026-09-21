"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, GitBranch, Heart, SearchX, Sparkles } from "lucide-react";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, type ProfileTabKey } from "./profile-tabs";
import { ProfileToolbar, type ProfileSortKey } from "./profile-toolbar";
import { ProfileContentGrid } from "./profile-content-grid";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileAbout } from "./profile-about";
import { RequestList } from "@/features/requests/request-list";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchLikedPrompts, fetchSavedPrompts } from "@/lib/supabase/prompts";
import type { Prompt, PromptContentType, PromptRequest, UserProfile } from "@/types";

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
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  authorPrompts: Prompt[];
  /** This profile's own real prompt requests (Prompt İstekleri) — always public, shown on every profile, not just the owner's (CLAUDE.md prompt-request module). */
  authorRequests: PromptRequest[];
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

  // Real likes/saves — only ever fetched for one's own profile, and only
  // for the signed-in real viewer (RLS keeps prompt_saves private to its
  // own user regardless).
  const [savedPrompts, setSavedPrompts] = useState<Prompt[]>([]);
  const [likedPrompts, setLikedPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOwnProfile || !authUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch for someone else's profile or a signed-out viewer
      setSavedPrompts([]);
      setLikedPrompts([]);
      return;
    }
    fetchSavedPrompts(authUser.id).then((prompts) => {
      if (!cancelled) setSavedPrompts(prompts);
    });
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
    ];
    if (isOwnProfile) {
      base.push(
        { key: "saved", label: "Kaydedilenler", count: savedPrompts.length },
        { key: "liked", label: "Beğeniler", count: likedPrompts.length },
      );
    }
    base.push({ key: "about", label: "Hakkında" });
    return base;
  }, [authorPrompts.length, remixPrompts.length, authorRequests.length, isOwnProfile, savedPrompts.length, likedPrompts.length]);

  const activeSource = useMemo(() => {
    switch (activeTab) {
      case "remixes":
        return remixPrompts;
      case "saved":
        return savedPrompts;
      case "liked":
        return likedPrompts;
      case "prompts":
      default:
        return authorPrompts;
    }
  }, [activeTab, authorPrompts, remixPrompts, savedPrompts, likedPrompts]);

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
  if (tab === "saved") {
    return (
      <ProfileEmptyState
        icon={Bookmark}
        title="Kaydettiğin promptlar burada"
        description="İlham veren promptları kaydederek daha sonra kolayca bulabilirsin."
        action={{ label: "Promptları keşfet", href: "/discover" }}
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
