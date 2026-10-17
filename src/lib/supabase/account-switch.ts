import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";
import type { UserProfile } from "@/types";
import { fetchOwnProfile } from "./profiles";

/**
 * Site sahibi (`aliq`) için demo hesaplar arasında hızlı geçiş. Asıl yetki kontrolü `switch-account`
 * Edge Function'ındadır (kullanıcı adı + moderatör rolü + yalnız demo hesap hedefleri); buradaki
 * kontroller yalnız menüyü gizler. Geçişten önce sahibin oturumu bu tarayıcıda tutulur ki "aliq'a dön"
 * şifresiz çalışsın; yalnız bu tarayıcıda, çıkış yapınca silinir.
 */
export const SWITCH_OWNER_USERNAME = "aliq";
const ORIGIN_KEY = "promptly-switch-origin";
const DEMO_ACCOUNT_COUNT = 18;

/** Seed'in demo hesap kimlikleri (`supabase/seed/demo-users.sql`); sunucu aynı deseni zorlar. */
export const DEMO_ACCOUNT_IDS = Array.from({ length: DEMO_ACCOUNT_COUNT }, (_, i) => `5eed0000-0000-4000-8000-${(i + 1).toString(16).padStart(12, "0")}`);

interface StoredOrigin {
  access_token: string;
  refresh_token: string;
}

function readOrigin(): StoredOrigin | null {
  try {
    const raw = window.localStorage.getItem(ORIGIN_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<StoredOrigin>) : null;
    return parsed?.access_token && parsed.refresh_token ? { access_token: parsed.access_token, refresh_token: parsed.refresh_token } : null;
  } catch {
    return null;
  }
}

export function hasSwitchOrigin(): boolean {
  return readOrigin() !== null;
}

export function clearSwitchOrigin() {
  try {
    window.localStorage.removeItem(ORIGIN_KEY);
  } catch {
    /* depolama kapalı */
  }
}

/** Demo hesapların profilleri (ad sırasıyla). */
export async function fetchDemoAccounts(): Promise<UserProfile[]> {
  const profiles = await Promise.all(DEMO_ACCOUNT_IDS.map((id) => fetchOwnProfile(id)));
  return profiles.filter((p): p is UserProfile => p !== null).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** Seçilen demo hesaba geçer; ilk geçişte sahibin oturumunu geri dönüş için saklar. */
export async function switchToDemoAccount(targetId: string): Promise<void> {
  const { data: current } = await supabase.auth.getSession();
  const session = current.session;
  if (!session) throw new Error(translateForRuntime("accountSwitch.error"));

  const { data, error } = await supabase.functions.invoke("switch-account", { body: { targetId } });
  if (error || !data?.access_token) throw new Error(translateForRuntime("accountSwitch.error"));

  // Sahibin oturumunu YALNIZ sahibin kendisiyken sakla (demo hesaptan demo hesaba geçerken üzerine yazılmaz).
  if (!readOrigin()) {
    try {
      window.localStorage.setItem(ORIGIN_KEY, JSON.stringify({ access_token: session.access_token, refresh_token: session.refresh_token }));
    } catch {
      throw new Error(translateForRuntime("accountSwitch.error"));
    }
  }

  const { error: sessionError } = await supabase.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
  if (sessionError) throw new Error(translateForRuntime("accountSwitch.error"));
}

/** Saklanan sahip oturumuna döner; oturum geçersizse sahip yeniden giriş yapmalıdır. */
export async function returnToOwnAccount(): Promise<void> {
  const origin = readOrigin();
  if (!origin) throw new Error(translateForRuntime("accountSwitch.returnError"));
  const { error } = await supabase.auth.setSession(origin);
  clearSwitchOrigin();
  if (error) {
    await supabase.auth.signOut();
    throw new Error(translateForRuntime("accountSwitch.returnError"));
  }
}
