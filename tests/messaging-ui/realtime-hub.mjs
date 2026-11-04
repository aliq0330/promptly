// Phoenix (Supabase Realtime, vsn 2.0.0) protokolünün bellek içi taklidi: birden fazla tarayıcı bağlamı (kullanıcı) aynı "sunucuya" bağlanır.
// - phx_join: postgres_changes bağlamalarına kimlik atar ve `ok` döner; private kanal için `authorize(topic, userId)` ret verebilir.
// - broadcast: aynı konuya katılmış DİĞER istemcilere iletilir (self: false). İkili (kind 3) itme çerçeveleri çözülüp metin olarak iletilir.
// - emitPostgresChange: tabloya/filtreye uyan bağlamalara `postgres_changes` olayı gönderir.
// Gerçek Supabase'e/Realtime'a karşı DENENMEDİ; bu yalnızca istemci mantığını (kanal adı, private bayrağı, temizlik, TTL) sınar.
// - presence (docs/history/329-*): `track`/`untrack` (yazma `authorizeWrite(topic, userId)` ile; reddedilirse hata), katılan ve presence'ı
//   açık istemciye `presence_state`, sonra her değişiklikte `presence_diff`; kanaldan çıkan/bağlantısı kapanan istemcinin kaydı düşer.
export function createRealtimeHub({ authorize = () => true, authorizeWrite = () => true } = {}) {
  const clients = new Set();
  const presence = new Map(); // topic -> Map<client, { key, meta }>
  let nextId = 1000;
  const log = []; // { userId, event, topic }
  let presenceRef = 1;
  const presenceStateOf = (topic) => {
    const out = {};
    for (const { key, meta } of presence.get(topic)?.values() ?? []) (out[key] ??= { metas: [] }).metas.push(meta);
    return out;
  };
  const sendDiff = (topic, joins, leaves) => {
    for (const c of clients) {
      const ch = c.topics.get(topic);
      if (ch && ch.config?.presence?.enabled) c.ws.send(JSON.stringify([null, null, topic, "presence_diff", { joins, leaves }]));
    }
  };
  const dropPresence = (client, topic) => {
    const entry = presence.get(topic)?.get(client);
    if (!entry) return;
    presence.get(topic).delete(client);
    sendDiff(topic, {}, { [entry.key]: { metas: [entry.meta] } });
  };
  const hub = {
    clients,
    log,
    /** Bir konudaki presence anahtarları (izlenen kişiler). */
    presenceKeys: (topic) => [...(presence.get(topic)?.values() ?? [])].map((e) => e.key),
    /** Sunucunun kanalı kapatması (yetki gitti / bağlantı hatası): istemcilere phx_error gönderilir, kayıtları düşer. */
    kick(topic) {
      for (const c of clients) {
        const ch = c.topics.get(topic);
        if (!ch) continue;
        dropPresence(c, topic);
        c.topics.delete(topic);
        c.ws.send(JSON.stringify([ch.joinRef, ch.joinRef, topic, "phx_error", {}]));
      }
    },
    joinedTopics: (userId) => [...clients].filter((c) => c.userId === userId).flatMap((c) => [...c.topics.keys()]),
    /** Bir tabloda değişiklik yayınla: `record` filtreyle (örn. conversation_id=eq.X) eşleşen bağlamalara. */
    emitPostgresChange(table, type, record, { only } = {}) {
      for (const c of clients) {
        if (only && c.userId !== only) continue;
        for (const [topic, ch] of c.topics) {
          for (const b of ch.bindings) {
            if (b.table !== table || (b.event !== "*" && b.event !== type)) continue;
            if (b.filter) {
              const m = b.filter.match(/^(\w+)=eq\.(.+)$/);
              if (m && String(record[m[1]]) !== m[2]) continue;
            }
            c.ws.send(JSON.stringify([null, null, topic, "postgres_changes", { ids: [b.id], data: { schema: "public", table, commit_timestamp: new Date().toISOString(), type, record, old_record: {}, columns: [], errors: null } }]));
          }
        }
      }
    },
    /** Sunucu tarafı bir yayın (broadcast) gönder. */
    emitBroadcast(topic, event, payload) {
      for (const c of clients) if (c.topics.has(topic)) c.ws.send(JSON.stringify([null, null, topic, "broadcast", { type: "broadcast", event, payload }]));
    },
  };

  hub.install = async (context, userId) => {
    await context.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
      const client = { ws, userId, topics: new Map() };
      clients.add(client);
      ws.onClose(() => {
        for (const topic of [...client.topics.keys()]) dropPresence(client, topic);
        clients.delete(client);
      });
      ws.onMessage((raw) => {
        if (typeof raw !== "string") {
          // kind 3 = userBroadcastPush: [kind, joinRefLen, refLen, topicLen, userEventLen, metaLen, encoding, ...strings, payload]
          const b = Buffer.from(raw);
          const [, joinLen, refLen, topicLen, evLen, metaLen, encoding] = b;
          let o = 7 + joinLen + refLen;
          const topic = b.subarray(o, o + topicLen).toString(); o += topicLen;
          const userEvent = b.subarray(o, o + evLen).toString(); o += evLen + metaLen;
          const payload = encoding === 1 ? JSON.parse(b.subarray(o).toString()) : null;
          const entry = { userId, event: `broadcast:${userEvent}`, topic, payload };
          log.push(entry);
          if (hub.dropWhen?.(entry)) return; // test: iletimi düşür (ağ kaybı taklidi)
          for (const other of clients) if (other !== client && other.topics.has(topic)) other.ws.send(JSON.stringify([null, null, topic, "broadcast", { type: "broadcast", event: userEvent, payload }]));
          return;
        }
        const [joinRef, ref, topic, event, payload] = JSON.parse(raw);
        log.push({ userId, event, topic, payload });
        const reply = (status, response = {}) => ws.send(JSON.stringify([joinRef, ref, topic, "phx_reply", { status, response }]));
        if (topic === "phoenix") return reply("ok");
        if (event === "phx_join") {
          const cfg = payload?.config ?? {};
          if (cfg.private && !authorize(topic, userId)) return reply("error", { reason: "Unauthorized: You do not have permissions to read from this Channel topic" });
          const bindings = (cfg.postgres_changes ?? []).map((b) => ({ ...b, id: nextId++ }));
          client.topics.set(topic, { joinRef, bindings, config: cfg });
          reply("ok", { postgres_changes: bindings });
          if (cfg.presence?.enabled) ws.send(JSON.stringify([joinRef, null, topic, "presence_state", presenceStateOf(topic)]));
          return;
        }
        if (event === "phx_leave") { dropPresence(client, topic); client.topics.delete(topic); return reply("ok"); }
        if (event === "presence") {
          const ch = client.topics.get(topic);
          if (!ch) return reply("error", { reason: "not joined" });
          if (payload?.event === "track") {
            if (!authorizeWrite(topic, userId)) return reply("error", { reason: "Unauthorized: You do not have permissions to write to this Channel topic" });
            dropPresence(client, topic);
            const key = ch.config?.presence?.key || `anon-${presenceRef}`;
            const meta = { ...(payload.payload ?? {}), phx_ref: String(presenceRef++) };
            if (!presence.has(topic)) presence.set(topic, new Map());
            presence.get(topic).set(client, { key, meta });
            sendDiff(topic, { [key]: { metas: [meta] } }, {});
            return reply("ok");
          }
          if (payload?.event === "untrack") { dropPresence(client, topic); return reply("ok"); }
          return reply("ok");
        }
        if (event === "broadcast") {
          // Metin biçimli broadcast (ikili olmayan): diğerlerine ilet
          for (const other of clients) if (other !== client && other.topics.has(topic)) other.ws.send(JSON.stringify([null, null, topic, "broadcast", payload]));
          return;
        }
        if (ref) reply("ok");
      });
    });
  };
  return hub;
}
