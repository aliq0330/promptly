/**
 * Arama SAF kuralları (docs/history/449-*): aşama geçişleri, süreler, hata sınıflandırması, sinyal yükü doğrulaması, sekmeler arası sahiplik.
 * Çerçeveden bağımsızdır, `npm test` ile sınanır. Buradaki hiçbir şey yetki kararı VERMEZ: yetki veritabanındadır (`call_start`/`call_respond`,
 * `can_use_call_topic`); bu dosya yalnızca arayüzün ne göstereceğini belirler.
 */
import type {
  CallAction,
  CallQuality,
  QualitySample,
  CallPhase,
  CallRow,
  CallSignalEvent,
  CallSignalPayloads,
  CallStartErrorKind,
  CallStatus,
  CallType,
  MediaErrorKind,
} from "./types.ts";

// ---------------------------------------------------------------------------------------------
// Süreler
// ---------------------------------------------------------------------------------------------

/** Karşı taraf bu süre içinde açmazsa arayan tarafta "cevapsız" olur (sunucu payla 60 sn'de kendisi de kapatır). */
export const CALL_RING_TIMEOUT_MS = 45_000;
/** Kabul edildikten sonra medya bağlantısı bu sürede kurulamazsa "başarısız". */
export const CALL_CONNECT_TIMEOUT_MS = 30_000;
/** `disconnected`/`failed` (geçici kopma) bu sürede düzelmezse "başarısız". Bu sürede arayan ICE'i yeniden başlatmayı dener (aşağıdaki sabitler). */
export const CALL_DISCONNECT_GRACE_MS = 20_000;
/** Kopma sürerse arayan ilk ICE yeniden başlatmayı bu kadar sonra, sonrakileri bu aralıkla dener (en çok `CALL_RESTART_MAX`). */
export const CALL_RESTART_FIRST_MS = 3_000;
export const CALL_RESTART_EVERY_MS = 5_000;
export const CALL_RESTART_MAX = 3;
/** Bağlantı kalitesi örnekleme aralığı. */
export const CALL_QUALITY_POLL_MS = 3_000;
/** Biten/reddedilen/cevapsız aramanın ekranda kalma süresi (başarısız arama kullanıcı kapatana kadar kalır). */
export const CALL_ENDED_DISMISS_MS = 2_500;
/** Aranan "hazırım" (`call_accepted`) sinyalini teklif gelene dek bu aralıkla tekrarlar (Broadcast kalıcı değildir). */
export const CALL_READY_RETRY_MS = 2_000;
export const CALL_READY_MAX_RETRIES = 8;
/** Gelen aramanın ekranda en çok kalma süresi (arayanın zaman aşımı + pay). */
export const CALL_INCOMING_MAX_MS = CALL_RING_TIMEOUT_MS + 5_000;
/** Sinyal kanalına katılma zaman aşımı. */
export const CALL_JOIN_TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------------------------
// Aşamalar
// ---------------------------------------------------------------------------------------------

export function isTerminalPhase(phase: CallPhase): boolean {
  return phase === "ended" || phase === "rejected" || phase === "missed" || phase === "failed";
}

/** Görüşme hâlâ sürüyor mu (medya açık, kullanıcı bir şey yapabilir)? */
export function isLivePhase(phase: CallPhase): boolean {
  return phase === "calling" || phase === "ringing" || phase === "connecting" || phase === "connected";
}

export interface ConnectionOutcome {
  phase: CallPhase;
  /** Bağlantı geçici olarak koptu (`disconnected`): arayüz "yeniden bağlanıyor" gösterir, süre sayacı akar. */
  unstable: boolean;
  /** Süre sayacını başlat/durdur kararı için: bağlantı şu an kurulu mu? */
  connected: boolean;
}

/**
 * `RTCPeerConnection.connectionState` → arama aşaması. `closed` tek başına aşama değiştirmez (kapatmayı biz yaparız).
 * Terminal aşamadaki arama geri DÖNMEZ (gecikmiş bir olay "bitti"yi "bağlandı"ya çevirmesin).
 */
export function reduceConnectionState(state: string, phase: CallPhase): ConnectionOutcome {
  if (isTerminalPhase(phase)) return { phase, unstable: false, connected: false };
  switch (state) {
    case "connected":
      return { phase: "connected", unstable: false, connected: true };
    case "disconnected":
      return { phase, unstable: phase === "connected", connected: phase === "connected" };
    case "failed":
      return { phase: "failed", unstable: false, connected: false };
    default:
      return { phase, unstable: false, connected: phase === "connected" };
  }
}

/**
 * Veritabanından (Realtime `postgres_changes`) gelen çağrı satırı → aşama. Yalnız TERMİNAL durumlar aşama değiştirir:
 * `accepted` zaten sinyal kanalıyla (`call_accepted`) işlenir, burada yok sayılır.
 */
export function phaseForRowStatus(status: CallStatus, phase: CallPhase): CallPhase {
  if (isTerminalPhase(phase)) return phase;
  if (status === "rejected") return "rejected";
  if (status === "missed") return "missed";
  if (status === "ended") return "ended";
  return phase;
}

/** "04:32" ya da (1 saati aşarsa) "1:04:32". */
export function formatCallDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(Number.isFinite(totalSeconds) ? totalSeconds : 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${two(m)}:${two(sec)}`;
}

/** Bağlantı kurulduktan sonraki geçen saniye (bağlanmadıysa 0). */
export function elapsedSeconds(connectedAt: number | null, now: number): number {
  if (connectedAt === null) return 0;
  return Math.max(0, Math.floor((now - connectedAt) / 1000));
}

/** Arayanın "kabul edildi" sonrası bir yanıt (offer/answer) ne yapmalı: çalma kapanır, bağlanma başlar. */
export function callerCanSendOffer(phase: CallPhase): boolean {
  return phase === "ringing" || phase === "calling" || phase === "connecting";
}

// ---------------------------------------------------------------------------------------------
// Hata sınıflandırması
// ---------------------------------------------------------------------------------------------

/** `getUserMedia` hatası → kullanıcıya gösterilecek tür (teknik ad gösterilmez). */
export function classifyMediaError(error: unknown): MediaErrorKind {
  const name = typeof error === "object" && error !== null && "name" in error ? String((error as { name: unknown }).name) : "";
  switch (name) {
    case "NotAllowedError":
    case "PermissionDeniedError":
    case "SecurityError":
      return "permission";
    case "NotFoundError":
    case "DevicesNotFoundError":
    case "OverconstrainedError":
      return "notFound";
    case "NotReadableError":
    case "TrackStartError":
    case "AbortError":
      return "inUse";
    case "TypeError":
      return "unsupported";
    default:
      return "unknown";
  }
}

/** `call_start` hata metni → tür. Sunucu kısa kodlar fırlatır (`call_busy` …); tanınmayan metin `unknown`. */
export function classifyCallStartError(message: string | null | undefined): CallStartErrorKind {
  const text = message ?? "";
  if (text.includes("call_busy")) return "busy";
  if (text.includes("interaction_blocked")) return "blocked";
  if (text.includes("call_not_allowed")) return "notAllowed";
  if (text.includes("call_not_direct")) return "notDirect";
  if (text.includes("call_privacy")) return "privacy";
  if (text.includes("rate_limit")) return "rateLimit";
  return "unknown";
}

// ---------------------------------------------------------------------------------------------
// Satır eşleme
// ---------------------------------------------------------------------------------------------

/** PostgREST / Realtime satırı (snake_case). */
export interface CallDbRow {
  id: string;
  conversation_id: string;
  caller_id: string;
  callee_id: string;
  type: string;
  status: string;
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

const STATUSES: readonly CallStatus[] = ["ringing", "accepted", "rejected", "ended", "missed"];

/** Beklenmeyen/eksik alanlı satır → null (Realtime yükü güvenilmez veri sayılır). */
export function mapCallRow(raw: unknown): CallRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Partial<CallDbRow>;
  if (typeof r.id !== "string" || typeof r.conversation_id !== "string" || typeof r.caller_id !== "string" || typeof r.callee_id !== "string") return null;
  if (r.type !== "audio" && r.type !== "video") return null;
  if (!STATUSES.includes(r.status as CallStatus)) return null;
  return {
    id: r.id,
    conversationId: r.conversation_id,
    callerId: r.caller_id,
    calleeId: r.callee_id,
    type: r.type as CallType,
    status: r.status as CallStatus,
    startedAt: typeof r.started_at === "string" ? r.started_at : new Date(0).toISOString(),
    answeredAt: typeof r.answered_at === "string" ? r.answered_at : null,
    endedAt: typeof r.ended_at === "string" ? r.ended_at : null,
  };
}

/** Gelen çağrı hâlâ çalıyor ve ekranda gösterilecek kadar taze mi? */
export function isIncomingFresh(row: CallRow, now: number): boolean {
  if (row.status !== "ringing") return false;
  const started = Date.parse(row.startedAt);
  return Number.isFinite(started) && now - started < CALL_INCOMING_MAX_MS;
}

/** Gelen çağrının ekranda kalacağı kalan süre (ms); en az 0. */
export function incomingRemainingMs(row: CallRow, now: number): number {
  const started = Date.parse(row.startedAt);
  if (!Number.isFinite(started)) return 0;
  return Math.max(0, CALL_INCOMING_MAX_MS - (now - started));
}

// ---------------------------------------------------------------------------------------------
// Sinyal yükü doğrulaması
// ---------------------------------------------------------------------------------------------

/** SDP / ICE yükü üst sınırı: kötü niyetli karşı tarafın dev yük göndermesini engeller (gerçek SDP birkaç KB'dır). */
export const MAX_SDP_LENGTH = 64_000;
const MAX_CANDIDATE_LENGTH = 2_000;

export function callTopic(callId: string): string {
  return `call:${callId}`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Ağdan gelen sinyal yükünü doğrular. Karşı taraf güvenilir bir kullanıcı olsa bile (kanalı yalnız çağrının tarafları kullanır) yük
 * biçimi/boyutu denetlenir; geçersizse null → olay sessizce yok sayılır.
 */
export function parseSignalPayload<E extends CallSignalEvent>(event: E, raw: unknown): CallSignalPayloads[E] | null {
  const body = isRecord(raw) ? raw : {};
  switch (event) {
    case "call_offer":
    case "call_answer": {
      const sdp = body.sdp;
      if (typeof sdp !== "string" || sdp.length === 0 || sdp.length > MAX_SDP_LENGTH) return null;
      return { sdp } as CallSignalPayloads[E];
    }
    case "ice_candidate": {
      const c = body.candidate;
      if (!isRecord(c) || typeof c.candidate !== "string" || c.candidate.length > MAX_CANDIDATE_LENGTH) return null;
      const init: RTCIceCandidateInit = { candidate: c.candidate };
      if (typeof c.sdpMid === "string" || c.sdpMid === null) init.sdpMid = c.sdpMid as string | null;
      if (typeof c.sdpMLineIndex === "number" || c.sdpMLineIndex === null) init.sdpMLineIndex = c.sdpMLineIndex as number | null;
      if (typeof c.usernameFragment === "string") init.usernameFragment = c.usernameFragment;
      return { candidate: init } as CallSignalPayloads[E];
    }
    case "call_media":
      if (typeof body.mic !== "boolean" || typeof body.camera !== "boolean") return null;
      return { mic: body.mic, camera: body.camera } as CallSignalPayloads[E];
    case "call_ended":
      return { reason: typeof body.reason === "string" ? body.reason.slice(0, 40) : undefined } as CallSignalPayloads[E];
    case "call_accepted":
    case "call_rejected":
      return {} as CallSignalPayloads[E];
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------------------------
// Sekmeler arası sahiplik (aynı kullanıcı birden çok sekme açtığında)
// ---------------------------------------------------------------------------------------------

export const CALL_OWNER_KEY = "promptly-active-call";
/** Etkin arama sekmesi sahiplik kaydını bu aralıkla yeniler. */
export const CALL_OWNER_REFRESH_MS = 5_000;
/** Kayıt bu süreden eskiyse sahip sekme ölü sayılır. */
export const CALL_OWNER_STALE_MS = 15_000;

export interface CallOwnerEntry {
  callId: string;
  at: number;
}

export function parseCallOwner(raw: string | null): CallOwnerEntry | null {
  if (!raw) return null;
  try {
    const v: unknown = JSON.parse(raw);
    if (isRecord(v) && typeof v.callId === "string" && typeof v.at === "number") return { callId: v.callId, at: v.at };
  } catch {
    /* bozuk kayıt: sahip yok sayılır */
  }
  return null;
}

/** Bu çağrıyı başka (canlı) bir sekme yönetiyor mu? Öyleyse bu sekme çağrıya DOKUNMAZ (yenilenen yeni sekme etkin görüşmeyi bitirmesin). */
export function isOwnedByLiveTab(entry: CallOwnerEntry | null, callId: string, now: number): boolean {
  return entry !== null && entry.callId === callId && now - entry.at < CALL_OWNER_STALE_MS;
}

/** Sayfa açılışında takılı kalmış bir çağrıya ne yapılacağı (bkz. `calls_my_open`). */
export type OpenCallDecision = { kind: "show-incoming" } | { kind: "ignore" } | { kind: "end"; action: CallAction; reason?: string };

export function decideOpenCall(row: CallRow, userId: string, owned: boolean, now: number): OpenCallDecision {
  if (row.status === "ringing") {
    if (row.calleeId === userId) return isIncomingFresh(row, now) ? { kind: "show-incoming" } : { kind: "ignore" };
    // Arayan sayfayı yenilemiş: çalan çağrının sahibi artık yok (medya/kanal gitti) → vazgeç.
    return owned ? { kind: "ignore" } : { kind: "end", action: "cancel" };
  }
  if (row.status === "accepted") {
    // Yarım kalan görüşme: WebRTC bağlantısı sayfayla birlikte öldü. Canlı başka sekme yönetiyorsa dokunma.
    return owned ? { kind: "ignore" } : { kind: "end", action: "end", reason: "interrupted" };
  }
  return { kind: "ignore" };
}

// ---------------------------------------------------------------------------------------------
// Bağlantı kalitesi
// ---------------------------------------------------------------------------------------------

/**
 * RTT (ms) + paket kaybı (%) → kalite. Ölçülemeyen değer (null) o ölçütü atlar; ikisi de yoksa null (önceki değer korunur).
 * Eşikler VoIP için yaygın değerlerdir: iyi < 150 ms ve < %2 kayıp, orta < 350 ms ve < %8, kalanı zayıf.
 */
export function qualityFrom(sample: QualitySample | null): CallQuality | null {
  if (!sample) return null;
  const { rttMs, lossPct } = sample;
  if (rttMs === null && lossPct === null) return null;
  const rtt = rttMs ?? 0;
  const loss = lossPct ?? 0;
  if (rtt < 150 && loss < 2) return "good";
  if (rtt < 350 && loss < 8) return "mid";
  return "low";
}

/** Kapalı kamera/mikrofon göstergesi ve cihaz seçimi için kayıtlı cihaz kimliğinden `getUserMedia` kısıtı üretir (kimlik yoksa kısıt koyulmaz). */
export function deviceConstraint(deviceId: string | null | undefined): { deviceId: { ideal: string } } | Record<string, never> {
  return deviceId ? { deviceId: { ideal: deviceId } } : {};
}

export const CALL_DEVICES_KEY = "promptly-call-devices";

/** Kayıtlı cihaz tercihleri (bozuk/eksik kayıt = varsayılanlar). */
export function parseDevicePrefs(raw: string | null): { mic: string | null; camera: string | null; speaker: string | null } {
  const empty = { mic: null, camera: null, speaker: null };
  if (!raw) return empty;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isRecord(v)) return empty;
    const pick = (x: unknown) => (typeof x === "string" && x.length > 0 && x.length < 300 ? x : null);
    return { mic: pick(v.mic), camera: pick(v.camera), speaker: pick(v.speaker) };
  } catch {
    return empty;
  }
}
