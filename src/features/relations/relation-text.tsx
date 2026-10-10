"use client";

import { Blocks, PenLine, Sparkles, SquareTerminal, Workflow, type LucideIcon } from "lucide-react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { isContentTypeId, taxonomyLabel, taxonomyPathLabel } from "@/lib/content-taxonomy";
import { RELATION_TYPES, type RelationEdge, type RelationNodeKind, type RelationReason, type RelationType } from "@/lib/relations/types";

export const KIND_ICON: Record<RelationNodeKind, LucideIcon> = {
  prompt: SquareTerminal,
  generator: Blocks,
  workflow: Workflow,
  request: Sparkles,
  suggestion: PenLine,
};

/**
 * Everything that turns the map's structured data into words, in the active
 * language. Reasons are rendered from the real comparison / link data they
 * carry — nothing here invents an explanation.
 */
export function useRelationText() {
  const { t, language } = useTranslation();

  const kindLabel = (kind: RelationNodeKind) => t(`relations.kind.${kind}` as TranslationKey);
  const typeLabel = (type: RelationType) => t(RELATION_TYPES[type].labelKey);
  const originLabel = (type: RelationType) => t(`relations.origin.${RELATION_TYPES[type].origin}` as TranslationKey);

  const reasonText = (reason: RelationReason): string => {
    switch (reason.kind) {
      case "sharedSection":
        return t("relations.reason.sharedSection", {
          section: t(`dna.section.${reason.section}` as TranslationKey),
          pieces: reason.pieces.join(", "),
        });
      case "sharedTags":
        return t("relations.reason.sharedTags", { tags: reason.tags.join(", ") });
      case "sameCategory": {
        if (!isContentTypeId(reason.contentType)) return t("relations.reason.sameCategory", { category: taxonomyLabel(reason.category, language) });
        const category = taxonomyPathLabel({ contentType: reason.contentType, category: reason.category }, language, false) || reason.category;
        const subcategory = reason.subcategory
          ? taxonomyPathLabel({ contentType: reason.contentType, category: reason.category, subcategory: reason.subcategory }, language, false).split(" · ")[1]
          : null;
        return subcategory ? t("relations.reason.sameSubcategory", { category, subcategory }) : t("relations.reason.sameCategory", { category });
      }
      case "workflow":
        return t("relations.reason.workflow", { workflow: reason.workflowTitle, position: reason.position });
      case "workflowNeighbor":
        return t("relations.reason.workflowNeighbor", { workflow: reason.workflowTitle, from: reason.fromPosition, to: reason.toPosition });
      case "selectedAnswer":
        return t("relations.reason.selectedAnswer");
      case "suggestion":
        return reason.versionNumber !== null ? t("relations.reason.suggestionVersion", { version: reason.versionNumber }) : t("relations.reason.suggestion");
      case "note":
        return reason.text;
      case "info":
        return t(reason.key);
    }
  };

  /** "Moda Çekimi → Portre Generator" / "A ↔ B" — the relation read aloud. */
  const directionText = (edge: Pick<RelationEdge, "type" | "from" | "to">, titleOf: (key: string) => string): string =>
    RELATION_TYPES[edge.type].directed
      ? t("relations.direction.directed", { from: titleOf(edge.from), to: titleOf(edge.to) })
      : t("relations.direction.undirected", { a: titleOf(edge.from), b: titleOf(edge.to) });

  const levelLabel = (level: "high" | "medium" | "low") => t(`relations.level.${level}` as TranslationKey);

  return { t, language, kindLabel, typeLabel, originLabel, reasonText, directionText, levelLabel };
}
