import { SKILL_LICENSE_SPDX, renderSkillMd, skillDescription } from "./skill-md.ts";
import { decodeUtf8, describeSkillFile, scanScriptRisks, type ScriptRiskCode, type SkillFileInput } from "./package-validate.ts";
import type { SkillFileKind, SkillLicenseId as SkillLicense } from "./limits.ts";

/**
 * Yayın paketinin içeriği (docs/skill-plani.md §2, docs/history/389-*): `SKILL.md` + `metadata.json` + `LICENSE` Promptly'nin YAZDIĞI dosyalar,
 * gerisi yazarın dosyaları. Saf ve bağımlılıksızdır (Node + tarayıcı + Edge). ZIP baytlarını `package-zip.ts` üretir; burada yalnız
 * dosya listesi, `sha256` ve `manifest` hesaplanır.
 */

export const SKILL_MANIFEST_SCHEMA = 1;

export interface SkillManifestFile {
  path: string;
  kind: SkillFileKind;
  size: number;
  sha256: string;
  script: boolean;
  /** Yalnız betiklerde ve yalnız eşleşme varsa: otomatik risk işaretleri (`scanScriptRisks`; bilgilendirici, kesin değil). */
  risks?: ScriptRiskCode[];
}

/** `skill_versions.manifest` (jsonb): paketteki yazar dosyalarının listesi. Okuyucular dosya listesini buradan görür. */
export interface SkillManifest {
  schema: number;
  name: string;
  version: string;
  license: SkillLicense;
  files: SkillManifestFile[];
}

export interface SkillPackageSource {
  slug: string;
  title: string;
  summary: string;
  instructions: string;
  category: string | null;
  compat: readonly string[];
  license: SkillLicense;
  authorUsername: string | null;
  tags: readonly string[];
}

export interface PackageBuildInput {
  skill: SkillPackageSource;
  version: string;
  changelog: string;
  /** Promptly'deki Skill bağlantısı (varsa); `SKILL.md` frontmatter'ına atıf olarak yazılır. */
  sourceUrl: string | null;
  files: readonly SkillFileInput[];
}

export interface PackageEntry {
  /** Paket kökünden göreli yol (`{slug}/` öneki ZIP katmanında eklenir). */
  path: string;
  bytes: Uint8Array;
}

export interface BuiltPackage {
  entries: PackageEntry[];
  manifest: SkillManifest;
}

const encoder = new TextEncoder();

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * LICENSE: SPDX kimliği + resmî metnin bağlantısı (tam metin DEĞİL). "Tüm hakları saklı" lisansında yalnız o cümle. Yazar adı/atıf yazılır;
 * hukuki metin gözden geçirmesi açılış maddesindedir (docs/yapilacaklar.md).
 */
export function renderLicenseFile(license: SkillLicense, authorUsername: string | null, sourceUrl: string | null): string {
  const lines: string[] = [];
  if (license === "proprietary") {
    lines.push("All rights reserved.", "", "This Skill is shared for use by the people who obtained it from Promptly. Redistribution requires the author's permission.");
  } else {
    const spdx = SKILL_LICENSE_SPDX[license];
    lines.push(`SPDX-License-Identifier: ${spdx}`, "", `This Skill is licensed under ${spdx}.`, `Full license text: https://spdx.org/licenses/${spdx}.html`);
  }
  if (authorUsername) lines.push("", `Author: @${authorUsername}`);
  if (sourceUrl) lines.push(`Source: ${sourceUrl}`);
  return `${lines.join("\n")}\n`;
}

export async function buildPackage(input: PackageBuildInput): Promise<BuiltPackage> {
  const sorted = [...input.files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const manifestFiles: SkillManifestFile[] = [];
  for (const file of sorted) {
    const info = describeSkillFile(file.path);
    const entry: SkillManifestFile = { path: file.path, kind: info.kind, size: file.bytes.length, sha256: await sha256Hex(file.bytes), script: info.isScript };
    if (info.isScript) {
      const text = decodeUtf8(file.bytes);
      const risks = text === null ? [] : scanScriptRisks(text);
      if (risks.length > 0) entry.risks = risks;
    }
    manifestFiles.push(entry);
  }
  const { skill } = input;
  const manifest: SkillManifest = { schema: SKILL_MANIFEST_SCHEMA, name: skill.slug, version: input.version, license: skill.license, files: manifestFiles };

  const skillMd = renderSkillMd({
    slug: skill.slug,
    summary: skill.summary,
    instructions: skill.instructions,
    license: skill.license,
    version: input.version,
    authorUsername: skill.authorUsername,
    sourceUrl: input.sourceUrl,
  });
  const metadata = {
    schema: SKILL_MANIFEST_SCHEMA,
    name: skill.slug,
    title: skill.title,
    description: skillDescription(skill.summary),
    version: input.version,
    license: SKILL_LICENSE_SPDX[skill.license],
    category: skill.category,
    compat: [...skill.compat],
    tags: [...skill.tags],
    author: skill.authorUsername,
    source: input.sourceUrl,
    changelog: input.changelog.trim(),
    files: manifestFiles.map(({ path, size, sha256 }) => ({ path, size, sha256 })),
  };

  const entries: PackageEntry[] = [
    { path: "SKILL.md", bytes: encoder.encode(skillMd) },
    { path: "metadata.json", bytes: encoder.encode(`${JSON.stringify(metadata, null, 2)}\n`) },
    { path: "LICENSE", bytes: encoder.encode(renderLicenseFile(skill.license, skill.authorUsername, input.sourceUrl)) },
    ...sorted.map((file) => ({ path: file.path, bytes: file.bytes })),
  ];
  return { entries, manifest };
}
