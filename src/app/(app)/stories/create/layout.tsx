import type { ReactNode } from "react";
import { RequireAuth } from "@/features/auth/require-auth";

export default function StoryCreateLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
