"use client";

import { useSearchParams } from "next/navigation";
import { SkillEditor } from "./skill-editor";

/** `?edit=<skillId>` okur (Hazır ayar / Workflow editörüyle aynı kural). */
export function SkillCreateGate() {
  const editId = useSearchParams().get("edit");
  return <SkillEditor key={editId ?? "new"} editId={editId} />;
}
