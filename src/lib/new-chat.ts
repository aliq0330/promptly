/**
 * Pure rules behind the "Yeni sohbet" picker. Nothing here touches the
 * network: the caller loads follows / conversation partners / followers and
 * (optionally) the ids the server says can be messaged, and these helpers
 * decide what is listed and what happens when a person is picked.
 */

export interface ChatPerson {
  id: string;
  displayName: string;
  username: string;
}

export interface ChatPartner<P extends ChatPerson> {
  profile: P;
  /** When the conversation with this person last had a message (ISO). */
  lastMessageAt: string;
}

export interface NewChatSections<P extends ChatPerson> {
  /** "Takip ettiklerim" — people the viewer follows. */
  followed: P[];
  /** "Etkileşimde bulunduklarım" — conversation partners, then followers, minus everyone already in `followed`. */
  interactions: P[];
}

export const NEW_CHAT_SECTION_LIMIT = 30;

const byName = (a: ChatPerson, b: ChatPerson) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });

function newest(a: { lastMessageAt: string }, b: { lastMessageAt: string }): number {
  return new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime();
}

/**
 * The picker's default (not searching) lists.
 *
 * "Etkileşim" is defined from data that already exists and nothing vaguer:
 * people the viewer already has a conversation with (any state), and people
 * who follow the viewer. Anyone already shown under "Takip ettiklerim" is left
 * out of it; the viewer, people the viewer blocked, and duplicates never
 * appear. When the server reported who can be messaged (`messageableIds`),
 * people it left out are dropped — except existing conversation partners,
 * who can always be reopened.
 */
export function buildNewChatSections<P extends ChatPerson>(input: {
  selfId: string;
  followed: readonly P[];
  partners: readonly ChatPartner<P>[];
  followers: readonly P[];
  blockedIds: ReadonlySet<string>;
  messageableIds?: ReadonlySet<string> | null;
  limit?: number;
}): NewChatSections<P> {
  const limit = input.limit ?? NEW_CHAT_SECTION_LIMIT;
  const partnerById = new Map(input.partners.map((partner) => [partner.profile.id, partner]));
  const allowed = (person: P) =>
    person.id !== input.selfId &&
    !input.blockedIds.has(person.id) &&
    (!input.messageableIds || input.messageableIds.has(person.id) || partnerById.has(person.id));

  const seen = new Set<string>();
  const take = (person: P): boolean => {
    if (seen.has(person.id) || !allowed(person)) return false;
    seen.add(person.id);
    return true;
  };

  const followedList = input.followed
    .filter(take)
    .sort((a, b) => {
      const pa = partnerById.get(a.id);
      const pb = partnerById.get(b.id);
      if (pa && pb) return newest(pa, pb);
      if (pa) return -1;
      if (pb) return 1;
      return byName(a, b);
    })
    .slice(0, limit);

  // `seen` already holds every followed person (even ones past the limit), so they can't reappear below.
  const partnerList = [...input.partners].sort(newest).map((partner) => partner.profile).filter(take);
  const followerList = [...input.followers].sort(byName).filter(take);

  return { followed: followedList, interactions: [...partnerList, ...followerList].slice(0, limit) };
}

export type NewChatTarget =
  /** A conversation with this person already exists (any state) — open it, never create a second one. */
  | { kind: "open"; conversationId: string }
  /** No conversation yet: go to the empty composer; the conversation is created with the first real message. */
  | { kind: "draft" }
  /** The viewer blocked this person. */
  | { kind: "blocked-by-me" }
  /** Privacy, or a block the other way — deliberately not told apart. */
  | { kind: "unavailable" };

/**
 * What happens when a person is picked. `messageableIds` is the server's
 * answer for that person (`filter_messageable_users`); it is the authority,
 * the UI only reflects it. An existing conversation always opens (the thread
 * itself enforces blocks on send).
 */
export function resolveNewChatTarget(input: {
  personId: string;
  conversationIdByUserId: ReadonlyMap<string, string>;
  blockedIds: ReadonlySet<string>;
  messageableIds: ReadonlySet<string>;
}): NewChatTarget {
  const existing = input.conversationIdByUserId.get(input.personId);
  if (existing) return { kind: "open", conversationId: existing };
  if (input.blockedIds.has(input.personId)) return { kind: "blocked-by-me" };
  if (!input.messageableIds.has(input.personId)) return { kind: "unavailable" };
  return { kind: "draft" };
}
