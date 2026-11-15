import { Suspense } from "react";
import { SkillCreateGate } from "@/features/skills/skill-create-gate";

export default function SkillCreatePage() {
  return (
    <Suspense fallback={null}>
      <SkillCreateGate />
    </Suspense>
  );
}
