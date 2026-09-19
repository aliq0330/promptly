import { ProfileHeaderSkeleton } from "@/components/ui/profile-header-skeleton";
import { PromptCardSkeletonGrid } from "@/components/ui/prompt-card-skeleton";

export default function ProfileLoading() {
  return (
    <div className="space-y-5 pb-6">
      <ProfileHeaderSkeleton />
      <div className="px-4 lg:px-6">
        <PromptCardSkeletonGrid count={6} />
      </div>
    </div>
  );
}
