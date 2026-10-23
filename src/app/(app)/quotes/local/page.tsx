import { Suspense } from "react";
import { QuotePage } from "@/features/quotes/quote-page";

export default function QuoteRoute() {
  return (
    <Suspense fallback={null}>
      <QuotePage />
    </Suspense>
  );
}
