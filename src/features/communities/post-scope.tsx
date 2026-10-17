"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { EngageMode } from "./post-engagement";
import type { CommunityPost } from "@/lib/supabase/communities";

/**
 * Başvuru gönderisinin kendi sayfası (`/communities/post/local`), başvurulan içeriğin NORMAL detay sayfasını (Prompt/İstek/Workflow/Hazır Ayar)
 * olduğu gibi çizer; yalnızca etkileşim satırı ve yorumlar GÖNDERİNİN kendisine bağlanır (docs/history/184-*). Bu bağlam detay sayfasına "şu an bir
 * gönderi olarak gösteriliyorsun" der: beğeni/yorum/kaydet/istatistik/paylaş (`content/scoped-engagement.tsx`) ve ⋮ menüsü (`PostMenu`) bağlamı
 * okuyup gönderiye göre davranır. Bağlam yoksa (normal içerik sayfası) hiçbir şey değişmez.
 */
export interface PostScopeValue {
  post: CommunityPost;
  mode: EngageMode;
  onToast: (message: string) => void;
}

const PostScopeContext = createContext<PostScopeValue | null>(null);

export function PostScopeProvider({ value, children }: { value: PostScopeValue; children: ReactNode }) {
  return <PostScopeContext.Provider value={value}>{children}</PostScopeContext.Provider>;
}

export function usePostScope(): PostScopeValue | null {
  return useContext(PostScopeContext);
}
