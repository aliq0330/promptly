/**
 * Yerel tarayıcı WebRTC sarmalayıcısı (docs/history/449-*): yalnız `RTCPeerConnection` + `getUserMedia`; harici SDK YOK.
 * Sinyalleşmeyi (offer/answer/ICE'in karşıya taşınmasını) bilmez — onu `signaling.ts` ve `call-controller.ts` yapar.
 */
import { deviceConstraint } from "./call-rules.ts";
import type { CallDevicePrefs, CallType, CameraFacing, QualitySample } from "./types.ts";

export function isWebRtcSupported(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection === "function" && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/**
 * Mikrofonu (görüntülüde kamerayı da) açar. Kullanıcı eylemi (tıklama) içinde çağrılmalıdır: iOS Safari izin penceresini ve ses
 * oynatmayı yalnız kullanıcı hareketinden sonra güvenilir biçimde açar.
 */
export async function getLocalMedia(type: CallType, prefs?: Partial<CallDevicePrefs> | null): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...deviceConstraint(prefs?.mic) },
    video: type === "video" ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 }, ...deviceConstraint(prefs?.camera) } : false,
  });
}

/** Görüşme sırasında tek bir izi (mikrofon ya da kamera) başka bir cihazdan / kameradan alır (cihaz değiştirme, ön↔arka kamera). */
export async function acquireTrack(kind: "audio" | "video", opts: { deviceId?: string | null; facing?: CameraFacing } = {}): Promise<MediaStreamTrack> {
  const stream = await navigator.mediaDevices.getUserMedia(
    kind === "audio"
      ? { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...deviceConstraint(opts.deviceId) } }
      : { video: opts.deviceId ? { deviceId: { exact: opts.deviceId } } : { facingMode: opts.facing ?? "user", width: { ideal: 1280 }, height: { ideal: 720 } } },
  );
  const track = stream.getTracks()[0];
  if (!track) throw new Error("no_track");
  return track;
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Denetleyicinin bağımlı olduğu en küçük eş arayüzü (testte sahtesi yazılır). */
export interface PeerLike {
  addLocalStream(stream: MediaStream): void;
  /** `iceRestart`: bağlantı koptuysa yeni ICE adaylarıyla teklif (yeniden bağlanma). */
  createOffer(opts?: { iceRestart?: boolean }): Promise<RTCSessionDescriptionInit>;
  /** Teklifi uygular, yanıtı üretip yerel açıklama olarak ayarlar ve döndürür. */
  acceptOffer(sdp: string): Promise<RTCSessionDescriptionInit>;
  acceptAnswer(sdp: string): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
  /** Giden medya izini (aynı türden) değiştirir; teklif/yanıt gerekmez. */
  replaceTrack(kind: "audio" | "video", track: MediaStreamTrack): Promise<void>;
  /** Anlık bağlantı kalitesi örneği (yoksa/ölçülemezse null). */
  getQuality(): Promise<QualitySample | null>;
  close(): void;
}

export interface PeerOptions {
  iceServers: RTCIceServer[];
  onIceCandidate: (candidate: RTCIceCandidateInit) => void;
  onRemoteStream: (stream: MediaStream) => void;
  onConnectionState: (state: RTCPeerConnectionState) => void;
}

/**
 * Tek `RTCPeerConnection`. ICE adayları uzak açıklama (`setRemoteDescription`) ayarlanmadan gelirse SIRAYA alınır ve ayarlanınca eklenir
 * (adaylar çoğu zaman teklif/yanıttan ÖNCE ulaşır; hemen eklemek `InvalidStateError` verir).
 */
export class CallPeer implements PeerLike {
  private readonly pc: RTCPeerConnection;
  private readonly options: PeerOptions;
  private pending: RTCIceCandidateInit[] = [];
  private remoteReady = false;
  private fallbackStream: MediaStream | null = null;
  private closed = false;

  constructor(options: PeerOptions) {
    this.options = options;
    this.pc = new RTCPeerConnection({ iceServers: options.iceServers });
    this.pc.onicecandidate = (event) => {
      // `candidate === null` = toplama bitti: karşıya gönderilecek bir şey yok.
      if (event.candidate) options.onIceCandidate(event.candidate.toJSON());
    };
    this.pc.ontrack = (event) => {
      let stream = event.streams[0];
      if (!stream) {
        // Bazı tarayıcılar akışsız iz bildirir: kendi akışımıza ekleriz.
        this.fallbackStream ??= new MediaStream();
        this.fallbackStream.addTrack(event.track);
        stream = this.fallbackStream;
      }
      options.onRemoteStream(stream);
    };
    this.pc.onconnectionstatechange = () => options.onConnectionState(this.pc.connectionState);
  }

  addLocalStream(stream: MediaStream): void {
    for (const track of stream.getTracks()) this.pc.addTrack(track, stream);
  }

  async createOffer(opts?: { iceRestart?: boolean }): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer(opts?.iceRestart ? { iceRestart: true } : undefined);
    await this.pc.setLocalDescription(offer);
    return { type: "offer", sdp: offer.sdp };
  }

  async acceptOffer(sdp: string): Promise<RTCSessionDescriptionInit> {
    await this.pc.setRemoteDescription({ type: "offer", sdp });
    await this.flushPending();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: "answer", sdp: answer.sdp };
  }

  async acceptAnswer(sdp: string): Promise<void> {
    await this.pc.setRemoteDescription({ type: "answer", sdp });
    await this.flushPending();
  }

  async addIceCandidate(candidate: RTCIceCandidateInit): Promise<void> {
    if (this.closed) return;
    if (!this.remoteReady) {
      this.pending.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      /* geçersiz/yinelenen aday: bağlantıyı bozmaz */
    }
  }

  async replaceTrack(kind: "audio" | "video", track: MediaStreamTrack): Promise<void> {
    const sender = this.pc.getSenders().find((candidate) => candidate.track?.kind === kind);
    if (sender) await sender.replaceTrack(track);
  }

  private lastInbound: { lost: number; received: number } | null = null;

  async getQuality(): Promise<QualitySample | null> {
    if (this.closed) return null;
    try {
      const report = await this.pc.getStats();
      let rttMs: number | null = null;
      let lost = 0;
      let received = 0;
      report.forEach((stat: Record<string, unknown>) => {
        if (stat.type === "candidate-pair" && (stat.nominated === true || stat.state === "succeeded") && typeof stat.currentRoundTripTime === "number") rttMs = Math.round(stat.currentRoundTripTime * 1000);
        if (stat.type === "inbound-rtp" && !stat.isRemote) {
          if (typeof stat.packetsLost === "number") lost += stat.packetsLost;
          if (typeof stat.packetsReceived === "number") received += stat.packetsReceived;
        }
      });
      let lossPct: number | null = null;
      if (this.lastInbound) {
        const dLost = Math.max(0, lost - this.lastInbound.lost);
        const dReceived = Math.max(0, received - this.lastInbound.received);
        if (dLost + dReceived > 20) lossPct = (dLost / (dLost + dReceived)) * 100;
      }
      this.lastInbound = { lost, received };
      return { rttMs, lossPct };
    } catch {
      return null;
    }
  }

  private async flushPending(): Promise<void> {
    this.remoteReady = true;
    const queued = this.pending;
    this.pending = [];
    for (const candidate of queued) {
      try {
        await this.pc.addIceCandidate(candidate);
      } catch {
        /* yok say */
      }
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.pc.onicecandidate = null;
    this.pc.ontrack = null;
    this.pc.onconnectionstatechange = null;
    this.pending = [];
    try {
      this.pc.close();
    } catch {
      /* zaten kapalı */
    }
  }
}
