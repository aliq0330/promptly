import { createClient } from "@supabase/supabase-js";

/**
 * The one real, non-mock backend connection in this codebase (CLAUDE.md
 * section 17). This app is a fully static export (`output: "export"`) with
 * no server runtime — no middleware, no route handlers, no server actions —
 * so Supabase can only ever be talked to from the browser, using the public
 * anon key (safe to ship to the client by design; it only grants what RLS
 * policies allow, and no RLS policies exist yet — CLAUDE.md section 19).
 * Session persistence is handled by supabase-js itself via localStorage.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    "NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY eksik — .env.local dosyasını kontrol et (bkz. .env.example).",
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
