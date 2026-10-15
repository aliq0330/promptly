import { Suspense } from "react";
import { StarredMessagesView } from "@/features/messages/starred-messages-view";

export default function StarredMessagesPage() {
  return (
    <Suspense fallback={null}>
      <StarredMessagesView />
    </Suspense>
  );
}
