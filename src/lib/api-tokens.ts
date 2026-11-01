/**
 * Kişisel API anahtarlarının saf yardımcıları (docs/history/313-*, 314-*): durum, sınırlar, seçenekler. Sunucu kuralları
 * (`supabase/migrations/20261102110000_api_tokens.sql`) asıl koruma; burası yalnız ekranın doğru seçenekleri göstermesi içindir.
 */

export type ApiTokenScope = "read" | "write";
export type ApiTokenStatus = "active" | "expired" | "revoked";

export interface ApiTokenRow {
  id: string;
  name: string;
  prefix: string;
  scopes: ApiTokenScope[];
  kind: "user" | "agent" | "bot";
  createdAt: string;
  expiresAt: string | null;
  lastUsedAt: string | null;
  revokedAt: string | null;
}

/** Kişi başına en çok etkin anahtar (sunucudaki `token_limit` ile aynı). */
export const API_TOKEN_ACTIVE_LIMIT = 10;
export const API_TOKEN_NAME_MAX = 60;

/** Süre seçenekleri (gün); `null` = süresiz. Sunucu yalnız bunları kabul eder, varsayılan 90. */
export const API_TOKEN_EXPIRY_OPTIONS: readonly (number | null)[] = [30, 90, 365, null];
export const API_TOKEN_DEFAULT_EXPIRY = 90;

/** Arayüzdeki iki hazır kapsam: okuma ya da okuma + kendi hesabına özel taslak yazma. */
export type ApiTokenPreset = "read" | "write";
export const API_TOKEN_PRESET_SCOPES: Record<ApiTokenPreset, ApiTokenScope[]> = { read: ["read"], write: ["read", "write"] };

export function apiTokenStatus(row: Pick<ApiTokenRow, "revokedAt" | "expiresAt">, now: number = Date.now()): ApiTokenStatus {
  if (row.revokedAt) return "revoked";
  if (row.expiresAt && new Date(row.expiresAt).getTime() <= now) return "expired";
  return "active";
}

export function activeApiTokenCount(rows: readonly ApiTokenRow[], now: number = Date.now()): number {
  return rows.filter((row) => apiTokenStatus(row, now) === "active").length;
}

export function canCreateApiToken(rows: readonly ApiTokenRow[], now: number = Date.now()): boolean {
  return activeApiTokenCount(rows, now) < API_TOKEN_ACTIVE_LIMIT;
}

export function isValidApiTokenName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 1 && trimmed.length <= API_TOKEN_NAME_MAX;
}

/** Ham anahtarın biçimi (`pmt_` + 43 karakter) — yalnız kopyalama ekranının "bu gerçekten bir anahtar" denetimi için. */
export const API_TOKEN_PATTERN = /^pmt_[A-Za-z0-9_-]{43}$/;

const SCOPES: readonly ApiTokenScope[] = ["read", "write"];

/** RPC satırı → arayüz satırı; bozuk satır (kimlik/ad yok) null döner ve listeden atılır. */
export function mapApiTokenRow(raw: Record<string, unknown>): ApiTokenRow | null {
  if (typeof raw.id !== "string" || typeof raw.name !== "string" || typeof raw.prefix !== "string") return null;
  const scopes = Array.isArray(raw.scopes) ? raw.scopes.filter((s): s is ApiTokenScope => SCOPES.includes(s as ApiTokenScope)) : [];
  const kind = raw.kind === "agent" || raw.kind === "bot" ? raw.kind : "user";
  const iso = (value: unknown): string | null => (typeof value === "string" && value ? value : null);
  return {
    id: raw.id,
    name: raw.name,
    prefix: raw.prefix,
    scopes: scopes.length ? scopes : ["read"],
    kind,
    createdAt: iso(raw.created_at) ?? new Date(0).toISOString(),
    expiresAt: iso(raw.expires_at),
    lastUsedAt: iso(raw.last_used_at),
    revokedAt: iso(raw.revoked_at),
  };
}
