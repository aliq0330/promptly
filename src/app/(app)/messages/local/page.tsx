import { Suspense } from "react";
import { LocalConversationView } from "@/features/messages/local-conversation-view";

export default function LocalConversationPage() {
  return (
    <Suspense fallback={null}>
      <LocalConversationView />
    </Suspense>
  );
}
