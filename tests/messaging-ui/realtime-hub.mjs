// Phoenix (Supabase Realtime, vsn 2.0.0) protokolünün bellek içi taklidi: birden fazla tarayıcı bağlamı (kullanıcı) aynı "sunucuya" bağlanır.
// - phx_join: postgres_changes bağlamalarına kimlik atar ve `ok` döner; private kanal için `authorize(topic, userId)` ret verebilir.
// - broadcast: aynı konuya katılmış DİĞER istemcilere iletilir (self: false). İkili (kind 3) itme çerçeveleri çözülüp metin olarak iletilir.
// - emitPostgresChange: tabloya/filtreye uyan bağlamalara `postgres_changes` olayı gönderir.
// Gerçek Supabase'e/Realtime'a karşı DENENMEDİ; bu yalnızca istemci mantığını (kanal adı, private bayrağı, temizlik, TTL) sınar.
export function createRealtimeHub({ authorize = () => true } = {}) {
  const clients = new Set();
  let nextId = 1000;
  const log = []; // { userId, event, topic }
  const hub = {
    clients,
    log,
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
      ws.onClose(() => clients.delete(client));
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
          return reply("ok", { postgres_changes: bindings });
        }
        if (event === "phx_leave") { client.topics.delete(topic); return reply("ok"); }
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
