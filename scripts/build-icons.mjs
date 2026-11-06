#!/usr/bin/env node
/**
 * Promptly icon set (docs/history/343-*): Solar (480 Design, CC BY 4.0 — credited on the Terms page) drawn as our own
 * React components. The codebase keeps the familiar component names (`Heart`, `X`, `Search`…) and props (`size`,
 * `className`, `strokeWidth`, `fill`); a call site imports each icon from its own file
 * (`import { Heart } from "@/components/icons/heart"`) so a page bundles only the icons it uses.
 *
 *   node scripts/build-icons.mjs          # regenerate src/components/icons/*.tsx (one file per icon + icon.tsx)
 *   node scripts/build-icons.mjs --check  # fail if the committed file is out of date (no write)
 *
 * Reads the icon data from the `@iconify-json/solar` dev dependency at build time only — the site ships just the
 * shapes it uses, no icon package and no network at runtime.
 *
 * Style rule: everything that names a THING is Bold Duotone (one colour, two tones — the half-tone layer has
 * opacity .5). Small control glyphs — close, check, chevrons, arrows, plus/minus, undo/redo, align — are Solar Linear
 * (strokes; `strokeWidth` is honoured), because a two-tone ✕ or › reads as a blob at 14–16 px. `Loader2` is our own
 * three-quarter ring (spun with `animate-spin`, as before).
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(ROOT, "src/components/icons");

/** Component name → Solar icon (`<name>` = Bold Duotone, `<name>:l` = Linear). Keep alphabetical. */
export const ICON_MAP = {
  AlertCircle: "danger-circle",
  AlertTriangle: "danger-triangle",
  AlignCenter: "align-horizontal-center:l",
  AlignCenterHorizontal: "align-horizontal-center:l",
  AlignCenterVertical: "align-vertical-center:l",
  AlignEndHorizontal: "align-bottom:l",
  AlignEndVertical: "align-right:l",
  AlignHorizontalDistributeCenter: "align-horizontal-spacing:l",
  AlignLeft: "align-left:l",
  AlignRight: "align-right:l",
  AlignStartHorizontal: "align-top:l",
  AlignStartVertical: "align-left:l",
  AlignVerticalDistributeCenter: "align-vertical-spacing:l",
  Archive: "archive",
  ArchiveRestore: "archive-up",
  ArrowDown: "arrow-down:l",
  ArrowLeft: "arrow-left:l",
  ArrowLeftRight: "transfer-horizontal:l",
  ArrowRight: "arrow-right:l",
  ArrowUp: "arrow-up:l",
  ArrowUpRight: "arrow-right-up:l",
  AudioLines: "soundwave",
  BadgeCheck: "verified-check",
  Ban: "forbidden-circle",
  BarChart3: "chart-2",
  Bell: "bell",
  BellOff: "bell-off",
  BellRing: "bell-bing",
  Blocks: "blocks",
  BookOpen: "book",
  Bookmark: "bookmark",
  Bot: "bot",
  Braces: "braces",
  Briefcase: "case",
  BringToFront: "square-top-up",
  Building2: "buildings-2",
  Calendar: "calendar",
  CalendarDays: "calendar-date",
  CalendarX: "calendar-minimalistic",
  Camera: "camera",
  ChartColumn: "chart",
  ChartNoAxesColumn: "chart-square",
  Check: "check:l",
  CheckCheck: "check-read:l",
  CheckCircle2: "check-circle",
  ChevronDown: "alt-arrow-down:l",
  ChevronLeft: "alt-arrow-left:l",
  ChevronRight: "alt-arrow-right:l",
  ChevronUp: "alt-arrow-up:l",
  ChevronsDown: "double-alt-arrow-down:l",
  CircleCheck: "check-circle",
  CircleDashed: "circle-dashed",
  CircleFadingPlus: "circle-dot-dashed",
  CircleHelp: "question-circle",
  CircleSlash: "slash-circle",
  Clapperboard: "clapperboard",
  Clock: "clock-circle",
  CloudOff: "cloud-cross",
  CloudRain: "cloud-rain",
  Code: "code",
  Code2: "code-2",
  Compass: "compass",
  Copy: "copy",
  Copyright: "copyright",
  CornerDownRight: "forward-right:l",
  CornerUpLeft: "undo-left:l",
  CornerUpRight: "undo-right:l",
  Cpu: "cpu",
  Crosshair: "target",
  Crown: "crown",
  Delete: "backspace",
  Disc3: "vinyl",
  Dna: "dna",
  DoorClosed: "exit",
  Download: "download-minimalistic",
  Droplet: "waterdrop",
  Edit3: "pen",
  Ellipsis: "menu-dots",
  Eraser: "eraser",
  ExternalLink: "square-arrow-right-up:l",
  Eye: "eye",
  EyeOff: "eye-closed",
  FileAudio: "file-audio",
  FileDown: "file-download",
  FilePlus2: "file-add",
  FileSymlink: "file-send",
  FileText: "file-text",
  FileVideo: "file-video-camera",
  Film: "video-frame-2",
  Flag: "flag",
  Flame: "fire",
  FlaskConical: "test-tube",
  Folder: "folder",
  FolderMinus: "remove-folder",
  FolderOpen: "folder-open",
  FolderPlus: "add-folder",
  Frame: "frame",
  GalleryVerticalEnd: "posts-carousel-vertical",
  GitBranch: "git-branch",
  Globe: "global",
  Globe2: "earth",
  GraduationCap: "square-academic-cap",
  Grid2x2: "grid-2x2",
  GripVertical: "grip-vertical",
  Group: "square-dashed",
  Hand: "move",
  HardDrive: "ssd-square",
  Hash: "hashtag",
  Heart: "heart",
  Highlighter: "star-shine",
  History: "history",
  Home: "home-smile",
  House: "home-2",
  Image: "gallery",
  ImageIcon: "gallery",
  ImageOff: "gallery-remove",
  ImagePlus: "gallery-add",
  Images: "gallery-wide",
  Inbox: "inbox",
  Info: "info-circle",
  KeyRound: "key",
  Keyboard: "keyboard",
  Languages: "translation",
  Layers: "layers",
  LayoutDashboard: "widget-2",
  LayoutGrid: "widget",
  Leaf: "leaf",
  Library: "library",
  Lightbulb: "lightbulb",
  Link2: "link",
  Link2Off: "link-broken",
  List: "list",
  ListChecks: "checklist",
  ListFilter: "sort-from-top-to-bottom",
  ListPlus: "list-plus",
  Loader2: "@spinner",
  Lock: "lock",
  LockOpen: "lock-unlocked",
  LogIn: "login-3",
  LogOut: "logout-3",
  Mail: "letter",
  MailCheck: "inbox-in",
  MailOpen: "letter-opened",
  Map: "map",
  MapPin: "map-point",
  Maximize: "maximize:l",
  Maximize2: "full-screen:l",
  Megaphone: "@custom",
  MessageCircle: "chat-round-dots",
  MessageCircleHeart: "chat-round-like",
  MessageCircleQuestion: "chat-round-question-mark",
  MessageCircleReply: "chat-round-replay",
  MessageSquare: "chat-square",
  MessageSquareMore: "chat-square-dots",
  MessageSquareOff: "chat-square-off",
  MessageSquareQuote: "chat-square-quote",
  MessageSquareText: "chat-square-line",
  MessageSquareWarning: "chat-square-warning",
  MessagesSquare: "chat-square-2",
  Mic: "microphone",
  MicVocal: "microphone-3",
  Microscope: "@custom",
  Minimize2: "quit-full-screen:l",
  Minus: "minus:l",
  MonitorPlay: "monitor",
  Moon: "moon",
  MoreHorizontal: "menu-dots",
  MoreVertical: "menu-dots-vertical",
  MousePointer2: "cursor",
  Music: "music-note-2",
  Network: "structure",
  Package: "box",
  PackagePlus: "box-minimalistic",
  Palette: "palette",
  PanelBottomOpen: "panel-bottom-open",
  PanelRight: "panel-right",
  Paperclip: "paperclip",
  Pause: "pause",
  PenLine: "pen-2",
  PenTool: "pen-new-round",
  Pencil: "pen",
  Pin: "pin",
  PinOff: "@custom",
  Pipette: "pipette",
  Play: "play",
  Plug: "plug-circle",
  Plus: "add:l",
  Podcast: "podcast",
  Popcorn: "clapperboard-open-play",
  Presentation: "presentation-graph",
  Quote: "quote",
  Redo2: "undo-right-round:l",
  RefreshCw: "refresh:l",
  Repeat2: "repeat:l",
  Replace: "square-transfer-horizontal",
  Reply: "reply",
  RotateCcw: "restart:l",
  RotateCw: "refresh:l",
  Save: "diskette",
  ScrollText: "document-text",
  Search: "magnifer",
  SearchX: "magnifier-close",
  Send: "plain-2",
  SendToBack: "square-bottom-down",
  Settings: "settings",
  Settings2: "settings-minimalistic",
  Shapes: "widget-4",
  Share: "square-share-line",
  Share2: "share",
  ShieldAlert: "shield-warning",
  ShieldCheck: "shield-check",
  ShieldOff: "shield-cross",
  ShoppingBag: "bag",
  SlidersHorizontal: "tuning-2",
  Smartphone: "smartphone",
  Smile: "smile-circle",
  SmilePlus: "sticker-smile-circle",
  Sofa: "sofa",
  Sparkle: "stars-minimalistic",
  Sparkles: "magic-stick-3",
  Spline: "routing-3",
  Square: "stop",
  SquareDashedMousePointer: "cursor-square",
  SquarePen: "pen-new-square",
  SquareStack: "layers-minimalistic",
  SquareTerminal: "file-terminal",
  Star: "star",
  StickyNote: "notes",
  Sun: "sun-2",
  Swords: "@custom",
  Tag: "tag",
  Tags: "tag-horizontal",
  Terminal: "programming",
  TextCursorInput: "text-field-focus",
  ThumbsDown: "dislike",
  ThumbsUp: "like",
  Trash2: "trash-bin-trash",
  TrendingUp: "graph-up",
  TriangleAlert: "danger-triangle",
  Trophy: "cup-first",
  Type: "text",
  Undo2: "undo-left-round:l",
  Ungroup: "square-dot-dashed",
  Unlock: "lock-unlocked",
  Upload: "upload-minimalistic",
  User: "user",
  UserCheck: "user-check",
  UserCog: "user-id",
  UserMinus: "user-minus",
  UserPlus: "user-plus",
  UserRound: "user-rounded",
  UserStar: "user-heart",
  UserX: "user-cross",
  Users: "users-group-rounded",
  UsersRound: "users-group-two-rounded",
  Video: "videocamera",
  Volume2: "volume-loud",
  VolumeX: "volume-cross",
  Wand2: "magic-wand",
  WandSparkles: "magic-stick",
  Waves: "soundwave-square",
  WifiOff: "wi-fi-off",
  Workflow: "routing",
  Wrench: "toolbox",
  X: "close:l",
  XCircle: "close-circle",
  Zap: "bolt",
};

/** Our own three-quarter ring for `Loader2` (spun by the caller's `animate-spin`). */
const SPINNER_BODY = '<path d="M12 3a9 9 0 1 0 9 9"/>';

/**
 * Icons Solar has no counterpart for, drawn by us in Solar's Bold Duotone manner (24 grid, solid shapes, the lighter layer
 * at opacity .5, a few round-capped 1.6 strokes for fine detail). `@custom` entries of ICON_MAP read this table; a value is
 * an SVG body or `(resolve) => body` to build on a Solar shape. When Solar adds a real equivalent, point the map at it.
 */
const SWORD = '<path d="M12 1.8l1.7 2.2v8.9h-3.4V4z"/><path d="M7.6 13.6h8.8a.9.9 0 0 1 0 1.8H7.6a.9.9 0 0 1 0-1.8z"/><path d="M11 15.4h2v3.9h-2z"/><circle cx="12" cy="20.4" r="1.3"/>';
const CUSTOM = {
  Megaphone:
    '<path d="M16 4.1v15.8c0 .8-.9 1.3-1.6.9L8.5 17H8V7h.5l5.9-3.8c.7-.4 1.6.1 1.6.9z" opacity=".5"/>' +
    '<path d="M5 7h3.5v10H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2z"/>' +
    '<path d="M5.6 17.4h3.1l1.1 3.4a1 1 0 0 1-1 1.3H8a1.2 1.2 0 0 1-1.1-.8z"/>' +
    '<path d="M18.9 9.4a3.5 3.5 0 0 1 0 5.2M21 7.2a6.4 6.4 0 0 1 0 9.6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  Swords: `<g transform="rotate(-45 12 12)" opacity=".5">${SWORD}</g><g transform="rotate(45 12 12)">${SWORD}</g>`,
  Microscope:
    '<path d="M12 8c4.2.4 6.7 3.6 6.2 7.2-.3 2-1.6 3.6-3.6 4.4" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" opacity=".5"/>' +
    '<rect x="8.4" y="1.8" width="4" height="10" rx="1.2" transform="rotate(20 10.4 6.8)"/>' +
    '<rect x="6" y="14.4" width="8" height="1.9" rx=".95"/>' +
    '<path d="M5 19.4h14a1.3 1.3 0 0 1 0 2.6H5a1.3 1.3 0 0 1 0-2.6z"/>',
  PinOff: (resolve) =>
    resolve("pin-bold-duotone") + '<path d="M3.5 3.5l17 17" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
};

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

function loadSolar() {
  const path = require.resolve("@iconify-json/solar/icons.json");
  return JSON.parse(readFileSync(path, "utf8"));
}

/** Component name → file name: `MessageCircleHeart` → `message-circle-heart`, `BarChart3` → `bar-chart-3`. */
const FILE_OVERRIDES = { Grid2x2: "grid-2x2" };
export function iconFile(component) {
  return FILE_OVERRIDES[component] ?? component.replace(/([a-z])([A-Z0-9])/g, "$1-$2").toLowerCase();
}

const HEADER = `GENERATED by scripts/build-icons.mjs — do not edit by hand (docs/history/343-*).`;
const CREDIT = `Solar Icon Set by 480 Design (https://www.figma.com/community/file/1166831539721848736), CC BY 4.0 (https://creativecommons.org/licenses/by/4.0/).`;

const FACTORY = `/*
 * ${HEADER}
 *
 * The shared icon component behind every file in this folder. One file per icon (like lucide did) so a page bundles
 * only the icons it imports: \`import { Heart } from "@/components/icons/heart"\`. There is deliberately no barrel
 * index — it would pull every icon into every page.
 *
 * Icons: ${CREDIT}
 * Shapes converted to JSX; Loader2 is Promptly's own ring.
 */
import { forwardRef, type ForwardRefExoticComponent, type ReactNode, type RefAttributes, type SVGProps } from "react";
import { cn } from "@/lib/utils";

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "ref"> {
  /** Width and height in px (default 24). */
  size?: number | string;
  /** Stroke width of Linear (control) icons; ignored by the filled Duotone ones. */
  strokeWidth?: number | string;
  /** Accepted for compatibility; has no effect. */
  absoluteStrokeWidth?: boolean;
}

export type IconComponent = ForwardRefExoticComponent<IconProps & RefAttributes<SVGSVGElement>>;

export function icon(displayName: string, body: ReactNode, linear: boolean): IconComponent {
  const Icon = forwardRef<SVGSVGElement, IconProps>(function Icon(props, ref) {
    const { size = 24, strokeWidth, absoluteStrokeWidth, fill, className, children, ...rest } = props;
    void absoluteStrokeWidth;
    // A non-"none" fill asks for the solid look (e.g. a playing ▶): the half-tone layer goes to full opacity.
    const solid = fill !== undefined && fill !== "none";
    const labelled = rest["aria-label"] !== undefined || rest["aria-labelledby"] !== undefined;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        aria-hidden={labelled ? undefined : true}
        focusable="false"
        {...(linear
          ? { fill: solid ? fill : "none", stroke: "currentColor", strokeWidth: strokeWidth ?? 1.75, strokeLinecap: "round" as const, strokeLinejoin: "round" as const }
          : { fill: "currentColor" })}
        className={cn("icon", solid && "icon-solid", className)}
        {...rest}
      >
        {body}
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
  const solar = loadSolar();
  const icons = solar.icons;
  const aliases = solar.aliases ?? {};
  const resolve = (key) => icons[key]?.body ?? (aliases[key] ? icons[aliases[key].parent]?.body : undefined);

  const files = new Map([["icon.tsx", FACTORY]]);
  const problems = [];
  for (const [component, spec] of Object.entries(ICON_MAP)) {
    let jsx;
    let linear;
    let source;
    if (spec === "@spinner") {
      jsx = SPINNER_BODY;
      linear = true;
      source = "Promptly's own spinner ring";
    } else if (spec === "@custom") {
      const made = CUSTOM[component];
      const raw = typeof made === "function" ? made(resolve) : made;
      if (!raw) {
        problems.push(`${component}: CUSTOM tablosunda yok`);
        continue;
      }
      linear = false;
      jsx = toJsx(raw, { linear: false });
      source = "Promptly's own icon, drawn in the Solar Bold Duotone manner";
    } else {
      const [base, style] = spec.split(":");
      linear = style === "l";
      const key = `${base}-${linear ? "linear" : "bold-duotone"}`;
      const body = resolve(key);
      if (!body) {
        problems.push(`${component}: solar:${key} yok`);
        continue;
      }
      try {
        jsx = toJsx(body, { linear });
      } catch (err) {
        problems.push(`${component}: solar:${key} — ${err.message}`);
        continue;
      }
      source = `solar:${key} — ${CREDIT}`;
    }
    const file = `${iconFile(component)}.tsx`;
    if (files.has(file)) problems.push(`${component}: dosya adı çakışıyor (${file})`);
    files.set(
      file,
      `/* ${HEADER} ${source} */\nimport { icon } from "./icon";\n\nexport const ${component} = /*#__PURE__*/ icon(${JSON.stringify(component)}, <>${jsx}</>, ${linear});\n`,
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
