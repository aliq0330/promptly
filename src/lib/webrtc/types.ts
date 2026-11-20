/**
 * 1-1 sesli/görüntülü arama ortak tipleri (docs/history/449-*). Çerçeveden bağımsızdır; yalnız tip içerir.
 *
 * Çağrı DURUMU veritabanındadır (`calls`, `CallStatus`); istemcinin ARAYÜZ aşaması ise `CallPhase`'dir. İkisi aynı şey değildir:
 * "bağlanıyor/bağlandı" gibi aşamalar yalnız tarayıcıda bilinir (WebRTC bağlantısı), veritabanı onları görmez.
 */

export type CallType = "audio" | "video";

/** `calls.status` (DB CHECK ile aynı liste). */
export type CallStatus = "ringing" | "accepted" | "rejected" | "ended" | "missed";

/** İstemci tarafı arama aşaması. `idle` = hiç çağrı yok (denetleyici yaşamıyor). */
export type CallPhase = "idle" | "calling" | "ringing" | "connecting" | "connected" | "ended" | "rejected" | "missed" | "failed";

export type CallRole = "caller" | "callee";

/** `call_respond` eylemleri (SQL ile aynı liste). */
export type CallAction = "accept" | "reject" | "cancel" | "timeout" | "end";

export interface CallRow {
  id: string;
  conversationId: string;
  callerId: string;
  calleeId: string;
  type: CallType;
  status: CallStatus;
  startedAt: string;
  answeredAt: string | null;
  endedAt: string | null;
}

/** Karşı tarafı çizmek için gereken en küçük kimlik. */
export interface CallPeerInfo {
  id: string;
  displayName: string;
  username: string;
  avatarUrl: string | null;
}

/** Sinyal kanalındaki (`call:<id>`) Broadcast olay adları. */
export type CallSignalEvent = "call_offer" | "call_answer" | "ice_candidate" | "call_accepted" | "call_rejected" | "call_ended" | "call_media";

export const CALL_SIGNAL_EVENTS: readonly CallSignalEvent[] = ["call_offer", "call_answer", "ice_candidate", "call_accepted", "call_rejected", "call_ended", "call_media"];

/** Ayrıştırılmış (doğrulanmış) sinyal yükleri. `from` yok: kanalı yalnız çağrının iki tarafı kullanabilir (sunucu politikası). */
export interface CallSignalPayloads {
  call_offer: { sdp: string };
  call_answer: { sdp: string };
  ice_candidate: { candidate: RTCIceCandidateInit };
  call_accepted: Record<string, never>;
  call_rejected: Record<string, never>;
  call_ended: { reason?: string };
  call_media: { mic: boolean; camera: boolean };
}

export type CallSignalHandlers = { [E in CallSignalEvent]?: (payload: CallSignalPayloads[E]) => void };

/** Arama başarısızlığının KULLANICIYA gösterilen nedeni (anahtar çeviriye bağlanır; teknik hata metni gösterilmez). */
export type CallFailure = "connection" | "signaling";

export type MediaErrorKind = "permission" | "notFound" | "inUse" | "unsupported" | "unknown";

export type CallStartErrorKind = "busy" | "blocked" | "notAllowed" | "notDirect" | "rateLimit" | "unknown";
