"use client";

import { useEffect, useMemo, useState } from "react";
import { Bookmark, Heart, Repeat2, SearchX, Sparkles } from "lucide-react";
import { ProfileHeader } from "./profile-header";
import { ProfileTabs, type ProfileTabKey } from "./profile-tabs";
import { ProfileToolbar, type ProfileSortKey } from "./profile-toolbar";
import { ProfileContentGrid } from "./profile-content-grid";
import { ProfileEmptyState } from "./profile-empty-state";
import { ProfileAbout } from "./profile-about";
import { useProfileOverrides } from "./profile-overrides-provider";
import { useHiddenPrompts } from "@/features/prompts/hidden-prompts-provider";
import { useLike, useSave } from "@/features/prompts/like-save-provider";
import { useLocalPrompts } from "@/features/prompts/local-prompts-provider";
import { useAuth } from "@/features/auth/auth-provider";
import { fetchLikedPrompts, fetchSavedPrompts } from "@/lib/supabase/prompts";
import { mockPrompts } from "@/mocks/prompts";
import type { Prompt, PromptContentType, UserProfile } from "@/types";

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
  user: baseUser,
  isOwnProfile,
  authorPrompts: mockAuthorPrompts,
  conversationId,
}: {
  user: UserProfile;
  isOwnProfile: boolean;
  authorPrompts: Prompt[];
  conversationId?: string;
}) {
  const { applyOverrides } = useProfileOverrides();
  const { isHidden, hidePrompt, unhidePrompt } = useHiddenPrompts();
  const { isLiked } = useLike();
  const { isSaved } = useSave();
  const { localPrompts, getByAuthor } = useLocalPrompts();
  const { user: authUser } = useAuth();

  const user = isOwnProfile ? applyOverrides(baseUser) : baseUser;

  // Real likes/saves (a real prompt liked/saved by a real signed-in user,
  // CLAUDE.md Bölüm 21 Faz 3) live in Supabase, not localStorage — only
  // ever fetched for one's own profile, and only for the signed-in real
  // viewer (RLS keeps prompt_saves private to its own user regardless).
  const [realSavedPrompts, setRealSavedPrompts] = useState<Prompt[]>([]);
  const [realLikedPrompts, setRealLikedPrompts] = useState<Prompt[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!isOwnProfile || !authUser) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- nothing to fetch for someone else's profile or a signed-out viewer
      setRealSavedPrompts([]);
      setRealLikedPrompts([]);
      return;
    }
    fetchSavedPrompts(authUser.id).then((prompts) => {
      if (!cancelled) setRealSavedPrompts(prompts);
    });
    fetchLikedPrompts(authUser.id).then((prompts) => {
      if (!cancelled) setRealLikedPrompts(prompts);
    });
    return () => {
      cancelled = true;
    };
  }, [isOwnProfile, authUser]);

  const [activeTab, setActiveTab] = useState<ProfileTabKey>("prompts");
  const [activeType, setActiveType] = useState<PromptContentType | "all">("all");
  const [sort, setSort] = useState<ProfileSortKey>("newest");
  const [search, setSearch] = useState("");
  const [showHidden, setShowHidden] = useState(false);

  // Locally-created prompts (request answers, see local-prompts-provider.tsx)
  // only ever belong to "me", so only the owner's own profile ever needs to
  // merge them in — sorted newest-first, matching the server-side sort.
  const authorPrompts = useMemo(() => {
    if (!isOwnProfile) return mockAuthorPrompts;
    return [...mockAuthorPrompts, ...getByAuthor(user.id)].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [isOwnProfile, mockAuthorPrompts, getByAuthor, user.id]);

  const remixPrompts = useMemo(
    () => authorPrompts.filter((prompt) => prompt.origin.type !== "original"),
    [authorPrompts],
  );
  const allKnownPrompts = useMemo(() => [...mockPrompts, ...localPrompts], [localPrompts]);
  const savedPrompts = useMemo(
    () => [...realSavedPrompts, ...allKnownPrompts.filter((prompt) => isSaved(prompt.id))],
    [realSavedPrompts, allKnownPrompts, isSaved],
  );
  const likedPrompts = useMemo(
    () => [...realLikedPrompts, ...allKnownPrompts.filter((prompt) => isLiked(prompt.id))],
    [realLikedPrompts, allKnownPrompts, isLiked],
  );

  const tabs = useMemo(() => {
    const base: { key: ProfileTabKey; label: string; count?: number }[] = [
      { key: "prompts", label: "Promptlar", count: authorPrompts.length },
      { key: "remixes", label: "Remixler", count: remixPrompts.length },
    ];
    if (isOwnProfile) {
      base.push(
        { key: "saved", label: "Kaydedilenler", count: savedPrompts.length },
        { key: "liked", label: "Beğeniler", count: likedPrompts.length },
      );
    }
    base.push({ key: "about", label: "Hakkında" });
    return base;
  }, [authorPrompts.length, remixPrompts.length, isOwnProfile, savedPrompts.length, likedPrompts.length]);

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

  // Hidden prompts only ever apply to browsing your own gallery (hiding
  // someone else's content from view is not something a viewer of their
  // profile can meaningfully do).
  const visibleSource = useMemo(() => {
    if (!isOwnProfile || activeTab === "saved" || activeTab === "liked") return activeSource;
    if (showHidden) return activeSource;
    return activeSource.filter((prompt) => !isHidden(prompt.id));
  }, [activeSource, isOwnProfile, activeTab, showHidden, isHidden]);

  const availableTypes = useMemo(() => {
    const types = new Set<PromptContentType>();
    activeSource.forEach((prompt) => types.add(prompt.contentType));
    return Array.from(types);
  }, [activeSource]);

  const normalizedSearch = search.trim().toLocaleLowerCase("tr");

  const filtered = useMemo(() => {
    let items = visibleSource;
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
  }, [visibleSource, activeType, normalizedSearch, sort]);

  const hasActiveFilters = activeType !== "all" || normalizedSearch.length > 0;

  function clearFilters() {
    setActiveType("all");
    setSearch("");
  }

  const hiddenInThisTab =
    isOwnProfile && activeTab !== "saved" && activeTab !== "liked"
      ? activeSource.filter((prompt) => isHidden(prompt.id)).length
      : 0;

  return (
    <div className="space-y-5 pb-6">
      <ProfileHeader
        user={user}
        isOwnProfile={isOwnProfile}
        publishedPromptCount={authorPrompts.length}
        remixCount={remixPrompts.length}
        conversationId={conversationId}
        onSelectPrompts={() => setActiveTab("prompts")}
        onSelectRemixes={() => setActiveTab("remixes")}
      />

      <ProfileTabs tabs={tabs} active={activeTab} onChange={setActiveTab} />

      <div className="space-y-4 px-4 lg:px-6">
        {activeTab === "about" ? (
          <ProfileAbout user={user} />
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

            {hiddenInThisTab > 0 && (
              <button
                type="button"
                onClick={() => setShowHidden((prev) => !prev)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {showHidden
                  ? "Gizlenen promptları tekrar sakla"
                  : `${hiddenInThisTab} prompt profilinden gizlendi · Göster`}
              </button>
            )}

            <ProfileContentGrid
              prompts={filtered}
              isOwnProfile={isOwnProfile}
              isHidden={isHidden}
              onHide={hidePrompt}
              onUnhide={unhidePrompt}
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
        icon={Repeat2}
        title="İlk remixini oluştur"
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
