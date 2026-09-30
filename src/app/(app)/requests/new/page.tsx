import { Suspense } from "react";
import { CreateRequestGate } from "@/features/requests/create-request-gate";

export default function NewRequestPage() {
  return (
    <Suspense fallback={null}>
      <CreateRequestGate />
    </Suspense>
  );
}
