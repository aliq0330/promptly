import { Suspense } from "react";
import { CreateRequestForm } from "@/features/requests/create-request-form";

export default function NewRequestPage() {
  return (
    <Suspense fallback={null}>
      <CreateRequestForm />
    </Suspense>
  );
}
