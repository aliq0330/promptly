import { toolLogo } from "@/lib/ai-tool-logos";
import { cn, publicAssetUrl } from "@/lib/utils";

const TILE_SIZE = { sm: "h-6 w-6 rounded-sm", md: "h-7 w-7 rounded-md", lg: "h-11 w-11 rounded-lg" } as const;
const MARK_SIZE = { sm: 16, md: 20, lg: 24 } as const;

/**
 * An AI tool's real brand mark (`lib/ai-tool-logos.ts`, files in `public/tools/`). Decorative — the tool's name always sits beside it,
 * so it is `aria-hidden`. With `tile` (default) it sits on a soft square so every mark has the same footprint and contrast; single-colour
 * marks are drawn as a mask in the text colour (readable in dark mode), coloured ones as an image. A tool without a mark falls back to
 * its first letter.
 */
export function ToolLogo({ toolId, name, size = "md", tile = true, className }: { toolId: string; name: string; size?: keyof typeof TILE_SIZE; tile?: boolean; className?: string }) {
  const logo = toolLogo(toolId);
  const px = MARK_SIZE[size];
  const url = logo ? publicAssetUrl(logo.path) : null;
  const mark = url ? (
    logo?.mono ? (
      <span
        aria-hidden
        className="block shrink-0 bg-text"
        style={{ width: px, height: px, WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, WebkitMaskRepeat: "no-repeat", maskRepeat: "no-repeat", WebkitMaskPosition: "center", maskPosition: "center", WebkitMaskSize: "contain", maskSize: "contain" }}
      />
    ) : (
      // eslint-disable-next-line @next/next/no-img-element -- a small static brand mark from public/; next/image is unavailable in the static export
      <img src={url} alt="" width={px} height={px} draggable={false} className="shrink-0 select-none" />
    )
  ) : (
    <span aria-hidden className="text-label font-semibold text-primary">
      {name.charAt(0)}
    </span>
  );
  if (!tile) return <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center", className)}>{mark}</span>;
  return (
    <span aria-hidden className={cn("flex shrink-0 items-center justify-center border border-border-soft bg-surface-soft", TILE_SIZE[size], className)}>
      {mark}
    </span>
  );
}
