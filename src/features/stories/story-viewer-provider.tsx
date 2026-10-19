"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";

/**
 * Hikâye görüntüleyicisini her yerden (Ana Sayfa şeridi, topluluk şeridi, profildeki öne çıkanlar, arşiv, mesajdaki yanıt kartı,
 * `/stories?id=`) aynı biçimde açan bağlam (docs/history/198-*). Görüntüleyici sayfanın ÜSTÜNDE bir katmandır — rota değişmez, bu
 * yüzden kapanınca önceki sayfa ve kaydırma konumu olduğu gibi yerindedir. Kod yalnız açılınca yüklenir (dinamik içe aktarma).
 */

export interface ViewerGroup {
  /** Grup anahtarı (yazar ya da öne çıkan). */
  key: string;
  authorId: string;
  storyIds: string[];
  /** `active`: şerit (görülmemişten başlar) · `highlight`: öne çıkan (başlığıyla) · `archive`/`single`: verilen sırayla. */
  mode: "active" | "highlight" | "archive" | "single";
  /** Öne çıkan başlığı. */
  label?: string;
}

export interface OpenStoriesOptions {
  groups: ViewerGroup[];
  startGroupIndex?: number;
  startStoryId?: string;
  /** Görüntüleyici kapanınca (örn. `/stories?id=` sayfası geri döner). */
  onClose?: () => void;
}

interface StoryViewerContextValue {
  openStories: (options: OpenStoriesOptions) => void;
  /** Bu oturumda izlenen hikâyeler: şeritler halkayı yeniden istek atmadan "görüldü"ye çevirir. */
  seenIds: ReadonlySet<string>;
  markSeen: (storyId: string) => void;
  /** Görüntüleyicide bir şey değişince (silme, yeni paylaşım, öne çıkan) artar; şeritler/listeler yeniden yükler. */
  changeVersion: number;
  notifyChanged: () => void;
}

const StoryViewerContext = createContext<StoryViewerContextValue | null>(null);

const StoryViewer = dynamic(() => import("./story-viewer").then((m) => m.StoryViewer), { ssr: false });

export function StoryViewerProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<(OpenStoriesOptions & { id: number }) | null>(null);
  const [seenIds, setSeenIds] = useState<ReadonlySet<string>>(() => new Set());
  const [changeVersion, setChangeVersion] = useState(0);
  const sessionSeq = useRef(0);
  const onCloseRef = useRef<(() => void) | undefined>(undefined);

  const openStories = useCallback((options: OpenStoriesOptions) => {
    const groups = options.groups.filter((group) => group.storyIds.length > 0);
    if (groups.length === 0) return;
    sessionSeq.current += 1;
    onCloseRef.current = options.onClose;
    setSession({ ...options, groups, id: sessionSeq.current });
  }, []);

  const markSeen = useCallback((storyId: string) => {
    setSeenIds((prev) => (prev.has(storyId) ? prev : new Set(prev).add(storyId)));
  }, []);

  const notifyChanged = useCallback(() => setChangeVersion((v) => v + 1), []);

  const close = useCallback(() => {
    const callback = onCloseRef.current;
    onCloseRef.current = undefined;
    setSession(null);
    callback?.();
  }, []);

  const value = useMemo(
    () => ({ openStories, seenIds, markSeen, changeVersion, notifyChanged }),
    [openStories, seenIds, markSeen, changeVersion, notifyChanged],
  );

  return (
    <StoryViewerContext.Provider value={value}>
      {children}
      {session && (
        <StoryViewer
          key={session.id}
          groups={session.groups}
          startGroupIndex={session.startGroupIndex ?? 0}
          startStoryId={session.startStoryId}
          onClose={close}
        />
      )}
    </StoryViewerContext.Provider>
  );
}

export function useStoryViewer(): StoryViewerContextValue {
  const ctx = useContext(StoryViewerContext);
  if (!ctx) throw new Error("useStoryViewer must be used within a StoryViewerProvider");
  return ctx;
}
