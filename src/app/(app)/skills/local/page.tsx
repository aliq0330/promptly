import { Suspense } from "react";
import { SkillDetailView } from "@/features/skills/skill-detail-view";

export default function SkillLocalPage() {
  return (
    <Suspense fallback={null}>
      <SkillDetailView />
    </Suspense>
  );
}
