"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { PostMenuGroup } from "@/lib/post-menu";

/**
 * Bir içerik kartının ⋮ menüsüne ALT AĞAÇTAN ek öğe eklemek için (örn. topluluk akışı: sabitle / topluluk yöneticilerine bildir / yönetici kaldır).
 * Kartın kendi menüsünün yanında İKİNCİ bir ⋮ menüsü çizmek yerine tek menü kullanılır; `PostMenu` bu bağlamı okur, yoksa hiçbir şey eklemez.
 */
export interface PostMenuExtra {
  key: string;
  label: string;
  icon: ReactNode;
  danger?: boolean;
  /** Satırın rengi (docs/history/480-*): "positive" yeşil (İlgimi çekiyor), "danger" kırmızı; `danger: true` ile aynı. */
  tone?: "default" | "danger" | "positive";
  /** Menüde hangi grupta ve grup içinde hangi sırada durur; verilmezse "içerik" grubunun sonu. */
  group?: PostMenuGroup;
  order?: number;
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

/**
 * Menünün yerel satırlarını bir alt ağaçta kısmak için (docs/history/480-*): `interest: false` = bu listede "İlgimi çekiyor / çekmiyor" yok
 * (Takip Ettiklerin etkinlik akışı: takip ettiğin kişilerin gönderilerine ilgi sorusu sorulmaz, docs/history/451-*).
 */
const PostMenuOptionsContext = createContext<{ interest: boolean }>({ interest: true });

export function PostMenuOptions({ interest, children }: { interest: boolean; children: ReactNode }) {
  return <PostMenuOptionsContext.Provider value={{ interest }}>{children}</PostMenuOptionsContext.Provider>;
}

export function usePostMenuOptions(): { interest: boolean } {
  return useContext(PostMenuOptionsContext);
}
