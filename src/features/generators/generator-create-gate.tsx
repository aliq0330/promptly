"use client";

import { useSearchParams } from "next/navigation";
import { GeneratorBuilder } from "./generator-builder";

/** Reads `?edit=<generatorId>` (same query-param convention as CreatePromptForm's `?duplicate=`) and hands it to the shared builder — a new generator when absent. */
export function GeneratorCreateGate() {
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  return <GeneratorBuilder editId={editId} />;
}
