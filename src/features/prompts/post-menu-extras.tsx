"use client";

import { createContext, useContext, type ReactNode } from "react";

/**
 * Bir içerik kartının ⋮ menüsüne ALT AĞAÇTAN ek öğe eklemek için (örn. topluluk akışı: sabitle / topluluk yöneticilerine bildir / yönetici kaldır).
 * Kartın kendi menüsünün yanında İKİNCİ bir ⋮ menüsü çizmek yerine tek menü kullanılır; `PostMenu` bu bağlamı okur, yoksa hiçbir şey eklemez.
 */
export interface PostMenuExtra {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  /** A two-state row ("İlgimi çekiyor" …): shown as ticked, `menuitemcheckbox` for assistive tech. */
  selected?: boolean;
  onSelect: () => void;
}

const PostMenuExtrasContext = createContext<PostMenuExtra[]>([]);

export function PostMenuExtras({ items, children }: { items: PostMenuExtra[]; children: ReactNode }) {
  return <PostMenuExtrasContext.Provider value={items}>{children}</PostMenuExtrasContext.Provider>;
}

export function usePostMenuExtras(): PostMenuExtra[] {
  return useContext(PostMenuExtrasContext);
}
