#!/usr/bin/env node
/**
 * Promptly icon set (docs/history/377-*): Phosphor Regular (Phosphor Icons, MIT — credited on the Terms page) drawn as our own
 * React components. 343-* had used Solar; 377-* moved the whole site to Phosphor at ONE weight (regular), one tone. The codebase keeps
 * the familiar component names (`Heart`, `X`, `Search`…) and props (`size`, `className`, `strokeWidth` [ignored — the weight is fixed],
 * `fill`); a call site imports each icon from its own file (`import { Heart } from "@/components/icons/heart"`) so a page bundles
 * only the icons it uses.
 *
 *   node scripts/build-icons.mjs          # regenerate src/components/icons/*.tsx (one file per icon + icon.tsx)
 *   node scripts/build-icons.mjs --check  # fail if the committed file is out of date (no write)
 *
 * Reads the icon data from the `@iconify-json/ph` dev dependency at build time only — the site ships just the shapes it uses, no
 * icon package and no network at runtime.
 *
 * Style rule: every icon is Phosphor Regular (one weight, one tone). A solid/active look is a colour (`text-primary`, `text-heart`),
 * never a different weight; the only exceptions are the playing ▶ / ⏸ (`fill` prop) which swap to Phosphor Fill (the entries of
 * FILL_VARIANTS). `Loader2` is our own three-quarter ring (spun with `animate-spin`).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/components/icons");

/** Component name → Phosphor icon (regular weight). Keep alphabetical. One Phosphor icon per component name (icons.test.ts). */
export const ICON_MAP = {
  AlertCircle: "warning-circle",
  AlignCenter: "text-align-center",
  AlignCenterHorizontal: "align-center-horizontal-simple",
  AlignCenterVertical: "align-center-vertical-simple",
  AlignEndHorizontal: "align-bottom-simple",
  AlignEndVertical: "align-right-simple",
  AlignHorizontalDistributeCenter: "arrows-out-line-horizontal",
  AlignLeft: "text-align-left",
  AlignRight: "text-align-right",
  AlignStartHorizontal: "align-top-simple",
  AlignStartVertical: "align-left-simple",
  AlignVerticalDistributeCenter: "arrows-out-line-vertical",
  Archive: "archive",
  ArchiveRestore: "tray-arrow-up",
  ArrowDown: "arrow-down",
  ArrowLeft: "arrow-left",
  ArrowLeftRight: "arrows-left-right",
  ArrowRight: "arrow-right",
  ArrowUp: "arrow-up",
  ArrowUpRight: "arrow-up-right",
  AtSign: "at",
  AudioLines: "waveform",
  BadgeCheck: "seal-check",
  Ban: "prohibit",
  BarChart3: "chart-bar",
  Bell: "bell",
  BellOff: "bell-slash",
  Blocks: "puzzle-piece",
  BookOpen: "book-open",
  Bookmark: "bookmark-simple",
  Bot: "robot",
  Braces: "brackets-curly",
  Briefcase: "briefcase",
  BringToFront: "arrow-line-up",
  Building2: "buildings",
  Calendar: "calendar-blank",
  CalendarDays: "calendar-dots",
  CalendarX: "calendar-x",
  Camera: "camera",
  ChartColumn: "chart-bar-horizontal",
  ChartNoAxesColumn: "chart-line",
  Check: "check",
  CheckCheck: "checks",
  ChevronDown: "caret-down",
  ChevronLeft: "caret-left",
  ChevronRight: "caret-right",
  ChevronUp: "caret-up",
  ChevronsDown: "caret-double-down",
  CircleCheck: "check-circle",
  Circle: "circle",
  CircleDashed: "circle-dashed",
  CircleFadingPlus: "plus-circle",
  CircleHelp: "question",
  CircleSlash: "prohibit-inset",
  Clapperboard: "film-slate",
  Clock: "clock",
  CloudOff: "cloud-slash",
  CloudRain: "cloud-rain",
  Code: "code",
  Code2: "code-simple",
  Compass: "compass",
  Copy: "copy",
  Copyright: "copyright",
  Cpu: "cpu",
  Crosshair: "crosshair",
  Crown: "crown",
  Delete: "backspace",
  Disc3: "vinyl-record",
  Dna: "dna",
  DoorClosed: "door",
  Download: "download-simple",
  Droplet: "drop",
  Ellipsis: "dots-three",
  Eraser: "eraser",
  ExternalLink: "arrow-square-out",
  Eye: "eye",
  EyeOff: "eye-slash",
  FileAudio: "file-audio",
  FileDown: "file-arrow-down",
  FilePlus2: "file-plus",
  FileSymlink: "file-arrow-up",
  FileText: "file-text",
  FileVideo: "file-video",
  Filter: "funnel",
  Film: "film-strip",
  Flag: "flag",
  Flame: "fire",
  FlaskConical: "flask",
  Focus: "slideshow",
  Folder: "folder-simple",
  FolderMinus: "folder-minus",
  FolderOpen: "folder-open",
  FolderPlus: "folder-plus",
  Frame: "frame-corners",
  GitBranch: "git-branch",
  Globe: "globe",
  Globe2: "globe-hemisphere-west",
  GraduationCap: "graduation-cap",
  Grid2x2: "grid-four",
  GripVertical: "dots-six-vertical",
  Group: "selection",
  Hand: "hand",
  HardDrive: "hard-drives",
  Hash: "hash",
  Heart: "heart",
  Highlighter: "highlighter",
  History: "clock-counter-clockwise",
  Home: "house-line",
  House: "house",
  ImageIcon: "image",
  ImageOff: "image-broken",
  ImagePlus: "image-square",
  Images: "images",
  Inbox: "tray",
  Info: "info",
  KeyRound: "key",
  Keyboard: "keyboard",
  Languages: "translate",
  Layers: "stack",
  LayoutDashboard: "layout",
  LayoutGrid: "squares-four",
  Leaf: "leaf",
  Library: "books",
  Lightbulb: "lightbulb",
  Link2: "link",
  Link2Off: "link-break",
  List: "list",
  ListChecks: "list-checks",
  ListPlus: "list-plus",
  Loader2: "@spinner",
  Lock: "lock",
  LockOpen: "lock-open",
  LogIn: "sign-in",
  LogOut: "sign-out",
  Mail: "envelope",
  MailCheck: "envelope-simple",
  MailOpen: "envelope-open",
  Map: "map-trifold",
  MapPin: "map-pin",
  Maximize: "corners-out",
  Maximize2: "arrows-out",
  Megaphone: "megaphone",
  MessageCircle: "chat-circle",
  MessageCircleHeart: "chat-centered-dots",
  MessageCircleQuestion: "chat-teardrop-text",
  MessageCircleReply: "chat-text",
  MessageSquareOff: "chat-slash",
  MessageSquareQuote: "chat-centered-text",
  MessageSquareWarning: "chat-dots",
  MessagesSquare: "chats",
  Mic: "microphone",
  MicVocal: "microphone-stage",
  Microscope: "microscope",
  Minimize2: "arrows-in",
  Minus: "minus",
  MonitorPlay: "monitor-play",
  Moon: "moon",
  MoreVertical: "dots-three-vertical",
  MousePointer2: "cursor",
  Music: "music-notes",
  Network: "tree-structure",
  Package: "package",
  PackagePlus: "cube",
  Palette: "palette",
  PanelBottomOpen: "square-half-bottom",
  PanelRight: "sidebar-simple",
  Paperclip: "paperclip",
  Pause: "pause",
  PenLine: "pencil-line",
  PenTool: "pen-nib",
  Pencil: "pencil-simple",
  Pin: "push-pin",
  PinOff: "push-pin-slash",
  Pipette: "eyedropper",
  Play: "play",
  Plug: "plug",
  Plus: "plus",
  Podcast: "broadcast",
  Popcorn: "popcorn",
  Presentation: "presentation",
  Quote: "quotes",
  Redo2: "arrow-u-up-right",
  RefreshCw: "arrows-clockwise",
  Repeat2: "repeat",
  Replace: "swap",
  Reply: "arrow-bend-up-left",
  RotateCcw: "arrow-counter-clockwise",
  Save: "floppy-disk",
  ScrollText: "scroll",
  Search: "magnifying-glass",
  SearchX: "magnifying-glass-minus",
  Send: "paper-plane-tilt",
  SendToBack: "arrow-line-down",
  Settings: "gear",
  Shapes: "shapes",
  Share2: "share-network",
  ShieldAlert: "shield-warning",
  ShieldCheck: "shield-check",
  ShieldOff: "shield-slash",
  ShoppingBag: "shopping-bag",
  SlidersHorizontal: "sliders-horizontal",
  Smartphone: "device-mobile",
  Smile: "smiley",
  SmilePlus: "smiley-sticker",
  Sofa: "couch",
  Sparkle: "star-four",
  Sparkles: "sparkle",
  Spline: "path",
  Square: "square",
  SquareDashedMousePointer: "cursor-click",
  SquarePen: "note-pencil",
  SquareStack: "stack-simple",
  SquareTerminal: "terminal-window",
  Star: "star",
  StickyNote: "note",
  Sun: "sun",
  Swords: "sword",
  Tag: "tag",
  Tags: "tag-chevron",
  TextCursorInput: "cursor-text",
  ThumbsDown: "thumbs-down",
  ThumbsUp: "thumbs-up",
  Trash2: "trash",
  TrendingUp: "trend-up",
  TriangleAlert: "warning",
  Trophy: "trophy",
  Type: "text-t",
  Undo2: "arrow-u-up-left",
  Ungroup: "selection-slash",
  Upload: "upload-simple",
  User: "user",
  UserCheck: "user-check",
  UserCog: "user-gear",
  UserMinus: "user-minus",
  UserPlus: "user-plus",
  UserRound: "user-circle",
  UserStar: "user-focus",
  UserX: "user-circle-minus",
  Users: "users",
  UsersRound: "users-three",
  Video: "video-camera",
  Volume2: "speaker-high",
  VolumeX: "speaker-x",
  WandSparkles: "magic-wand",
  Waves: "waves",
  WifiOff: "wifi-slash",
  Workflow: "flow-arrow",
  Wrench: "wrench",
  X: "x",
  XCircle: "x-circle",
  Zap: "lightning",
};

/** Components that also ship a Phosphor Fill body: used only when the caller passes `fill` (the playing ▶ / ⏸). */
export const FILL_VARIANTS = ["Play", "Pause"];

/** Our own three-quarter ring for `Loader2` (spun by the caller's `animate-spin`). */
const SPINNER_BODY = '<path d="M12 3a9 9 0 1 0 9 9"/>';

const camel = (name) => name.replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/** One number at 3 decimals, shortest form: 0.500 → .5, -0.25 → -.25, 3.000 → 3. */
function shortNumber(value) {
  let text = (Math.round(Number(value) * 1000) / 1000).toFixed(3).replace(/\.?0+$/, "");
  if (text === "-0" || text === "") text = "0";
  return text.replace(/^(-?)0\./, "$1.");
}

/**
 * Rounds every number of a geometry attribute to 2 decimals (Solar ships 4–5; at a 24-unit box 0.01 is invisible and the
 * paths get ~40 % smaller). Works on compact path syntax ("a.483.483 0 0 1 .9 0"): numbers are tokenised, the text between
 * them is kept, and a space is inserted where shortening would otherwise glue two numbers into one ("1" + ".5").
 */
export function roundGeometry(value) {
  const tokens = /-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi;
  let out = "";
  let last = 0;
  let previous = null;
  for (const m of value.matchAll(tokens)) {
    const gap = value.slice(last, m.index);
    const number = shortNumber(m[0]);
    const glued = gap === "" && previous !== null && ((number.startsWith(".") && !previous.includes(".")) || /^\d/.test(number));
    out += gap + (glued ? " " : "") + number;
    previous = number;
    last = m.index + m[0].length;
  }
  return out + value.slice(last);
}

/** Iconify SVG body → JSX children. Bodies are plain shapes (path/circle/rect/g); anything else is rejected. */
function toJsx(body, { linear }) {
  if (/\bid=|<mask|<defs|<use|<style|<image|xlink:|url\(/.test(body)) throw new Error("unsupported body (ids/masks/defs)");
  let out = body.replace(/\s(d|cx|cy|r|rx|ry|x|y|x1|x2|y1|y2|width|height|points)="([^"]*)"/g, (_, attr, v) => ` ${attr}="${roundGeometry(v)}"`);
  // Linear: the stroke width comes from the <svg> (`strokeWidth` prop), so drop the per-element ones.
  if (linear) out = out.replace(/\s+stroke-width="[^"]*"/g, "");
  // The root <svg> sets fill="currentColor"; an outer <g fill="currentColor"> is redundant.
  if (!linear) out = out.replace(/\s+fill="currentColor"/g, "");
  out = out.replace(/\s([a-z]+(?:-[a-z]+)+)=/g, (_, attr) => ` ${camel(attr)}=`);
  return out;
}

function loadPhosphor() {
  const path = require.resolve("@iconify-json/ph/icons.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Component name → file name: `MessageCircleHeart` → `message-circle-heart`, `BarChart3` → `bar-chart-3`. */
const FILE_OVERRIDES = { Grid2x2: "grid-2x2" };
export function iconFile(component) {
  return FILE_OVERRIDES[component] ?? component.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
}

const HEADER = `GENERATED by scripts/build-icons.mjs — do not edit by hand (docs/history/377-*).`;
const CREDIT = `Phosphor Icons (https://phosphoricons.com), MIT License, Copyright (c) 2020-present Phosphor Icons.`;

const FACTORY = `/*
 * ${HEADER}
 *
 * The shared icon component behind every file in this folder. One file per icon so a page bundles only the icons it
 * imports: \`import { Heart } from "@/components/icons/heart"\`. There is deliberately no barrel index — it would pull
 * every icon into every page.
 *
 * Icons: ${CREDIT}
 * One weight (regular), one tone. Shapes converted to JSX; Loader2 is Promptly's own ring.
 */
import { forwardRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** Width and height in px (default 24). */
  size?: number | string;
  /** Accepted for compatibility; has no effect (the weight is fixed — Phosphor Regular) except on the stroke spinner. */
  strokeWidth?: number | string;
  /** Accepted for compatibility; has no effect. */
  absoluteStrokeWidth?: boolean;
}

export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

/**
 * \`linear\` icons (only the spinner ring) draw a stroke on a 24 grid; every other icon is a Phosphor glyph on a 256 grid.
 * \`solidBody\` is the Phosphor Fill shape used when the caller passes \`fill\` (the playing ▶ / ⏸).
 */
export function icon(displayName: string, body: ReactNode, linear: boolean, solidBody?: ReactNode): IconComponent {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    const { size = 24, strokeWidth, absoluteStrokeWidth, fill, className, children, ...rest } = props;
    void absoluteStrokeWidth;
    const solid = fill !== undefined && fill !== "none";
    const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox={linear ? "0 0 24 24" : "0 0 256 256"}
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        {...(linear
          ? { fill: "none", stroke: "currentColor", strokeWidth: strokeWidth ?? 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
          : { fill: "currentColor" })}
        className={cn("icon", className)}
        {...rest}
      >
        {solid && solidBody ? solidBody : body}
        {children}
      </svg>
    );
  });
  Icon.displayName = displayName;
  return Icon;
}
`;

/** Every generated file: path relative to src/components/icons → content. */
function render() {
  const ph = loadPhosphor();
  const icons = ph.icons;
  const aliases = ph.aliases ?? {};
  const resolve = (key) => icons[key]?.body ?? (aliases[key] ? icons[aliases[key].parent]?.body : undefined);

  const files = new Map([["icon.tsx", FACTORY]]);
  const problems = [];
  for (const [component, spec] of Object.entries(ICON_MAP)) {
    let jsx;
    let linear;
    let source;
    let solidJsx = null;
    if (spec === "@spinner") {
      jsx = SPINNER_BODY;
      linear = true;
      source = "Promptly's own spinner ring";
    } else {
      linear = false;
      const body = resolve(spec);
      if (!body) {
        problems.push(`${component}: ph:${spec} yok`);
        continue;
      }
      try {
        jsx = toJsx(body, { linear });
        if (FILL_VARIANTS.includes(component)) {
          const fillBody = resolve(`${spec}-fill`);
          if (!fillBody) problems.push(`${component}: ph:${spec}-fill yok`);
          else solidJsx = toJsx(fillBody, { linear });
        }
      } catch (err) {
        problems.push(`${component}: ph:${spec} — ${err.message}`);
        continue;
      }
      source = `ph:${spec} — ${CREDIT}`;
    }
    const file = `${iconFile(component)}.tsx`;
    if (files.has(file)) problems.push(`${component}: dosya adı çakışıyor (${file})`);
    files.set(
      file,
      `/* ${HEADER} ${source} */\nimport { icon } from "./icon";\n\nexport const ${component} = /*#__PURE__*/ icon(${JSON.stringify(component)}, <>${jsx}</>, ${linear}${solidJsx ? `, <>${solidJsx}</>` : ""});\n`,
    );
  }
  if (problems.length) throw new Error(`Icon map problems:\n  ${problems.join("\n  ")}`);
  return files;
}

const files = render();
const existing = existsSync(OUT_DIR) ? readdirSync(OUT_DIR).filter((f) => f.endsWith(".tsx")) : [];
const stale = existing.filter((f) => !files.has(f));
if (process.argv.includes("--check")) {
  const outdated = [...files].filter(([f, content]) => !existsSync(join(OUT_DIR, f)) || readFileSync(join(OUT_DIR, f), "utf8") !== content);
  if (outdated.length || stale.length) {
    console.error(
      `src/components/icons is out of date (${outdated.length} changed/missing, ${stale.length} stale) — run: node scripts/build-icons.mjs`,
    );
    process.exit(1);
  }
  console.log("icons up to date");
} else {
  mkdirSync(OUT_DIR, { recursive: true });
  for (const [f, content] of files) writeFileSync(join(OUT_DIR, f), content);
  for (const f of stale) rmSync(join(OUT_DIR, f));
  console.log(`wrote ${files.size - 1} icons + icon.tsx to src/components/icons${stale.length ? ` (removed ${stale.length} stale)` : ""}`);
}
