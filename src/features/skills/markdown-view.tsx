import type { ReactNode } from "react";
import { parseMarkdown, type Block, type Inline } from "@/lib/skills/markdown";

/**
 * Güvenli Markdown görünümü (docs/history/389-*): ayrıştırıcı bir AĞAÇ üretir (`lib/skills/markdown.ts`), burada React öğelerine çevrilir.
 * `dangerouslySetInnerHTML` yoktur; ham HTML metin olarak görünür; bağlantılar yalnız http(s)/mailto'dur ve `nofollow ugc` taşır.
 */
function renderInline(nodes: Inline[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.t) {
      case "text":
        return node.v;
      case "code":
        return (
          <code key={index} className="rounded bg-surface-soft px-1 py-0.5 font-mono text-[0.92em] text-text">
            {node.v}
          </code>
        );
      case "strong":
        return <strong key={index}>{renderInline(node.c)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.c)}</em>;
      default:
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-primary-text underline underline-offset-2 hover:text-primary-hover">
            {renderInline(node.c)}
          </a>
        );
    }
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-6 text-h2 font-bold text-text first:mt-0",
  2: "mt-6 text-h3 font-bold text-text first:mt-0",
  3: "mt-5 text-body font-semibold text-text first:mt-0",
  4: "mt-4 text-body font-semibold text-text first:mt-0",
  5: "mt-4 text-small font-semibold text-text first:mt-0",
  6: "mt-4 text-small font-semibold text-text-secondary first:mt-0",
};

function renderBlock(block: Block, index: number): ReactNode {
  switch (block.t) {
    case "h": {
      const Tag = `h${Math.min(block.level + 1, 6)}` as "h2" | "h3" | "h4" | "h5" | "h6";
      return (
        <Tag key={index} className={HEADING_CLASS[block.level]}>
          {renderInline(block.c)}
        </Tag>
      );
    }
    case "p":
      return (
        <p key={index} className="text-body leading-relaxed text-text">
          {renderInline(block.c)}
        </p>
      );
    case "code":
      return (
        <pre key={index} className="overflow-x-auto rounded-lg card-soft px-4 py-3 text-small text-text">
          <code className="prompt-text whitespace-pre">{block.v}</code>
        </pre>
      );
    case "ul":
    case "ol": {
      const List = block.t;
      return (
        <List key={index} className={`space-y-1 pl-6 text-body text-text ${block.t === "ul" ? "list-disc" : "list-decimal"}`}>
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case "quote":
      return (
        <blockquote key={index} className="border-l-2 border-border-strong pl-4 text-body text-text-secondary">
          {renderInline(block.c)}
        </blockquote>
      );
    default:
      return <hr key={index} className="border-border-soft" />;
  }
}

export function MarkdownView({ source, className }: { source: string; className?: string }) {
  const blocks = parseMarkdown(source);
  return (
    <div className={`space-y-3 break-words ${className ?? ""}`} data-markdown-view="">
      {blocks.map(renderBlock)}
    </div>
  );
}
