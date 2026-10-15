import { Suspense } from "react";
import { ConversationRoute } from "@/features/messages/conversation-route";

export default function LocalConversationPage() {
  return (
    <Suspense fallback={null}>
      <ConversationRoute />
    </Suspense>
  );
}
