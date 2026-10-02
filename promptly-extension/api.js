// Promptly Extension — Supabase istemcisi (bağımlılıksız, fetch tabanlı).
// Auth: GoTrue REST; kullanıcı adıyla giriş: mevcut `username-login` Edge Function.
// Oturum chrome.storage.local'da tutulur.

const PromptlyApi = (() => {
  const { supabaseUrl, supabaseAnonKey, siteUrl } = PROMPTLY_CONFIG;
  const SESSION_KEY = "session";

  const baseHeaders = { apikey: supabaseAnonKey, "Content-Type": "application/json" };

  function decodeJwt(token) {
    try {
      const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(decodeURIComponent(escape(atob(payload))));
    } catch {
      return {};
    }
  }

  async function storeSession(tokens) {
    const claims = decodeJwt(tokens.access_token);
    const session = {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: claims.exp || 0,
      userId: claims.sub || "",
      email: claims.email || "",
    };
    await chrome.storage.local.set({ [SESSION_KEY]: session });
    return session;
  }

  async function login(identifier, password) {
    const id = identifier.trim();
    let res;
    if (id.includes("@")) {
      res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: baseHeaders,
        body: JSON.stringify({ email: id, password }),
      });
    } else {
      res = await fetch(`${supabaseUrl}/functions/v1/username-login`, {
        method: "POST",
        headers: { ...baseHeaders, Authorization: `Bearer ${supabaseAnonKey}` },
        body: JSON.stringify({ identifier: id, password }),
      });
    }
    if (res.status === 429) throw new Error(PromptlyI18n.t("tooManyAttempts"));
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) throw new Error(PromptlyI18n.t("invalidCredentials"));
    return storeSession(data);
  }

  async function logout() {
    await chrome.storage.local.remove(SESSION_KEY);
  }

  async function refresh(session) {
    const res = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: baseHeaders,
      body: JSON.stringify({ refresh_token: session.refreshToken }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.access_token) {
      await logout();
      return null;
    }
    return storeSession(data);
  }

  // Geçerli oturumu döndürür (süresi dolmak üzereyse yeniler), yoksa null.
  async function getSession() {
    const stored = (await chrome.storage.local.get(SESSION_KEY))[SESSION_KEY];
    if (!stored) return null;
    if (stored.expiresAt - 60 > Date.now() / 1000) return stored;
    return refresh(stored);
  }

  async function getProfile(session) {
    const res = await fetch(
      `${supabaseUrl}/rest/v1/profiles?select=username,display_name&id=eq.${session.userId}`,
      { headers: { ...baseHeaders, Authorization: `Bearer ${session.accessToken}` } },
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows[0] || null;
  }

  function authHeaders(session, extra) {
    return { ...baseHeaders, Authorization: `Bearer ${session.accessToken}`, ...extra };
  }

  // Etiket kataloğunda ara (herkese açık okuma). Boş sorgu → en çok kullanılanlar.
  async function searchTags(query, limit = 8) {
    const session = await getSession();
    const q = query.trim().replace(/[%,()*]/g, " ");
    const filter = q ? `&label=ilike.*${encodeURIComponent(q)}*` : "";
    const res = await fetch(
      `${supabaseUrl}/rest/v1/tags?select=slug,label&order=usage_count.desc&limit=${limit}${filter}`,
      { headers: session ? authHeaders(session) : baseHeaders },
    );
    return res.ok ? res.json() : [];
  }

  // Yeni etiket: tek yazma yolu sunucudaki doğrulamalı RPC (tags'e doğrudan INSERT yok).
  async function getOrCreateTag(session, label) {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_or_create_tag`, {
      method: "POST",
      headers: authHeaders(session),
      body: JSON.stringify({ p_label: label }),
    });
    const row = await res.json().catch(() => null);
    return res.ok && row && row.slug ? { slug: row.slug, label: row.label } : null;
  }

  // Yakalanan metni Promptly'de prompt olarak kaydeder (varsayılan: taslak).
  // tags: [{slug,label}] (var olan) veya [{label,isNew:true}] (oluşturulacak).
  async function savePrompt({ title, text, contentType, category, subcategory, tags, sourceUrl, publish }) {
    const session = await getSession();
    if (!session) throw new Error(PromptlyI18n.t("sessionExpired"));

    const res = await fetch(`${supabaseUrl}/rest/v1/prompts`, {
      method: "POST",
      headers: authHeaders(session, { Prefer: "return=representation" }),
      body: JSON.stringify({
        author_id: session.userId,
        title: title.trim(),
        description: sourceUrl ? `${PromptlyI18n.t("sourcePrefix")}: ${sourceUrl}` : "",
        prompt_text: text.trim(),
        content_type: contentType,
        category: category || null,
        subcategory: category ? subcategory || null : null,
        tools: [],
        status: publish ? "published" : "draft",
        origin_type: "original",
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !Array.isArray(data) || !data[0]) {
      throw new Error((data && data.message) || PromptlyI18n.t("saveFailed"));
    }
    const id = data[0].id;

    // Etiketler: siteyle aynı kural — başarısız olursa prompt yine de kayıtlıdır.
    if (tags && tags.length) {
      try {
        const resolved = [];
        for (const tag of tags) {
          resolved.push(tag.isNew ? await getOrCreateTag(session, tag.label) : tag);
        }
        const rows = resolved
          .filter(Boolean)
          .filter((t, i, arr) => arr.findIndex((o) => o.slug === t.slug) === i)
          .map((t) => ({ prompt_id: id, tag_slug: t.slug, source: "manual" }));
        if (rows.length) {
          await fetch(`${supabaseUrl}/rest/v1/prompt_tags`, {
            method: "POST",
            headers: authHeaders(session),
            body: JSON.stringify(rows),
          });
        }
      } catch (err) {
        console.error("[promptly-ext] tags", err);
      }
    }

    return {
      id,
      url: publish ? `${siteUrl}/prompts/local/?id=${id}` : `${siteUrl}/create/?edit=${id}`,
    };
  }

  return { login, logout, getSession, getProfile, searchTags, savePrompt };
})();
