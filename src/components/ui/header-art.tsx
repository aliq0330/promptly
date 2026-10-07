import { cn } from "@/lib/utils";

export type HeaderArtVariant = "home" | "discover" | "prompts" | "requests" | "generators" | "workflows" | "presets";

/**
 * Decorative page-header illustration (inline SVG, token colours only, so it
 * follows every palette and both modes). Purely decorative: aria-hidden and
 * never interactive. Used by `PageHeader`'s `art` prop and the home intro —
 * remove those props and this file to take the artwork out again.
 */
export function HeaderArt({ variant, className }: { variant: HeaderArtVariant; className?: string }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 240 140"
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("pointer-events-none h-full w-auto", className)}
    >
      <circle cx="170" cy="70" r="62" className="fill-primary-soft" />
      <circle cx="205" cy="28" r="14" className="fill-secondary opacity-25" />
      <circle cx="96" cy="112" r="9" className="fill-primary opacity-20" />
      {ART[variant]}
    </svg>
  );
}

const card = "fill-surface stroke-border-strong";
const line = "stroke-primary";
const faint = "stroke-text-muted opacity-50";

const ART: Record<HeaderArtVariant, React.ReactNode> = {
  home: (
    <g strokeWidth="2">
      <rect x="88" y="26" width="76" height="52" rx="8" className={card} />
      <rect x="96" y="34" width="60" height="26" rx="4" className="fill-primary-soft stroke-none" />
      <path d="M96 52l14-10 12 8 10-6 16 10" className={line} />
      <path d="M96 68h40M96 74h24" className={faint} />
      <rect x="140" y="62" width="76" height="56" rx="8" className={card} />
      <path d="M150 76h44M150 86h56M150 96h32" className={faint} />
      <path d="M150 108h10" className={line} />
      <rect x="62" y="84" width="64" height="40" rx="8" className={card} />
      <path d="M72 98l8 6-8 6M86 110h22" className={line} />
      <path d="M198 40l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" className="fill-primary stroke-none" />
    </g>
  ),
  discover: (
    <g strokeWidth="2">
      <circle cx="150" cy="72" r="46" className={card} />
      <circle cx="150" cy="72" r="36" className={faint} strokeDasharray="2 6" />
      <path d="M150 34v8M150 102v8M112 72h8M180 72h8" className={faint} />
      <path d="M170 52l-12 26-26 12 12-26z" className="fill-primary-soft stroke-primary" />
      <circle cx="150" cy="72" r="3.5" className="fill-primary stroke-none" />
      <path d="M72 40l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" className="fill-primary stroke-none" />
      <path d="M210 108l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" className="fill-secondary stroke-none" />
    </g>
  ),
  prompts: (
    <g strokeWidth="2">
      <rect x="64" y="26" width="132" height="86" rx="10" className={card} />
      <path d="M64 44h132" className="stroke-border-strong" />
      <circle cx="76" cy="35" r="2.5" className="fill-primary stroke-none" />
      <circle cx="86" cy="35" r="2.5" className="fill-text-muted stroke-none opacity-40" />
      <circle cx="96" cy="35" r="2.5" className="fill-text-muted stroke-none opacity-40" />
      <path d="M78 62l10 7-10 7" className={line} />
      <path d="M98 69h56" className={line} />
      <path d="M78 88h84M78 98h58" className={faint} />
      <rect x="160" y="62" width="5" height="14" rx="1.5" className="fill-primary stroke-none" />
      <rect x="170" y="100" width="62" height="28" rx="8" className="fill-primary-soft stroke-primary" />
      <path d="M180 114h30M180 120h18" className={line} />
    </g>
  ),
  requests: (
    <g strokeWidth="2">
      <path d="M72 30h92a10 10 0 0110 10v38a10 10 0 01-10 10h-50l-20 16v-16H72a10 10 0 01-10-10V40a10 10 0 0110-10z" className={card} />
      <path d="M78 50h58M78 62h40" className={faint} />
      <rect x="150" y="82" width="74" height="36" rx="10" className="fill-primary-soft stroke-primary" />
      <path d="M162 96h34M162 106h22" className={line} />
      <path d="M204 40l3.5 8 8 3.5-8 3.5-3.5 8-3.5-8-8-3.5 8-3.5z" className="fill-primary stroke-none" />
      <path d="M130 100l2 4.5 4.5 2-4.5 2-2 4.5-2-4.5-4.5-2 4.5-2z" className="fill-secondary stroke-none" />
    </g>
  ),
  generators: (
    <g strokeWidth="2">
      <rect x="84" y="28" width="52" height="40" rx="8" className={card} />
      <rect x="140" y="52" width="52" height="40" rx="8" className="fill-primary-soft stroke-primary" />
      <rect x="100" y="76" width="52" height="40" rx="8" className={card} />
      <path d="M94 42h32M94 52h20" className={faint} />
      <path d="M150 66h32M150 76h20" className={line} />
      <path d="M110 90h32M110 100h20" className={faint} />
      <path d="M170 38v10M165 43h10" className={line} />
      <path d="M72 100v18M66 106h12" className="stroke-secondary opacity-70" />
      <circle cx="206" cy="108" r="5" className="fill-primary stroke-none opacity-30" />
    </g>
  ),
  workflows: (
    <g strokeWidth="2">
      <path d="M96 52c26 0 22 36 48 36" className={line} strokeDasharray="1 6" />
      <path d="M144 88c24 0 20-36 48-36" className={line} strokeDasharray="1 6" />
      <rect x="62" y="38" width="44" height="28" rx="8" className={card} />
      <path d="M72 52h24" className={faint} />
      <rect x="122" y="74" width="44" height="28" rx="8" className="fill-primary-soft stroke-primary" />
      <path d="M132 88h24" className={line} />
      <rect x="182" y="38" width="44" height="28" rx="8" className={card} />
      <path d="M192 52h24" className={faint} />
      <circle cx="106" cy="52" r="4" className="fill-primary stroke-none" />
      <circle cx="182" cy="52" r="4" className="fill-primary stroke-none" />
    </g>
  ),
  presets: (
    <g strokeWidth="2">
      <rect x="64" y="26" width="140" height="88" rx="10" className={card} />
      <path d="M82 52h100M82 76h100M82 100h100" className={faint} />
      <circle cx="116" cy="52" r="8" className="fill-surface stroke-primary" />
      <circle cx="154" cy="76" r="8" className="fill-surface stroke-primary" />
      <circle cx="102" cy="100" r="8" className="fill-surface stroke-primary" />
      <path d="M82 52h26M82 76h64M82 100h12" className={line} />
      <path d="M214 32l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5z" className="fill-primary stroke-none" />
    </g>
  ),
};
