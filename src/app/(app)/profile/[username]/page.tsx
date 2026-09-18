import { ProfileHeaderSkeleton } from "@/components/ui/profile-header-skeleton";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export function generateStaticParams() {
  return [{ username: "user" }];
}

export default function ProfilePage() {
  return (
    <div className="space-y-6 pb-6">
      <ProfileHeaderSkeleton />
      <div className="flex justify-center">
        <span className="rounded-sm bg-accent-surface px-2 py-0.5 text-xs font-medium text-primary">
          Yakında
        </span>
      </div>
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid count={3} />
      </div>
    </div>
  );
}
