/**
 * Ekip sohbeti saf kuralları (docs/history/369-*): kanalları "ekip kanalları" ve "projeler" olarak gruplar, sessizliğin KAYNAĞINI adlandırır.
 * Sessizliğin kendisi sunucuda çözülür (`_team_channel_mute_scope`: ekip → proje → kanal); burası yalnız onun gösterimidir. Saf: ağ/arayüz yok.
 */

export type TeamMuteScope = "team" | "project" | "channel";

/** `TeamChannel`'ın bu modülün okuduğu en küçük şekli (veri katmanına bağımlılık yok; test düz nesneyle çalışır). */
export interface HubChannel {
  id: string;
  name: string;
  mode: string;
  archivedAt: string | null;
  unreadCount: number;
  lastMessageAt: string | null;
  muteScope?: TeamMuteScope | null;
  projectId?: string | null;
  projectTitle?: string | null;
  fileId?: string | null;
  fileTitle?: string | null;
  projectMain?: boolean;
}

/** Kanalın türü: ekip kanalı, proje ana kanalı, dosya kanalı, projenin adlı ek kanalı. */
export type ChannelKind = "team" | "main" | "file" | "extra";

export function channelKind(channel: Pick<HubChannel, "projectId" | "projectMain" | "fileId">): ChannelKind {
  if (!channel.projectId) return "team";
  if (channel.projectMain) return "main";
  return channel.fileId ? "file" : "extra";
}

export interface HubProject<T extends HubChannel> {
  projectId: string;
  title: string;
  /** Ana kanal önce, sonra dosya ve ek kanallar (sunucu sırası korunur). */
  channels: T[];
  unread: number;
  /** Projenin TÜM kanalları ekip ya da proje düzeyinde sessizse true (tek tek kanal sessizliği projeyi sessiz yapmaz). */
  muted: boolean;
  /** Sessizliğin projeye etki eden kaynağı: "team" önceliklidir (ekip sessizken proje ayrıca sessiz olsa da asıl neden ekiptir). */
  muteScope: "team" | "project" | null;
  lastMessageAt: string | null;
}

export interface TeamHubGroups<T extends HubChannel> {
  teamChannels: T[];
  projects: HubProject<T>[];
}

/** Ekibin arşivlenmemiş kanallarını sayfa için gruplar. Proje sırası ilk görülme sırasıdır (sunucu proje açılış sırasına göre verir). */
export function groupTeamChannels<T extends HubChannel>(channels: readonly T[]): TeamHubGroups<T> {
  const teamChannels: T[] = [];
  const byProject = new Map<string, T[]>();
  for (const channel of channels) {
    if (channel.archivedAt) continue;
    if (!channel.projectId) {
      teamChannels.push(channel);
      continue;
    }
    const list = byProject.get(channel.projectId) ?? [];
    list.push(channel);
    byProject.set(channel.projectId, list);
  }
  const projects: HubProject<T>[] = [];
  for (const [projectId, list] of byProject) {
    const ordered = [...list].sort((a, b) => Number(Boolean(b.projectMain)) - Number(Boolean(a.projectMain)));
    const scopes = ordered.map((channel) => channel.muteScope ?? null);
    const everyBroadMuted = scopes.length > 0 && scopes.every((scope) => scope === "team" || scope === "project");
    projects.push({
      projectId,
      title: ordered.find((channel) => channel.projectTitle)?.projectTitle ?? ordered[0].name,
      channels: ordered,
      unread: ordered.reduce((sum, channel) => sum + (channel.muteScope ? 0 : channel.unreadCount), 0),
      muted: everyBroadMuted,
      muteScope: scopes.includes("team") ? "team" : everyBroadMuted ? "project" : null,
      lastMessageAt: ordered.map((channel) => channel.lastMessageAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null,
    });
  }
  return { teamChannels, projects };
}

/** Ekibin tamamı sessiz mi: hiçbir kanal "team" dışı kaynakla sessiz değil ve en az bir kanal "team" kaynaklı sessiz. */
export function teamIsMuted(channels: readonly HubChannel[]): boolean {
  return channels.some((channel) => channel.muteScope === "team");
}

/** Okunmamış rozeti sessiz kanalda gösterilmez (sunucu da 0 döner; eski sunucu için istemci de eler). */
export function visibleUnread(channel: Pick<HubChannel, "unreadCount" | "muteScope">): number {
  return channel.muteScope ? 0 : channel.unreadCount;
}

/**
 * Mesajlar listesindeki ekip satırının ikinci satırı: ekip kanallarının adları ("genel, duyurular, mimari"), ardından proje sayısı.
 * Yalnız arşivlenmemiş kanallar; en çok `max` ad, fazlası "+N".
 */
export function summarizeTeamRow(channels: readonly HubChannel[], max = 3): { names: string[]; extra: number; projects: number } {
  const groups = groupTeamChannels(channels);
  const names = groups.teamChannels.map((channel) => channel.name);
  return { names: names.slice(0, max), extra: Math.max(0, names.length - max), projects: groups.projects.length };
}

/** Mesajlar'dan açılan ekip sayfası ya da (projeId verilirse) proje sayfası. Telefonda tam sayfa, masaüstünde sağ bölme. */
export function teamHubHref(teamId: string, projectId?: string | null): string {
  return `/messages/local?hub=team&team=${encodeURIComponent(teamId)}${projectId ? `&project=${encodeURIComponent(projectId)}` : ""}`;
}

/** Mesajlar'dan açılan topluluk sayfası (odalar listesi); `id` topluluğun sohbet kimliğidir. */
export function communityHubHref(communityId: string): string {
  return `/messages/local?hub=community&id=${encodeURIComponent(communityId)}`;
}

/** Bir kanalın "geri" hedefi: proje kanalı proje sayfasına, ekip kanalı ekip sayfasına döner. */
export function channelBackHref(team: { id: string; projectId?: string | null }): string {
  return teamHubHref(team.id, team.projectId ?? null);
}

/** Ekip sayfası adresinde kanalı gösteren parametre: proje kanalında ad projeler arasında çakışabilir, bu yüzden kimlik; ekip kanalında ad. */
export function channelParam(channel: { id: string; name: string; projectId?: string | null }): string {
  return channel.projectId ? channel.id : channel.name;
}

/**
 * Ekip kanallarının KARIŞIK listelerinde (ekip bilgi sayfası, ekip sayfası Sohbet sekmesi) gösterilen ad: ekip kanalı adı, proje ana kanalı projenin başlığı,
 * dosya kanalı "Proje · Dosya", ek kanal "Proje · #ad". Proje kanallarının adı yalnızca projesinde tek olduğu için tek başına anlamlı değildir.
 */
export function channelLabel(channel: Pick<HubChannel, "name" | "projectId" | "projectMain" | "fileId" | "projectTitle" | "fileTitle">): string {
  const kind = channelKind(channel);
  if (kind === "team") return channel.name;
  const project = channel.projectTitle ?? channel.name;
  if (kind === "main") return project;
  if (kind === "file") return `${project} · ${channel.fileTitle ?? channel.name}`;
  return `${project} · #${channel.name}`;
}
