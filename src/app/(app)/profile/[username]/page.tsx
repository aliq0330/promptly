import { notFound } from "next/navigation";
import { ProfileHeader } from "@/features/profile/profile-header";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { getUserByUsername, mockUsers } from "@/mocks/users";
import { getPromptsByAuthor } from "@/mocks/prompts";

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

  const prompts = [...getPromptsByAuthor(user.id)].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );

  return (
    <div className="space-y-6 pb-6">
      <ProfileHeader user={user} promptCount={prompts.length} isOwnProfile={user.id === "me"} />
      <div className="px-4 lg:px-6">
        <PromptGrid prompts={prompts} />
      </div>
    </div>
  );
}
