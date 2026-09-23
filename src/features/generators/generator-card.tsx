import Link from "next/link";
import { Blocks } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { GENERATOR_CATEGORY_TOPIC_LABELS } from "./generator-category-meta";
import { generatorHref } from "@/lib/utils";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import type { Generator } from "@/types";

/**
 * Discovery/search/profile-grid card for a real, published generator — the
 * SAME card shell, header and footer components a prompt card uses
 * (`PostHeader`/`PromptCardFooter`, both widened to accept a `generator`
 * target in Bölüm 9.36's Prompt/Generator parity pass), not a hand-rolled
 * duplicate of either. Only the content block between them (cover, badges,
 * title/description) is generator-specific — exactly the same "shared
 * shell + type-specific content" split `ImagePromptCard`/`TextPromptCard`
 * already use for their own content area. Same "stretched link" pattern as
 * `TextPromptCard`: interactive header/footer controls sit at `z-10`, a
 * full-card `Link` sits behind them at `z-0` for the rest of the card's
 * click area.
 */
export function GeneratorCard({
  generator,
  onDeleted,
  collectionRemoval,
}: {
  generator: Generator;
  onDeleted?: () => void;
  /** Same "kaydedilenlerden kaldır"/"koleksiyondan kaldır" menu entry a prompt card gets when rendered inside a collection the viewer owns (CLAUDE.md Bölüm 9.22 §8/§9, widened to generators). */
  collectionRemoval?: { isDefault: boolean; onRemove: () => Promise<void> };
}) {
  return (
    <div className="group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-surface pt-4 transition-shadow hover:shadow-md">
      <div className="flex flex-col gap-3 px-4">
        <PostHeader generator={generator} onDeleted={onDeleted} collectionRemoval={collectionRemoval} />

        {generator.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- real, potentially locally-produced data URL cover
          <img src={generator.coverUrl} alt="" className="h-32 w-full rounded-md object-cover" />
        ) : (
          <div className="flex h-32 w-full items-center justify-center rounded-md bg-accent-surface text-primary">
            <Blocks size={28} />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="accent">
            <Blocks size={10} className="mr-1" /> Generator
          </Badge>
          <Badge>{GENERATOR_CATEGORY_TOPIC_LABELS[generator.category]}</Badge>
        </div>

        <div>
          <h3 className="text-base font-semibold text-text">{generator.title}</h3>
          <p className="mt-1 line-clamp-3 text-sm text-text-muted">{generator.description}</p>
        </div>
      </div>

      <PromptCardFooter generator={generator} />

      <Link href={generatorHref(generator)} className="absolute inset-0 z-0" aria-label={generator.title} />
    </div>
  );
}
