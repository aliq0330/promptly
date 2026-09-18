import { notFound } from "next/navigation";
import { ProfileView } from "@/features/profile/profile-view";
import { getUserByUsername, mockUsers } from "@/mocks/users";
import { getPromptsByAuthor } from "@/mocks/prompts";
import { getConversationWithUser } from "@/mocks/conversations";

export function generateStaticParams() {
  return mockUsers.map((user) => ({ username: user.username }));
}

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const user = getUserByUsername(username);
  if (!user) notFound();

  const isOwnProfile = user.id === "me";

  // Everyone but the owner only ever sees published prompts — drafts have
  // no place on a public profile even though the mock data has no draft
  // rows to filter yet (CLAUDE.md section 8: prompt creation never
  // persists a real draft either).
  const authorPrompts = getPromptsByAuthor(user.id)
    .filter((prompt) => isOwnProfile || prompt.status === "published")
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const conversation = isOwnProfile ? undefined : getConversationWithUser(user.id);

  return (
    <ProfileView
      user={user}
      isOwnProfile={isOwnProfile}
      authorPrompts={authorPrompts}
      conversationId={conversation?.id}
    />
  );
}
