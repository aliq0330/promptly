import { CreatorList } from "@/features/profile/creator-list";
import { PromptGrid } from "@/features/prompts/prompt-grid";
import { mockUsers } from "@/mocks/users";
import { mockPrompts } from "@/mocks/prompts";

// Placeholder "following" graph until the follows table exists (CLAUDE.md section 13).
const FOLLOWED_USER_IDS = ["u1", "u3", "u5", "u7"];

export default function FollowingPage() {
  const followed = mockUsers.filter((user) => FOLLOWED_USER_IDS.includes(user.id));
  const feed = [...mockPrompts]
    .filter((prompt) => FOLLOWED_USER_IDS.includes(prompt.author.id))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="space-y-6 px-4 py-6 lg:px-6">
      <section className="space-y-3">
        <h1 className="text-base font-semibold text-text">Takip Ettiklerim</h1>
        <CreatorList users={followed} />
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-text">Son paylaşımları</h2>
        <PromptGrid prompts={feed} />
      </section>
    </div>
  );
}
