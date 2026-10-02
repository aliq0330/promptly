"use client";

import { useSearchParams } from "next/navigation";
import { PresetEditor } from "./preset-editor";

/** Reads `?edit=<presetId>` (same convention as the generator builder / workflow editor). */
export function PresetCreateGate() {
  const editId = useSearchParams().get("edit");
  return <PresetEditor key={editId ?? "new"} editId={editId} />;
}
