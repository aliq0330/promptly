/**
 * Ekip kütüphanesi — kişisel (kimlikli) OKUMA yüzeyi (docs/history/348-*): çağıranın ÜYE olduğu ekip kütüphaneleri ve onaylı promptları.
 * `me.ts` ile aynı desen: kimlik/rol/hız sınırı `MeBackend.withUser`'dadır, buradaki her sorgu çağıranın RLS'iyle çalışan `api_me_library_*`
 * (SECURITY INVOKER) RPC'lerine gider; ikinci bir kural yazılmaz. YALNIZ OKUR: onaylamak, değişken yazmak, prompt düzenlemek burada YOKTUR.
 *
 * Çıktı hazırdır: her prompt ekibin ortak değişkenleriyle doldurulmuş `filledText` ile gelir; ekipte değeri olmayan `{değişken}`ler
 * `missing`'dedir ve `filledText`'te jeton olarak AYNEN kalır (model/istemci kullanıcıdan ister).
 */
import { extractVariableTokenNames, resolvePromptText } from "../prompt-variables.ts";
import { sharePathFor } from "../share-link.ts";
import { isUuid } from "./prompts.ts";
import { PublicApiError } from "./rest.ts";
import type { MeTx } from "./me.ts";

export interface MeLibrary {
  id: string;
  title: string;
  description: string;
  /** Benim rolüm: owner | editor | viewer. */
  role: string;
  approvedCount: number;
  updatedAt: string;
  url: string;
}

export interface MeLibraryPrompt {
  id: string;
  title: string;
  /** Kütüphanedeki grup adı (ör. "Pazarlama"); grupsuzsa null. */
  group: string | null;
  approved: boolean;
  approvedAt: string | null;
  /** Ham metin, `{değişken}` jetonlarıyla. */
  text: string;
  variables: string[];
  /** Ekibin ortak değerleriyle doldurulmuş metin (eksik jetonlar aynen kalır). */
  filledText: string;
  /** Ekipte değeri olmayan değişkenler. */
  missing: string[];
}

export interface MeLibraryPrompts {
  library: Pick<MeLibrary, "id" | "title" | "role" | "url">;
  /** Ekibin ortak değişkenleri (yalnız üye görür; çağıran üyedir). */
  sharedVariables: { name: string; value: string }[];
  /** `true`: onaysız taslaklar da dahil. Varsayılan YALNIZ onaylılar. */
  includesUnapproved: boolean;
  prompts: MeLibraryPrompt[];
}

const iso = (value: unknown): string => (value instanceof Date ? value.toISOString() : String(value ?? ""));

function libraryUrl(siteUrl: string, id: string): string {
  return `${siteUrl}${sharePathFor("space", id)}`;
}

function libraryOf(row: Record<string, unknown>, siteUrl: string): MeLibrary {
  return {
    id: String(row.id),
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    role: String(row.role ?? ""),
    approvedCount: Number(row.approved_count ?? 0),
    updatedAt: iso(row.updated_at),
    url: libraryUrl(siteUrl, String(row.id)),
  };
}

/** Üyesi olduğum ekip kütüphaneleri (arşivlenmemiş; en çok 50). */
export async function listMyLibraries(tx: MeTx, siteUrl: string, options: { team?: string | null } = {}): Promise<{ items: MeLibrary[] }> {
  const team = options.team?.trim();
  // `team` = ekip kısa adı (docs/history/353-*): yalnız o ekibin kütüphanesi; ekip politikası (MCP kapalı/kitle/engel) SQL'de uygulanır.
  const rows = team ? await tx("select * from public.api_me_team_libraries($1)", [team]) : await tx("select * from public.api_me_libraries()");
  return { items: rows.map((row) => libraryOf(row, siteUrl)) };
}

/**
 * Bir ekip kütüphanesinin promptları, ekibin ortak değişkenleriyle doldurulmuş hâlde. Üyesi olmadığım ya da var olmayan kütüphane
 * `not_found` döner (varlığı sızmaz). Varsayılan YALNIZ onaylılar; `includeUnapproved` taslakları da getirir.
 */
export async function getLibraryPrompts(tx: MeTx, siteUrl: string, id: string, options: { includeUnapproved?: boolean } = {}): Promise<MeLibraryPrompts> {
  if (!isUuid(id)) throw new PublicApiError("bad_request", "id must be a team library UUID (from list_my_libraries).");
  const libraries = await listMyLibraries(tx, siteUrl);
  const library = libraries.items.find((item) => item.id === id);
  if (!library) throw new PublicApiError("not_found", "No such team library among your Spaces.");

  const includeUnapproved = options.includeUnapproved === true;
  const promptRows = await tx("select * from public.api_me_library_prompts($1::uuid, $2)", [id, includeUnapproved]);
  const variableRows = await tx("select * from public.api_me_library_variables($1::uuid)", [id]);
  const sharedVariables = variableRows.map((row) => ({ name: String(row.name), value: String(row.value ?? "") }));
  // Boş ortak değer "yok" demektir (sitedeki Doldur ve kopyala ile aynı kural).
  const values: Record<string, string> = {};
  for (const variable of sharedVariables) if (variable.value !== "") values[variable.name] = variable.value;

  const prompts = promptRows.map((row): MeLibraryPrompt => {
    const text = String(row.body ?? "");
    const tokens = extractVariableTokenNames(text);
    return {
      id: String(row.id),
      title: String(row.title ?? ""),
      group: row.group_name === null || row.group_name === undefined ? null : String(row.group_name),
      approved: row.approved_at !== null && row.approved_at !== undefined,
      approvedAt: row.approved_at ? iso(row.approved_at) : null,
      text,
      variables: tokens,
      filledText: resolvePromptText(text, values),
      missing: tokens.filter((name) => !Object.prototype.hasOwnProperty.call(values, name)),
    };
  });

  return { library: { id: library.id, title: library.title, role: library.role, url: library.url }, sharedVariables, includesUnapproved: includeUnapproved, prompts };
}
