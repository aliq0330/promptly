"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { fetchContributorsForPrompt, type PromptContributor } from "@/lib/supabase/prompt-edit-suggestions";
import { profileHref } from "@/lib/utils";

/**
 * "Katkıda Bulunanlar" — rendered right next to the prompt owner's own
 * `CreatorSummary` card (same aside block, kullanıcının açık isteği: "asıl
 * prompt sahibinin profil bilgilerinin olduğu yerde"). Only ever lists
 * people whose edit suggestion was genuinely ACCEPTED (RLS, `20260919400000_
 * edit_suggestion_public_credit.sql` — a merged suggestion is real, public
 * credit; a still-pending/rejected one never appears here, no matter who's
 * viewing). Renders nothing for a prompt that's never had a suggestion
 * accepted — an honest, common case, not an error.
 */
export function ContributorsPanel({ promptId }: { promptId: string }) {
  const [contributors, setContributors] = useState<PromptContributor[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchContributorsForPrompt(promptId).then((result) => {
      if (!cancelled) setContributors(result);
    });
    return () => {
      cancelled = true;
    };
  }, [promptId]);

  if (!contributors || contributors.length === 0) return null;

  return (
    <section aria-label="Katkıda Bulunanlar" className="space-y-3 rounded-lg border border-border-soft bg-surface p-4">
      <p className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">Katkıda Bulunanlar</p>
      <ul className="space-y-2.5">
        {contributors.map((contributor) => (
          <li key={contributor.proposer.id}>
            <Link href={profileHref(contributor.proposer)} className="group flex items-center gap-2.5 rounded-md">
              <Avatar src={contributor.proposer.avatarUrl} alt={contributor.proposer.displayName} size={32} />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-label font-medium text-text group-hover:text-primary">
                  {contributor.proposer.displayName}
                </span>
                <span className="block truncate text-caption text-text-muted">
                  {contributor.contributionCount > 1
                    ? `${contributor.contributionCount} düzenleme önerisi kabul edildi`
                    : "Düzenleme önerisi kabul edildi"}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
