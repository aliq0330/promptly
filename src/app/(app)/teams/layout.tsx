import type { ReactNode } from "react";
import { RequireAuth } from "@/features/auth/require-auth";

export default function MemberOnlyLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
