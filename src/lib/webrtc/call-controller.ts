/**
 * Tek bir 1-1 aramanın yaşam döngüsü (docs/history/449-*): sinyalleşme + `RTCPeerConnection` + zamanlayıcılar + durum.
 *
 * React'ten BAĞIMSIZDIR (React Strict Mode'un efekti iki kez çalıştırması çağrıyı bitirmesin diye): denetleyici bir olay işleyicisinde
 * (tıklama) oluşturulur, arayüz yalnız `subscribe`/`getSnapshot` ile (`useSyncExternalStore`) okur ve `hangup`/`toggleMic`… çağırır.
 * Bağımlılıklar (`CallDeps`) enjekte edilir: gerçekte `CallPeer` + `CallSignaling` + `call_respond` RPC'si, testte sahtesi.
 *
 * Akış (el sıkışma ARANAN tarafından sürülür, çünkü Broadcast kalıcı değildir — aranan kanala girmeden gönderilen teklif kaybolurdu):
 *   arayan : calling → (kanala girer) ringing → [aranan "hazırım" der] connecting (teklif gönderir) → connected
 *   aranan : connecting (kabul + kanala girer, `call_accepted` gönderir, teklif gelene dek tekrarlar) → yanıt gönderir → connected
 *   son    : ended | rejected | missed | failed
 */
import {
  CALL_CONNECT_TIMEOUT_MS,
  CALL_DISCONNECT_GRACE_MS,
  CALL_OWNER_REFRESH_MS,
  CALL_QUALITY_POLL_MS,
  CALL_READY_MAX_RETRIES,
  CALL_READY_RETRY_MS,
  CALL_RESTART_EVERY_MS,
  CALL_RESTART_FIRST_MS,
  CALL_RESTART_MAX,
  CALL_RING_TIMEOUT_MS,
  callerCanSendOffer,
  isTerminalPhase,
  phaseForRowStatus,
  qualityFrom,
  reduceConnectionState,
} from "./call-rules.ts";
import { stopStream, type PeerLike, type PeerOptions } from "./peer.ts";
import type { SignalingLike } from "./signaling.ts";
import type { CallAction, CallFailure, CallPhase, CallQuality, CallRole, CallRow, CallSignalEvent, CallSignalHandlers, CallSignalPayloads, CallType, CameraFacing } from "./types.ts";

export interface CallDeps {
  iceServers: RTCIceServer[];
  createPeer(options: PeerOptions): PeerLike;
  createSignaling(callId: string, handlers: CallSignalHandlers): SignalingLike;
  /** `call_respond` RPC'si (hata fırlatabilir; denetleyici yutar — arama zaten yerelde bitmiştir). */
  respond(callId: string, action: CallAction, reason?: string): Promise<unknown>;
  now?: () => number;
  /** Aynı kullanıcının başka sekmesi bu çağrıya dokunmasın diye sahiplik kaydı (yoksa atlanır). */
  claimOwner?: (callId: string) => void;
  releaseOwner?: (callId: string) => void;
  /** Ekranın uyumasını engeller (bağlanınca çağrılır; dönen fonksiyon bırakır). */
  keepAwake?: () => () => void;
  /** Görüşme sırasında tek iz (mikrofon/kamera) alır: cihaz değiştirme, ön↔arka kamera. */
  acquireTrack?: (kind: "audio" | "video", opts: { deviceId?: string | null; facing?: CameraFacing }) => Promise<MediaStreamTrack>;
}

export interface CallSnapshot {
  callId: string;
  conversationId: string;
  type: CallType;
  role: CallRole;
  phase: CallPhase;
  /** Bağlantı geçici koptu (`disconnected`): arayüz "yeniden bağlanıyor" der. */
  unstable: boolean;
  failure: CallFailure | null;
  micOn: boolean;
  camOn: boolean;
  /** Karşı tarafın bildirdiği durum (`call_media`). */
  remoteMic: boolean;
  remoteCamera: boolean;
  /** Bağlantının kurulduğu an (ms, `now()`); süre sayacı bundan türetilir. */
  connectedAt: number | null;
  localStream: MediaStream;
  remoteStream: MediaStream | null;
  /** Son ölçülen bağlantı kalitesi (bağlanmadıysa/ölçülemediyse null). */
  quality: CallQuality | null;
  /** Telefonda kullanılan kamera yönü. */
  facing: CameraFacing;
  /** Yerel izler cihaz değişimiyle yenilendiğinde artar (arayüz cihaz listesini/önizlemeyi tazeler). */
  devicesRev: number;
}

type FinalPhase = "ended" | "rejected" | "missed" | "failed";

interface FinishOptions {
  rpc?: { action: CallAction; reason?: string };
  notify?: { [E in CallSignalEvent]: { event: E; payload: CallSignalPayloads[E] } }[CallSignalEvent];
  failure?: CallFailure;
}

export class CallController {
  private snap: CallSnapshot;
  private readonly deps: CallDeps;
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Map<string, ReturnType<typeof setTimeout> | ReturnType<typeof setInterval>>();
  private peer: PeerLike | null = null;
  private signaling: SignalingLike | null = null;
  private started = false;
  private finished = false;
  private offerPromise: Promise<RTCSessionDescriptionInit> | null = null;
  private offerSdp: string | null = null;
  private offerReceived = false;
  private answerReceived = false;
  private restartCount = 0;
  private negotiating = false;
  private releaseAwake: (() => void) | null = null;

  constructor(call: CallRow, role: CallRole, localStream: MediaStream, deps: CallDeps) {
    this.deps = deps;
    const audioOn = localStream.getAudioTracks().every((t) => t.enabled);
    // Hazırlık ekranında kamera kapalı başlatılmış olabilir (docs/history/450-*): başlangıç durumu izlerden okunur.
    const videoOn = call.type === "video" && localStream.getVideoTracks().every((t) => t.enabled);
    this.snap = {
      callId: call.id,
      conversationId: call.conversationId,
      type: call.type,
      role,
      phase: role === "caller" ? "calling" : "connecting",
      unstable: false,
      failure: null,
      micOn: audioOn,
      camOn: videoOn,
      remoteMic: true,
      remoteCamera: call.type === "video",
      connectedAt: null,
      localStream,
      remoteStream: null,
      quality: null,
      facing: "user",
      devicesRev: 0,
    };
  }

  // ---- React köprüsü (useSyncExternalStore) ----
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getSnapshot = (): CallSnapshot => this.snap;

  private patch(partial: Partial<CallSnapshot>): void {
    this.snap = { ...this.snap, ...partial };
    for (const listener of [...this.listeners]) listener();
  }

  private now(): number {
    return (this.deps.now ?? Date.now)();
  }

  // ---- zamanlayıcılar ----
  private setTimer(name: string, ms: number, fn: () => void): void {
    this.clearTimer(name);
    this.timers.set(name, setTimeout(fn, ms));
  }
  private setRepeat(name: string, ms: number, fn: () => void): void {
    this.clearTimer(name);
    this.timers.set(name, setInterval(fn, ms));
  }
  private hasTimer(name: string): boolean {
    return this.timers.has(name);
  }
  private clearTimer(name: string): void {
    const handle = this.timers.get(name);
    if (handle === undefined) return;
    clearTimeout(handle as ReturnType<typeof setTimeout>);
    clearInterval(handle as ReturnType<typeof setInterval>);
    this.timers.delete(name);
  }

  private send<E extends CallSignalEvent>(event: E, payload: CallSignalPayloads[E]): Promise<void> {
    return this.signaling ? this.signaling.send(event, payload) : Promise.resolve();
  }

  // ---- yaşam döngüsü ----
  /** Eş bağlantısını ve sinyal kanalını kurar. Yalnız bir kez çalışır. */
  async start(): Promise<void> {
    if (this.started || this.finished) return;
    this.started = true;
    const { callId, role } = this.snap;

    this.deps.claimOwner?.(callId);
    this.setRepeat("owner", CALL_OWNER_REFRESH_MS, () => this.deps.claimOwner?.(callId));

    this.peer = this.deps.createPeer({
      iceServers: this.deps.iceServers,
      onIceCandidate: (candidate) => void this.send("ice_candidate", { candidate }),
      onRemoteStream: (stream) => this.patch({ remoteStream: stream }),
      onConnectionState: (state) => this.onConnectionState(state),
    });
    this.peer.addLocalStream(this.snap.localStream);

    this.signaling = this.deps.createSignaling(callId, {
      call_offer: (p) => void this.onOffer(p.sdp),
      call_answer: (p) => void this.onAnswer(p.sdp),
      ice_candidate: (p) => void this.peer?.addIceCandidate(p.candidate),
      call_accepted: () => void this.onAccepted(),
      call_rejected: () => this.finish("rejected"),
      call_ended: () => this.finish("ended"),
      call_media: (p) => this.patch({ remoteMic: p.mic, remoteCamera: p.camera }),
    });

    try {
      await this.signaling.join();
    } catch {
      if (!this.finished) this.fail("signaling");
      return;
    }
    if (this.finished) return;

    if (role === "caller") {
      this.patch({ phase: "ringing" });
      this.setTimer("ring", CALL_RING_TIMEOUT_MS, () => this.onRingTimeout());
    } else {
      this.setTimer("connect", CALL_CONNECT_TIMEOUT_MS, () => this.fail("connection"));
      this.sendReady();
    }
  }

  /** Aranan: "hazırım" — teklif gelene dek tekrarlanır (kanal kalıcı değil; arayanın ilk dinleyişi kaçmış olabilir). */
  private sendReady(): void {
    let tries = 0;
    const tick = () => {
      if (this.finished || this.offerReceived || tries >= CALL_READY_MAX_RETRIES) {
        this.clearTimer("ready");
        return;
      }
      tries += 1;
      void this.send("call_accepted", {});
    };
    tick();
    this.setRepeat("ready", CALL_READY_RETRY_MS, tick);
  }

  // ---- sinyal olayları ----
  /** Arayan: aranan hazır → teklif gönder (yinelenen "hazırım"da yanıt gelmediyse aynı teklif yeniden gönderilir). */
  private async onAccepted(): Promise<void> {
    const { role, phase } = this.snap;
    if (this.finished || role !== "caller" || !callerCanSendOffer(phase) || this.answerReceived || !this.peer) return;
    if (phase !== "connecting") {
      this.clearTimer("ring");
      this.patch({ phase: "connecting" });
      this.setTimer("connect", CALL_CONNECT_TIMEOUT_MS, () => this.fail("connection"));
    }
    try {
      this.offerPromise ??= this.peer.createOffer();
      const offer = await this.offerPromise;
      this.offerSdp = offer.sdp ?? null;
    } catch {
      this.fail("connection");
      return;
    }
    if (this.finished || !this.offerSdp) return;
    await this.send("call_offer", { sdp: this.offerSdp });
  }

  /**
   * Aranan: teklifi uygula, yanıt gönder. İlk teklifin yinelenenleri (bağlanırken) yok sayılır; bağlıyken ya da kopukken gelen teklif
   * arayanın ICE yeniden başlatmasıdır (docs/history/450-*) ve yeniden yanıtlanır.
   */
  private async onOffer(sdp: string): Promise<void> {
    if (this.finished || this.snap.role !== "callee" || !this.peer || this.negotiating) return;
    if (this.offerReceived && this.snap.phase !== "connected") return;
    this.offerReceived = true;
    this.clearTimer("ready");
    this.negotiating = true;
    try {
      const answer = await this.peer.acceptOffer(sdp);
      if (this.finished || !answer.sdp) return;
      await this.send("call_answer", { sdp: answer.sdp });
    } catch {
      this.fail("connection");
    } finally {
      this.negotiating = false;
    }
  }

  /** Arayan: yanıtı uygula (ICE yeniden başlatmada `answerReceived` sıfırlanır, yeni yanıt da uygulanır). */
  private async onAnswer(sdp: string): Promise<void> {
    if (this.finished || this.snap.role !== "caller" || this.answerReceived || !this.offerSdp || !this.peer) return;
    this.answerReceived = true;
    try {
      await this.peer.acceptAnswer(sdp);
    } catch {
      this.fail("connection");
    }
  }

  /** Arayan: bağlantı koptu → ICE'i yeni adaylarla yeniden başlat (en çok `CALL_RESTART_MAX` kez, `CALL_RESTART_EVERY_MS` arayla). */
  private async restartIce(): Promise<void> {
    if (this.finished || this.snap.role !== "caller" || !this.snap.unstable || !this.peer || this.restartCount >= CALL_RESTART_MAX) return;
    this.restartCount += 1;
    try {
      const offer = await this.peer.createOffer({ iceRestart: true });
      if (this.finished || !offer.sdp) return;
      this.offerSdp = offer.sdp;
      this.answerReceived = false;
      await this.send("call_offer", { sdp: offer.sdp });
    } catch {
      /* süre aşımı (grace) aramayı bitirir */
    }
    if (!this.finished && this.snap.unstable && this.restartCount < CALL_RESTART_MAX) this.setTimer("restart", CALL_RESTART_EVERY_MS, () => void this.restartIce());
  }

  private markUnstable(): void {
    if (!this.snap.unstable) this.patch({ unstable: true });
    if (!this.hasTimer("grace")) this.setTimer("grace", CALL_DISCONNECT_GRACE_MS, () => this.fail("connection"));
  }

  private async pollQuality(): Promise<void> {
    const peer = this.peer;
    if (this.finished || !peer) return;
    const q = qualityFrom(await peer.getQuality().catch(() => null));
    if (q && !this.finished && q !== this.snap.quality) this.patch({ quality: q });
  }

  private onConnectionState(state: RTCPeerConnectionState): void {
    if (this.finished) return;
    const { phase, unstable, role } = this.snap;
    // Bağlıyken `failed`: hemen bitirme, önce toparlanmayı dene (arayan ICE'i yeniden başlatır, aranan teklifi bekler); süre dolarsa biter.
    if (state === "failed" && phase === "connected" && (role === "callee" || this.restartCount < CALL_RESTART_MAX)) {
      this.markUnstable();
      if (role === "caller") void this.restartIce();
      return;
    }
    const out = reduceConnectionState(state, phase);
    if (out.phase === "failed") {
      this.fail("connection");
      return;
    }
    if (out.phase === "connected" && phase !== "connected") {
      this.clearTimer("ring");
      this.clearTimer("connect");
      this.clearTimer("grace");
      this.patch({ phase: "connected", unstable: false, connectedAt: this.now() });
      this.setRepeat("quality", CALL_QUALITY_POLL_MS, () => void this.pollQuality());
      void this.pollQuality();
      this.releaseAwake = this.deps.keepAwake?.() ?? null;
      // Mikrofon/kamera kapalı başlatıldıysa (hazırlık ekranı) karşı taraf bağlanır bağlanmaz öğrenir.
      if (!this.snap.micOn || (this.snap.type === "video" && !this.snap.camOn)) void this.send("call_media", { mic: this.snap.micOn, camera: this.snap.camOn });
      return;
    }
    if (state === "disconnected" && phase === "connected" && !unstable) {
      this.markUnstable();
      if (role === "caller") this.setTimer("restart", CALL_RESTART_FIRST_MS, () => void this.restartIce());
      return;
    }
    if (state === "connected" && unstable) {
      this.clearTimer("grace");
      this.clearTimer("restart");
      this.restartCount = 0;
      this.patch({ unstable: false });
    }
  }

  private onRingTimeout(): void {
    this.finish("missed", { rpc: { action: "timeout" }, notify: { event: "call_ended", payload: { reason: "timeout" } } });
  }

  private fail(failure: CallFailure): void {
    this.finish("failed", {
      failure,
      rpc: { action: "end", reason: "failed" },
      notify: { event: "call_ended", payload: { reason: "failed" } },
    });
  }

  /** Aramayı sona erdirir (idempotent): zamanlayıcıları, medyayı, eşi ve kanalı kapatır; gerekirse karşıya haber verir ve RPC'yi çağırır. */
  private finish(final: FinalPhase, opts: FinishOptions = {}): void {
    if (this.finished) return;
    this.finished = true;
    for (const name of [...this.timers.keys()]) this.clearTimer(name);

    const signaling = this.signaling;
    if (signaling) {
      const leave = () => signaling.leave();
      if (opts.notify) {
        void signaling.send(opts.notify.event, opts.notify.payload as never).then(leave, leave);
        setTimeout(leave, 1500);
      } else {
        leave();
      }
    }
    this.peer?.close();
    stopStream(this.snap.localStream);
    this.releaseAwake?.();
    this.releaseAwake = null;
    this.deps.releaseOwner?.(this.snap.callId);
    if (opts.rpc) {
      const { action, reason } = opts.rpc;
      void Promise.resolve(this.deps.respond(this.snap.callId, action, reason)).catch(() => {
        /* arama yerelde zaten bitti; sunucu kaydı bir sonraki açılışta/zaman aşımında düzelir */
      });
    }
    this.patch({ phase: final, unstable: false, failure: opts.failure ?? null, remoteStream: null, quality: null });
  }

  // ---- arayüz eylemleri ----
  /** Kullanıcı kapattı. Çalarken arayan "vazgeç" (cevapsız kaydı), diğer durumlarda "bitir". */
  hangup(reason = "hangup"): void {
    if (this.finished) return;
    const { role, phase } = this.snap;
    const ringing = role === "caller" && (phase === "calling" || phase === "ringing");
    this.finish("ended", {
      rpc: ringing ? { action: "cancel" } : { action: "end", reason },
      notify: { event: "call_ended", payload: { reason: ringing ? "cancelled" : reason } },
    });
  }

  /** Veritabanından (Realtime `postgres_changes`) gelen çağrı satırı: karşı taraf RPC ile bitirdiyse/reddettiyse/zaman aşımına uğradıysa. */
  handleRow(row: CallRow): void {
    if (this.finished || row.id !== this.snap.callId) return;
    const next = phaseForRowStatus(row.status, this.snap.phase);
    if (next !== this.snap.phase && isTerminalPhase(next)) this.finish(next as FinalPhase);
  }

  toggleMic(): void {
    if (this.finished) return;
    const next = !this.snap.micOn;
    for (const track of this.snap.localStream.getAudioTracks()) track.enabled = next;
    this.patch({ micOn: next });
    void this.send("call_media", { mic: next, camera: this.snap.camOn });
  }

  toggleCamera(): void {
    if (this.finished || this.snap.type !== "video") return;
    const next = !this.snap.camOn;
    for (const track of this.snap.localStream.getVideoTracks()) track.enabled = next;
    this.patch({ camOn: next });
    void this.send("call_media", { mic: this.snap.micOn, camera: next });
  }

  /**
   * Görüşme sırasında giden mikrofon/kamera izini değiştirir (cihaz seçimi, ön↔arka kamera): yeni iz alınır, gönderici izi yer
   * değiştirir (teklif/yanıt gerekmez), eski iz durdurulur. Başarısızsa mevcut iz AYNEN kalır ve false döner.
   */
  async switchInput(kind: "audio" | "video", opts: { deviceId?: string | null; facing?: CameraFacing } = {}): Promise<boolean> {
    const { acquireTrack } = this.deps;
    if (this.finished || !acquireTrack || !this.peer) return false;
    if (kind === "video" && this.snap.type !== "video") return false;
    let track: MediaStreamTrack;
    try {
      track = await acquireTrack(kind, opts);
    } catch {
      return false;
    }
    if (this.finished || !this.peer) {
      track.stop();
      return false;
    }
    try {
      await this.peer.replaceTrack(kind, track);
    } catch {
      track.stop();
      return false;
    }
    const stream = this.snap.localStream;
    for (const old of kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks()) {
      stream.removeTrack(old);
      old.stop();
    }
    track.enabled = kind === "audio" ? this.snap.micOn : this.snap.camOn;
    stream.addTrack(track);
    this.patch({ devicesRev: this.snap.devicesRev + 1, facing: opts.facing ?? this.snap.facing });
    return true;
  }

  /** Telefonda ön ↔ arka kamera. */
  flipCamera(): Promise<boolean> {
    return this.switchInput("video", { facing: this.snap.facing === "user" ? "environment" : "user" });
  }
}
