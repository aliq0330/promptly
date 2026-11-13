"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useAuthStatus } from "@/features/auth/use-auth-status";
import { useMinWidth } from "@/features/notifications/use-min-width";

/** Dock'un çıktığı en dar ekran: `lg` (1024px) — `md`'de 72px'lik ikon rayı var, panel için yer yok; ondan dar ekranlarda mesaj simgesi eskisi gibi `/messages` sayfasına gider. */
export const MESSAGE_DOCK_MIN_WIDTH = 1024;

/**
 * Panelin hangi görünümde olduğu (docs/history/328-*, 382-*): liste · mesaj istekleri · ekip/proje kanal listesi · topluluk oda listesi · açık sohbet · "Yeni sohbet" taslağı (ilk mesajla oluşur).
 * Kanal/oda listesi Mesajlar listesinin yerine panelin İÇİNDE açılır ve sohbetten geri o listeye döner; `roomId` topluluk sohbetinde açılacak oda.
 */
export type DockView =
  | { kind: "list" }
  | { kind: "requests" }
  | { kind: "team"; teamId: string; projectId: string | null }
  | { kind: "community"; communityId: string }
  | { kind: "chat"; conversationId: string; roomId?: string | null }
  | { kind: "draft"; userId: string };

/** Sohbet/taslak ekranları dock içinde çalışırken sayfa yönlendirmesi yerine bunları çağırır (docs/history/328-*). */
export interface DockHandlers {
  onBack: () => void;
  /** "Tam sayfada aç": paneli küçültüp ilgili `/messages` sayfasına gider. */
  onExpand: () => void;
  onMinimize: () => void;
}

interface MessageDockContextValue {
  open: boolean;
  view: DockView;
  setView: (view: DockView) => void;
  openList: () => void;
  openChat: (conversationId: string, roomId?: string | null) => void;
  openTeam: (teamId: string, projectId?: string | null) => void;
  openCommunity: (communityId: string) => void;
  openDraft: (userId: string) => void;
  /** Paneli küçültür (hap kalır); görünüm (açık sohbet) hatırlanır, hap'a basınca kaldığı yerden açılır. */
  minimize: () => void;
  toggle: () => void;
}

const MessageDockContext = createContext<MessageDockContextValue | null>(null);

/**
 * Büyük ekranlarda sağ altta sabit duran Mesajlar penceresinin durumu. `AppShell` seviyesinde durur: sayfa değişse de panel açık ve sohbet seçili kalır.
 * Dock'un görünüp görünmediği ayrıdır (`useMessageDockEnabled`).
 */
export function MessageDockProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [view, setViewState] = useState<DockView>({ kind: "list" });
  const setView = useCallback((next: DockView) => setViewState(next), []);
  const openList = useCallback(() => {
    setViewState({ kind: "list" });
    setOpen(true);
  }, []);
  const openChat = useCallback((conversationId: string, roomId?: string | null) => {
    setViewState({ kind: "chat", conversationId, roomId: roomId ?? null });
    setOpen(true);
  }, []);
  const openTeam = useCallback((teamId: string, projectId?: string | null) => {
    setViewState({ kind: "team", teamId, projectId: projectId ?? null });
    setOpen(true);
  }, []);
  const openCommunity = useCallback((communityId: string) => {
    setViewState({ kind: "community", communityId });
    setOpen(true);
  }, []);
  const openDraft = useCallback((userId: string) => {
    setViewState({ kind: "draft", userId });
    setOpen(true);
  }, []);
  const minimize = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen((value) => !value), []);

  const value = useMemo<MessageDockContextValue>(
    () => ({ open, view, setView, openList, openChat, openTeam, openCommunity, openDraft, minimize, toggle }),
    [open, view, setView, openList, openChat, openTeam, openCommunity, openDraft, minimize, toggle],
  );
  return <MessageDockContext.Provider value={value}>{children}</MessageDockContext.Provider>;
}

export function useMessageDock() {
  const ctx = useContext(MessageDockContext);
  if (!ctx) throw new Error("useMessageDock must be used within a MessageDockProvider");
  return ctx;
}

/** `/messages` sayfaları (zaten tam arayüz) ve Odak (tam ekran sahne) dock'u göstermez. */
const NO_DOCK_ROUTES = /^\/(messages|focus)(\/|$)/;

/**
 * Dock bu an görünür mü: büyük ekran (≥ lg) + oturum açık + dock'suz bir rota. Üst menüdeki mesaj simgesi de buna bakar: açıksa paneli açar, değilse
 * `/messages` bağlantısıdır. (Yazma ekranı ve hikâye açıkken dock'u `[data-app-chrome]` CSS kuralı gizler.)
 */
export function useMessageDockEnabled(): boolean {
  const wide = useMinWidth(MESSAGE_DOCK_MIN_WIDTH);
  const status = useAuthStatus();
  const pathname = usePathname() ?? "";
  return wide && status === "authenticated" && !NO_DOCK_ROUTES.test(pathname);
}
