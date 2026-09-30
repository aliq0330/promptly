"use client";

import { useSearchParams } from "next/navigation";
import { CreateRequestForm } from "./create-request-form";

/** Remounts the request form (fresh prefill) when `?edit=` changes via client-side navigation. */
export function CreateRequestGate() {
  const searchParams = useSearchParams();
  return <CreateRequestForm key={searchParams.get("edit") ?? ""} />;
}
