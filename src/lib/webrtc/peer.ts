/**
 * Yerel tarayıcı WebRTC sarmalayıcısı (docs/history/449-*): yalnız `RTCPeerConnection` + `getUserMedia`; harici SDK YOK.
 * Sinyalleşmeyi (offer/answer/ICE'in karşıya taşınmasını) bilmez — onu `signaling.ts` ve `call-controller.ts` yapar.
 */
import type { CallType } from "./types.ts";

export function isWebRtcSupported(): boolean {
  return typeof window !== "undefined" && typeof window.RTCPeerConnection === "function" && typeof navigator !== "undefined" && typeof navigator.mediaDevices?.getUserMedia === "function";
}

/**
 * Mikrofonu (görüntülüde kamerayı da) açar. Kullanıcı eylemi (tıklama) içinde çağrılmalıdır: iOS Safari izin penceresini ve ses
 * oynatmayı yalnız kullanıcı hareketinden sonra güvenilir biçimde açar.
 */
export async function getLocalMedia(type: CallType): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: type === "video" ? { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

export function stopStream(stream: MediaStream | null | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

/** Denetleyicinin bağımlı olduğu en küçük eş arayüzü (testte sahtesi yazılır). */
export interface PeerLike {
  addLocalStream(stream: MediaStream): void;
  createOffer(): Promise<RTCSessionDescriptionInit>;
  /** Teklifi uygular, yanıtı üretip yerel açıklama olarak ayarlar ve döndürür. */
  acceptOffer(sdp: string): Promise<RTCSessionDescriptionInit>;
  acceptAnswer(sdp: string): Promise<void>;
  addIceCandidate(candidate: RTCIceCandidateInit): Promise<void>;
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

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    const offer = await this.pc.createOffer();
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
