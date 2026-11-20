/**
 * Arama sinyalleşmesi (docs/history/449-*): Supabase Realtime **Broadcast** — offer / answer / ICE / durum olayları, KALICI DEĞİL,
 * veritabanına hiçbir şey yazılmaz. Kanal `call:<çağrı uuid>` ve PRIVATE'tır: `can_use_call_topic` politikası yalnız çağrının arayanına ve
 * arananına okuma/yazma izni verir (`typing:<konuşma>` ile aynı kalıp). Medya (ses/görüntü) bu kanaldan GEÇMEZ.
 *
 * Gelen her yük `parseSignalPayload` ile doğrulanır; geçersiz yük sessizce yok sayılır.
 */
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase/client";
import { CALL_JOIN_TIMEOUT_MS, callTopic, parseSignalPayload } from "./call-rules.ts";
import { CALL_SIGNAL_EVENTS, type CallSignalEvent, type CallSignalHandlers, type CallSignalPayloads } from "./types.ts";

/** Denetleyicinin bağımlı olduğu en küçük arayüz (testte sahtesi yazılır). */
export interface SignalingLike {
  /** Kanala katılır; katılamazsa fırlatır. */
  join(): Promise<void>;
  send<E extends CallSignalEvent>(event: E, payload: CallSignalPayloads[E]): Promise<void>;
  leave(): void;
}

export class CallSignaling implements SignalingLike {
  private channel: RealtimeChannel | null = null;
  private subscribed = false;
  private readonly callId: string;
  private readonly handlers: CallSignalHandlers;

  constructor(callId: string, handlers: CallSignalHandlers) {
    this.callId = callId;
    this.handlers = handlers;
  }

  join(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const channel = supabase.channel(callTopic(this.callId), { config: { private: true, broadcast: { self: false } } });
      for (const event of CALL_SIGNAL_EVENTS) {
        channel.on("broadcast", { event }, ({ payload }) => this.dispatch(event, payload));
      }
      this.channel = channel;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("signaling_timeout"));
      }, CALL_JOIN_TIMEOUT_MS);
      channel.subscribe((status) => {
        this.subscribed = status === "SUBSCRIBED";
        if (settled) return;
        if (status === "SUBSCRIBED") {
          settled = true;
          clearTimeout(timer);
          resolve();
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          settled = true;
          clearTimeout(timer);
          reject(new Error("signaling_failed"));
        }
      });
    });
  }

  private dispatch<E extends CallSignalEvent>(event: E, raw: unknown): void {
    const handler = this.handlers[event] as ((payload: CallSignalPayloads[E]) => void) | undefined;
    if (!handler) return;
    const payload = parseSignalPayload(event, raw);
    if (payload) handler(payload);
  }

  async send<E extends CallSignalEvent>(event: E, payload: CallSignalPayloads[E]): Promise<void> {
    if (!this.channel || !this.subscribed) return;
    try {
      await this.channel.send({ type: "broadcast", event, payload });
    } catch {
      /* geçici ağ hatası: ICE/yeniden gönderme mekanizmaları telafi eder */
    }
  }

  leave(): void {
    const channel = this.channel;
    this.channel = null;
    this.subscribed = false;
    if (channel) void supabase.removeChannel(channel);
  }
}
