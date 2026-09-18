import { Suspense } from "react";
import { LocalRequestView } from "@/features/requests/local-request-view";

export default function LocalRequestPage() {
  return (
    <Suspense fallback={null}>
      <LocalRequestView />
    </Suspense>
  );
}
