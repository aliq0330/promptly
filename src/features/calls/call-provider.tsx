"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { announceNotice } from "@/lib/app-notice";
import { useTranslation } from "@/lib/i18n/language-provider";
import { supabase } from "@/lib/supabase/client";
import { fetchProfilesByIds } from "@/lib/supabase/chat-groups";
import { friendlyServerMessage } from "@/lib/supabase/server-errors";
import { fetchMyOpenCalls, respondCallRpc, startCallRpc } from "@/lib/supabase/calls";
import { CallController } from "@/lib/webrtc/call-controller";
import {
  CALL_OWNER_KEY,
  classifyCallStartError,
  classifyMediaError,
  decideOpenCall,
  incomingRemainingMs,
  isOwnedByLiveTab,
  mapCallRow,
  parseCallOwner,
} from "@/lib/webrtc/call-rules";
import { getIceServers } from "@/lib/webrtc/ice";
import { CallPeer, getLocalMedia, isWebRtcSupported, stopStream } from "@/lib/webrtc/peer";
import { CallSignaling } from "@/lib/webrtc/signaling";
import type { CallPeerInfo, CallRole, CallRow, CallType } from "@/lib/webrtc/types";
import { CallScreen } from "./call-screen";
import { IncomingCall } from "./incoming-call";

export interface StartCallArgs {
  conversationId: string;
  peer: CallPeerInfo;
  type: CallType;
}

interface CallsContextValue {
  /** Tarayıcı WebRTC + getUserMedia destekliyor mu? (Desteklemiyorsa `startCall` anlaşılır bir uyarı gösterir.) */
  supported: boolean;
  /** Bu sekmede bir arama var mı (başlatılıyor, çalıyor, görüşme sürüyor ya da gelen arama gösteriliyor)? */
  busy: boolean;
  startCall: (args: StartCallArgs) => Promise<void>;
}

const CallsContext = createContext<CallsContextValue | null>(null);

/** Sağlayıcı yoksa (ör. yalın test ekranı) `null`: arama düğmeleri hiç çizilmez. */
export function useCalls(): CallsContextValue | null {
  return useContext(CallsContext);
}

interface ActiveSession {
  controller: CallController;
  peer: CallPeerInfo;
  args: StartCallArgs;
}

interface IncomingState {
  call: CallRow;
  peer: CallPeerInfo;
}

const subscribeNever = () => () => {};

function claimOwner(callId: string): void {
  try {
    window.localStorage.setItem(CALL_OWNER_KEY, JSON.stringify({ callId, at: Date.now() }));
  } catch {
    /* depolama kapalı: sekmeler arası koruma devre dışı kalır, arama çalışır */
  }
}

function releaseOwner(callId: string): void {
  try {
    const entry = parseCallOwner(window.localStorage.getItem(CALL_OWNER_KEY));
    if (entry?.callId === callId) window.localStorage.removeItem(CALL_OWNER_KEY);
  } catch {
    /* yok say */
  }
}

function readOwner(callId: string): boolean {
  try {
    return isOwnedByLiveTab(parseCallOwner(window.localStorage.getItem(CALL_OWNER_KEY)), callId, Date.now());
  } catch {
    return false;
  }
}

function createController(call: CallRow, role: CallRole, localStream: MediaStream): CallController {
  return new CallController(call, role, localStream, {
    iceServers: getIceServers(),
    createPeer: (options) => new CallPeer(options),
    createSignaling: (callId, handlers) => new CallSignaling(callId, handlers),
    respond: respondCallRpc,
    claimOwner,
    releaseOwner,
  });
}

/**
 * 1-1 arama sağlayıcısı (docs/history/449-*): oturumlu üyenin TEK arama durumu (AppShell'de, her sayfada).
 *  - Gelen arama: `calls` üzerinde Realtime `postgres_changes` (RLS: yalnız arayan/aranan) + açılışta `calls_my_open`.
 *  - Giden/süren arama: `CallController` (React dışında yaşar) + `CallScreen`.
 * Mikrofon/kamera YALNIZ kullanıcı eyleminde (arama düğmesi / Kabul et) istenir; izin reddedilirse arama hiç başlamaz (ya da gelen arama reddedilir).
 */
export function CallProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { t } = useTranslation();
  const userId = user?.id ?? null;

  const [session, setSession] = useState<ActiveSession | null>(null);
  const [incoming, setIncoming] = useState<IncomingState | null>(null);
  const [starting, setStarting] = useState(false);
  const [responding, setResponding] = useState(false);
  // Tarayıcı desteği sunucuda bilinmez (statik dışa aktarma): `false`, istemcide gerçek değer.
  const supported = useSyncExternalStore(subscribeNever, isWebRtcSupported, () => false);

  const sessionRef = useRef<ActiveSession | null>(null);
  const incomingRef = useRef<IncomingState | null>(null);
  const startingRef = useRef(false);
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
    sessionRef.current = session;
    incomingRef.current = incoming;
  }, [t, session, incoming]);

  const mediaErrorMessage = useCallback((error: unknown, type: CallType): string => {
    const tr = tRef.current;
    switch (classifyMediaError(error)) {
      case "permission":
        return type === "video" ? tr("calls.error.permissionVideo") : tr("calls.error.permissionAudio");
      case "notFound":
        return tr("calls.error.notFound");
      case "inUse":
        return tr("calls.error.inUse");
      case "unsupported":
        return type === "video" ? tr("calls.error.unsupportedVideo") : tr("calls.error.unsupportedAudio");
      default:
        return tr("calls.error.media");
    }
  }, []);

  /** Kullanıcıya gösterilecek `call_start` hata metni; `null` = zaten gösterildi (bkz. aşağıdaki not). */
  const startErrorMessage = useCallback((error: unknown): string | null => {
    const tr = tRef.current;
    const text = error instanceof Error ? error.message : "";
    // `interaction_blocked` / `rate_limit` kodlarını istemci fetch sarmalayıcısı (`friendlyServerErrors`) zaten çevirip uyarı olarak gösterdi:
    // ikinci, genel bir "başlatılamadı" uyarısı onu ezmesin.
    if (text === friendlyServerMessage("interaction_blocked") || text === friendlyServerMessage("rate_limit")) return null;
    switch (classifyCallStartError(text)) {
      case "busy":
        return tr("calls.error.busy");
      case "blocked":
        return tr("calls.error.blocked");
      case "notAllowed":
        return tr("calls.error.notAllowed");
      case "notDirect":
        return tr("calls.error.notDirect");
      case "rateLimit":
        return tr("calls.error.rateLimit");
      default:
        return tr("calls.error.start");
    }
  }, []);

  const loadPeer = useCallback(async (peerId: string): Promise<CallPeerInfo> => {
    const [profile] = await fetchProfilesByIds([peerId]);
    return { id: peerId, displayName: profile?.displayName ?? "", username: profile?.username ?? "", avatarUrl: profile?.avatarUrl ?? null };
  }, []);

  const mountSession = useCallback((call: CallRow, role: CallRole, stream: MediaStream, peer: CallPeerInfo, args: StartCallArgs) => {
    const controller = createController(call, role, stream);
    setSession({ controller, peer, args });
    void controller.start();
  }, []);

  // ---- arama başlat (kullanıcı eylemi: tıklama) ----
  const startCall = useCallback(
    async (args: StartCallArgs): Promise<void> => {
      if (!userId) return;
      if (sessionRef.current || incomingRef.current || startingRef.current) {
        announceNotice(tRef.current("calls.inCall"));
        return;
      }
      if (!isWebRtcSupported()) {
        announceNotice(args.type === "video" ? tRef.current("calls.error.unsupportedVideo") : tRef.current("calls.error.unsupportedAudio"));
        return;
      }
      startingRef.current = true;
      setStarting(true);
      let stream: MediaStream | null = null;
      let stage: "media" | "rpc" = "media";
      try {
        // Önce izin: tıklama hareketi içinde (iOS Safari) ve çağrı satırı oluşmadan — izin reddedilirse karşı tarafı boşuna çaldırmayız.
        stream = await getLocalMedia(args.type);
        stage = "rpc";
        const call = await startCallRpc(args.conversationId, args.type);
        mountSession(call, "caller", stream, args.peer, args);
        stream = null;
      } catch (error) {
        stopStream(stream);
        const message = stage === "media" ? mediaErrorMessage(error, args.type) : startErrorMessage(error);
        if (message) announceNotice(message);
      } finally {
        startingRef.current = false;
        setStarting(false);
      }
    },
    [userId, mountSession, mediaErrorMessage, startErrorMessage],
  );

  // ---- gelen arama ----
  const showIncoming = useCallback(
    async (call: CallRow) => {
      if (sessionRef.current || incomingRef.current || startingRef.current) return;
      const peer = await loadPeer(call.callerId);
      if (sessionRef.current || incomingRef.current) return;
      setIncoming({ call, peer });
    },
    [loadPeer],
  );

  const rejectIncoming = useCallback(async () => {
    const current = incomingRef.current;
    if (!current) return;
    setResponding(true);
    try {
      await respondCallRpc(current.call.id, "reject");
    } catch {
      /* satır zaten kapanmış olabilir */
    } finally {
      setResponding(false);
      setIncoming(null);
    }
  }, []);

  const acceptIncoming = useCallback(async () => {
    const current = incomingRef.current;
    if (!current || responding) return;
    setResponding(true);
    let stream: MediaStream | null = null;
    try {
      try {
        stream = await getLocalMedia(current.call.type);
      } catch (error) {
        // İzin yok / cihaz yok: arayan boşuna beklemesin, arama reddedilir ve neden gösterilir.
        announceNotice(mediaErrorMessage(error, current.call.type));
        await respondCallRpc(current.call.id, "reject").catch(() => {});
        setIncoming(null);
        return;
      }
      const row = await respondCallRpc(current.call.id, "accept");
      if (row.status !== "accepted") {
        stopStream(stream);
        announceNotice(tRef.current("calls.error.gone"));
        setIncoming(null);
        return;
      }
      mountSession(row, "callee", stream, current.peer, { conversationId: row.conversationId, peer: current.peer, type: row.type });
      stream = null;
      setIncoming(null);
    } catch {
      stopStream(stream);
      announceNotice(tRef.current("calls.error.gone"));
      setIncoming(null);
    } finally {
      setResponding(false);
    }
  }, [responding, mountSession, mediaErrorMessage]);

  // ---- Realtime: bana gelen/ilgili çağrı satırları ----
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    const onRow = (raw: unknown, isInsert: boolean) => {
      const row = mapCallRow(raw);
      if (!row) return;
      sessionRef.current?.controller.handleRow(row);
      const shown = incomingRef.current;
      if (shown && shown.call.id === row.id && row.status !== "ringing") {
        // Arayan vazgeçti / zaman aşımı / başka sekme yanıtladı.
        setIncoming(null);
        return;
      }
      if (isInsert && row.calleeId === userId && row.status === "ringing") void showIncoming(row);
    };

    const channel = supabase
      .channel(`calls:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` }, (payload) => onRow(payload.new, true))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `callee_id=eq.${userId}` }, (payload) => onRow(payload.new, false))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "calls", filter: `caller_id=eq.${userId}` }, (payload) => onRow(payload.new, false))
      .subscribe((status) => {
        if (status !== "SUBSCRIBED" || cancelled) return;
        // Abonelik kurulduktan sonra bir kez: yenilenen sayfada çalan/yarım kalan çağrılar.
        void (async () => {
          try {
            const open = await fetchMyOpenCalls();
            for (const row of open) {
              if (cancelled) return;
              const decision = decideOpenCall(row, userId, readOwner(row.id), Date.now());
              if (decision.kind === "show-incoming") void showIncoming(row);
              else if (decision.kind === "end") void respondCallRpc(row.id, decision.action, decision.reason).catch(() => {});
            }
          } catch (error) {
            // Arama özelliği hiçbir sayfayı bozmaz: açık çağrı taraması başarısızsa yalnız gelen arama yenilemede gelmez.
            console.error("open calls scan", error);
          }
        })();
      });

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [userId, showIncoming]);

  // Gelen arama ekranı arayanın zaman aşımından sonra kendiliğinden kapanır (sunucu satırı zaten cevapsıza çevirir).
  useEffect(() => {
    if (!incoming) return;
    const id = setTimeout(() => setIncoming(null), incomingRemainingMs(incoming.call, Date.now()) || 1);
    return () => clearTimeout(id);
  }, [incoming]);

  // Sayfa kapanırken / yenilenirken: karşıya haber ver + sahiplik kaydını bırak (en iyi gayret; RPC güvenilir şekilde tamamlanamaz).
  useEffect(() => {
    const onPageHide = () => sessionRef.current?.controller.hangup("interrupted");
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      // Oturum kapanması / sağlayıcının sökülmesi: açık arama bitirilir, mikrofon/kamera bırakılır.
      sessionRef.current?.controller.hangup();
    };
  }, []);

  const dismissSession = useCallback(() => {
    sessionRef.current?.controller.hangup();
    setSession(null);
  }, []);

  const retry = useCallback(() => {
    const args = sessionRef.current?.args;
    dismissSession();
    if (args) void startCall(args);
  }, [dismissSession, startCall]);

  const busy = session !== null || incoming !== null || starting;
  const value = useMemo<CallsContextValue>(() => ({ supported, busy, startCall }), [supported, busy, startCall]);

  return (
    <CallsContext.Provider value={value}>
      {children}
      {userId && incoming && <IncomingCall peer={incoming.peer} type={incoming.call.type} busy={responding} onAccept={() => void acceptIncoming()} onReject={() => void rejectIncoming()} />}
      {userId && session && <CallScreen controller={session.controller} peer={session.peer} onDismiss={dismissSession} onRetry={retry} />}
    </CallsContext.Provider>
  );
}
