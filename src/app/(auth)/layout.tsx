import type { ReactNode } from "react";
import Link from "next/link";

export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <Link href="/" className="mb-8 text-xl font-semibold text-primary">
        Promptly
      </Link>
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6">
        {children}
      </div>
    </div>
  );
}
