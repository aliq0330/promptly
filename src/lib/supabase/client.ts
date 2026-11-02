import { createClient } from "@supabase/supabase-js";
import { announceNotice } from "@/lib/app-notice";
import { translateForRuntime } from "@/lib/i18n/translations";
import { guardAuthRefresh } from "./auth-refresh-guard";
import { createResilientStorage, describeStorageUsage } from "./resilient-storage";
import { friendlyServerErrors, tolerateMissingOptionalColumns } from "./server-errors";

/**
 * The one real, non-mock backend connection in this codebase (CLAUDE.md
 * section 17). This app is a fully static export (`output: "export"`) with
 * no server runtime — no middleware, no route handlers, no server actions —
 * so Supabase can only ever be talked to from the browser, using the public
 * anon key (safe to ship to the client by design; it only grants what RLS
 * policies allow — CLAUDE.md section 19 wrote those policies for every
 * table). Session persistence is handled by supabase-js itself via
 * localStorage.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY eksik — .env.local dosyasını kontrol et (bkz. .env.example).",
  );
}

/** `localStorage`/`sessionStorage` erişimi bazı tarayıcılarda (gizlilik kipi, engelli depolama) özellik okunurken bile hata verir; her zaman korunarak alınır. */
function browserStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return typeof window === "undefined" ? null : window[kind];
  } catch {
    return null;
  }
}

const localStore = browserStorage("localStorage");

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // Oturum depolaması dayanıklıdır (docs/history/320-*): `localStorage` yazması başarısız olursa (Safari'de kota dolu…) yenilenen oturum bellekte/`sessionStorage`'da
  // korunur — yoksa kütüphane aynı eski yenileme belirtecini tekrar tekrar gönderir, hız sınırına takılır ve kullanıcıyı çıkarır. Hata bir kez bildirilir.
  auth: {
    storage: createResilientStorage({
      local: localStore,
      session: browserStorage("sessionStorage"),
      onPersistFailure: (failure) => {
        const detail = `${failure.error} · ${localStore ? describeStorageUsage(localStore) : "?"}`;
        console.warn("[promptly] oturum kaydedilemedi", failure.error, failure.savedTo, detail);
        // Yenileme açılışta, dil ve bildirim kutusu yerleşmeden olabilir: metin gösterileceği ANDA (kullanıcının dilinde) kurulur.
        if (typeof window !== "undefined") window.setTimeout(() => announceNotice(translateForRuntime("error.authStorage", { detail }), 12000), 1500);
      },
    }),
  },
  // Veritabanı hata kodlarını (hız sınırı, engel…) kullanıcı dilinde cümleye çevirir; henüz canlıda olmayan isteğe bağlı sütunları çıkarıp yeniden dener.
  // Oturum yenileme istekleri `guardAuthRefresh` ile korunur: aynı belirteç tekrar tekrar gönderilmez, hız sınırı (429) oturumu silmez.
  global: { fetch: guardAuthRefresh(friendlyServerErrors(tolerateMissingOptionalColumns((input, init) => fetch(input, init)))) },
});
