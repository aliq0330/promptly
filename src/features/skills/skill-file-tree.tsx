"use client";

import { useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "@/components/icons/chevron-right";
import { FileText } from "@/components/icons/file-text";
import { Folder } from "@/components/icons/folder";
import { SKILL_FOLDERS } from "@/lib/skills/paths";
import { cn } from "@/lib/utils";

/** Ağaçtaki bir dosya: yolu klasörleri belirler. `auto`: Promptly'nin yazdığı dosya (soluk, yalnız okunur gibi çizilir). */
export interface SkillTreeFile {
  path: string;
  /** Satırın sağında küçük bilgi (boyut, "Zorunlu" gibi). */
  meta?: ReactNode;
  /** Satır sonunda rozet (Betik, kaydedilmedi). */
  badge?: ReactNode;
  auto?: boolean;
}

interface TreeNode {
  name: string;
  path: string;
  file: SkillTreeFile | null;
  children: TreeNode[];
}

function rank(node: TreeNode): number {
  if (node.path === "SKILL.md") return 0;
  if (!node.file) {
    const index = (SKILL_FOLDERS as readonly string[]).indexOf(node.name);
    return index === -1 ? 20 : 1 + index;
  }
  return 30;
}

/** Düz yol listesini klasör ağacına çevirir: önce SKILL.md, sonra bilinen klasörler (kurallar, referanslar…), sonra kök dosyalar. */
export function buildSkillTree(files: readonly SkillTreeFile[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", file: null, children: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let cursor = root;
    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const isFile = index === parts.length - 1;
      let next = cursor.children.find((child) => child.name === part && Boolean(child.file) === isFile);
      if (!next) {
        next = { name: part, path, file: isFile ? file : null, children: [] };
        cursor.children.push(next);
      }
      cursor = next;
    });
  }
  const sort = (nodes: TreeNode[], top: boolean) => {
    nodes.sort((a, b) => {
      if (top && rank(a) !== rank(b)) return rank(a) - rank(b);
      if (!top && Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1;
      return a.name < b.name ? -1 : a.name > b.name ? 1 : 0;
    });
    nodes.forEach((node) => sort(node.children, false));
  };
  sort(root.children, true);
  return root.children;
}

/** Seçili yolun üst klasörleri (ağaçta açık gelmeleri için). */
export function ancestorFolders(path: string): string[] {
  const parts = path.split("/");
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function countFiles(node: TreeNode): number {
  return node.file ? 1 : node.children.reduce((sum, child) => sum + countFiles(child), 0);
}

/**
 * Skill dosya ağacı (editör ve detay sayfası ortak, docs/history/407-*): klasörler açılır/kapanır, seçili dosyanın klasörleri açık gelir,
 * satırlar telefonda 44 px. Ağaçta ↑/↓ satırlar arasında gezer.
 */
export function SkillFileTree({ files, selected, onSelect, label, defaultOpen = [] }: { files: readonly SkillTreeFile[]; selected: string; onSelect: (path: string) => void; label: string; defaultOpen?: readonly string[] }) {
  const tree = useMemo(() => buildSkillTree(files), [files]);
  const [open, setOpen] = useState<Set<string>>(() => new Set([...defaultOpen, ...ancestorFolders(selected)]));
  const rootRef = useRef<HTMLDivElement>(null);

  // Başka yerden (yeni dosya, ağaç dışı seçim) seçilen dosyanın klasörü kapalıysa açılır (render sırasında ayarlanır; efekt gerekmez).
  const [seenSelected, setSeenSelected] = useState(selected);
  if (seenSelected !== selected) {
    setSeenSelected(selected);
    const parents = ancestorFolders(selected);
    if (parents.some((path) => !open.has(path))) setOpen(new Set([...open, ...parents]));
  }

  function toggle(path: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    const rows = Array.from(rootRef.current?.querySelectorAll<HTMLElement>("[data-tree-row]") ?? []);
    const index = rows.findIndex((row) => row === document.activeElement);
    if (index === -1) return;
    event.preventDefault();
    rows[Math.min(Math.max(index + (event.key === "ArrowDown" ? 1 : -1), 0), rows.length - 1)]?.focus();
  }

  function renderNode(node: TreeNode, depth: number): ReactNode {
    const indent = { paddingLeft: `${10 + depth * 18}px` };
    if (!node.file) {
      const isOpen = open.has(node.path);
      return (
        <div key={node.path} role="none">
          <button
            type="button"
            role="treeitem"
            aria-expanded={isOpen}
            aria-selected={false}
            data-tree-row=""
            data-tree-folder={node.path}
            onClick={() => toggle(node.path)}
            style={indent}
            className="flex min-h-11 w-full items-center gap-2 rounded-md pr-2 text-left text-small font-semibold text-text-secondary hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-9"
          >
            <ChevronRight size={16} className={cn("shrink-0 transition-transform duration-200 ease-soft", isOpen && "rotate-90")} aria-hidden />
            <Folder size={16} className="shrink-0 text-text-muted" aria-hidden />
            <span className="min-w-0 flex-1 truncate">{node.name}</span>
            <span className="shrink-0 text-caption font-normal text-text-muted">{countFiles(node)}</span>
          </button>
          {isOpen && <div role="group">{node.children.map((child) => renderNode(child, depth + 1))}</div>}
        </div>
      );
    }
    const file = node.file;
    const active = file.path === selected;
    return (
      <button
        key={node.path}
        type="button"
        role="treeitem"
        aria-selected={active}
        data-tree-row=""
        data-tree-leaf={file.path}
        onClick={() => onSelect(file.path)}
        style={{ paddingLeft: `${10 + depth * 18 + (depth === 0 ? 0 : 20)}px` }}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-md pr-2 text-left text-small focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus md:min-h-9",
          active ? "bg-primary-soft font-semibold text-primary-text" : file.auto ? "text-text-muted hover:bg-surface-soft" : "text-text hover:bg-surface-soft",
        )}
      >
        {depth === 0 && <FileText size={16} className="shrink-0" aria-hidden />}
        <span className="min-w-0 flex-1 truncate">{node.name}</span>
        {file.badge}
        {file.meta && <span className={cn("shrink-0 text-caption font-normal", active ? "text-primary-text" : "text-text-muted")}>{file.meta}</span>}
      </button>
    );
  }

  return (
    <div ref={rootRef} role="tree" aria-label={label} onKeyDown={onKeyDown} className="space-y-0.5" data-skill-tree="">
      {tree.map((node) => renderNode(node, 0))}
    </div>
  );
}
