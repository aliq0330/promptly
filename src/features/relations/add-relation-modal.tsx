"use client";

import { useEffect, useState } from "react";
import { ArrowLeftRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip, ChipRow } from "@/components/ui/chip";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import { createManualRelation, searchRelatableContent } from "@/lib/supabase/relations";
import {
  MANUAL_RELATION_TYPES,
  RELATABLE_KINDS,
  RELATION_TYPES,
  type ManualRelationType,
  type RelatableKind,
  type RelationNode,
} from "@/lib/relations/types";
import { KIND_ICON, useRelationText } from "./relation-text";

/**
 * "İlişki ekle": pick a relation type → search accessible content → choose
 * the target → read the direction → save. The database (RLS) decides who may
 * relate what — here we only guide: at least one end must be the viewer's
 * own content, the other end must be visible content.
 */
export function AddRelationModal({
  center,
  viewerId,
  onClose,
  onCreated,
}: {
  center: RelationNode;
  viewerId: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { t, kindLabel, typeLabel } = useRelationText();
  const [type, setType] = useState<ManualRelationType>("similar");
  const [kinds, setKinds] = useState<RelatableKind[]>([...RELATABLE_KINDS]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ key: string; items: RelationNode[] } | null>(null);
  const [target, setTarget] = useState<RelationNode | null>(null);
  const [swapped, setSwapped] = useState(false);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Debounced search; a response only counts for the query it was made for.
  const searchKey = `${query.trim()}|${kinds.join(",")}`;
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const items = await searchRelatableContent(query, kinds, viewerId, { kind: center.kind as RelatableKind, id: center.id });
      if (!cancelled) setFound({ key: searchKey, items });
    }, query.trim() ? 300 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- searchKey already encodes query + kinds
  }, [searchKey, viewerId, center.kind, center.id]);
  const results = found?.items ?? null;
  const searching = found?.key !== searchKey;

  const centerMine = center.ownerId === viewerId;
  const targetMine = target?.ownerId === viewerId;
  const directed = RELATION_TYPES[type].directed;
  const canSwap = Boolean(target) && centerMine && targetMine && directed;
  // Default: the center is the source when the viewer owns it, otherwise the picked content (which then must be theirs).
  const centerIsSource = target ? (centerMine ? !swapped : false) : true;
  const source = target ? (centerIsSource ? center : target) : center;
  const sink = target ? (centerIsSource ? target : center) : null;
  const hasPermission = Boolean(target) && (centerMine || targetMine);

  const toggleKind = (kind: RelatableKind) =>
    setKinds((current) => (current.includes(kind) ? (current.length > 1 ? current.filter((k) => k !== kind) : current) : [...current, kind]));

  const save = async () => {
    if (!target || !sink || !hasPermission) return;
    setSaving(true);
    setError(null);
    try {
      await createManualRelation(
        { sourceKind: source.kind as RelatableKind, sourceId: source.id, targetKind: sink.kind as RelatableKind, targetId: sink.id, type, note },
        viewerId,
      );
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("relations.error.generic"));
      setSaving(false);
    }
  };

  return (
    <Modal onClose={onClose} labelledBy="add-relation-title">
      <div role="document" onClick={(event) => event.stopPropagation()} className="flex max-h-[88dvh] w-full max-w-xl flex-col rounded-lg border border-border bg-surface shadow-pop">
        <div className="flex items-center gap-3 border-b border-border-soft px-4 py-3">
          <h2 id="add-relation-title" className="min-w-0 flex-1 text-h3 font-semibold text-text">
            {t("relations.add.title")}
          </h2>
          <button type="button" aria-label={t("common.close")} onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-text-muted hover:bg-surface-soft hover:text-text">
            <X size={18} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <fieldset className="space-y-2">
            <legend className="text-label font-semibold text-text">{t("relations.add.typeStep")}</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {MANUAL_RELATION_TYPES.map((option) => (
                <label
                  key={option}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition-colors has-checked:border-primary has-checked:bg-primary-soft",
                    "border-border hover:border-border-strong",
                  )}
                >
                  <input type="radio" name="relation-type" value={option} checked={type === option} onChange={() => setType(option)} className="sr-only" />
                  <span className="text-small font-semibold text-text">{typeLabel(option)}</span>
                  <span className="text-caption text-text-muted">{t(RELATION_TYPES[option].meaningKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="space-y-2">
            <p className="text-label font-semibold text-text">{t("relations.add.contentStep")}</p>
            <ChipRow scroll aria-label={t("relations.add.kindsAria")}>
              {RELATABLE_KINDS.map((kind) => (
                <Chip key={kind} icon={KIND_ICON[kind]} selected={kinds.includes(kind)} onClick={() => toggleKind(kind)}>
                  {kindLabel(kind)}
                </Chip>
              ))}
            </ChipRow>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("relations.add.searchPlaceholder")}
                aria-label={t("relations.add.searchPlaceholder")}
                className="h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-small text-text shadow-xs placeholder:text-text-muted hover:border-border-strong focus:border-primary focus:outline-none"
              />
            </div>
            {!query.trim() && <p className="text-caption text-text-muted">{t("relations.add.searchHint")}</p>}

            <ul className="max-h-56 divide-y divide-border-soft overflow-y-auto rounded-lg border border-border-soft" data-relation-results>
              {searching && results === null && <li className="px-3 py-3 text-small text-text-muted">{t("relations.add.searching")}</li>}
              {results?.length === 0 && !searching && <li className="px-3 py-3 text-small text-text-muted">{t("relations.add.noResults")}</li>}
              {results?.map((node) => {
                const Icon = KIND_ICON[node.kind];
                const selected = target?.key === node.key;
                return (
                  <li key={node.key}>
                    <button
                      type="button"
                      aria-pressed={selected}
                      onClick={() => {
                        setTarget(node);
                        setSwapped(false);
                        setError(null);
                      }}
                      className={cn("flex min-h-[48px] w-full items-center gap-3 px-3 py-2 text-left hover:bg-surface-soft", selected && "bg-primary-soft")}
                    >
                      <Icon size={16} className="shrink-0 text-text-muted" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-small font-medium text-text">{node.title}</span>
                        <span className="block truncate text-caption text-text-muted">
                          {kindLabel(node.kind)}
                          {node.ownerName ? ` · ${node.ownerName}` : ""}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {target && (
            <div className="space-y-3 rounded-lg border border-border-soft bg-surface-soft p-3" data-relation-summary>
              <p className="text-label font-semibold text-text">{t("relations.add.directionTitle")}</p>
              <p className="break-words text-small text-text">
                {directed
                  ? t("relations.direction.directed", { from: source.title, to: sink?.title ?? "" })
                  : t("relations.direction.undirected", { a: source.title, b: sink?.title ?? "" })}
              </p>
              <p className="text-caption text-text-muted">{t(RELATION_TYPES[type].meaningKey)}</p>
              {canSwap && (
                <Button type="button" size="sm" variant="outline" onClick={() => setSwapped((v) => !v)}>
                  <ArrowLeftRight size={14} />
                  {t("relations.add.swap")}
                </Button>
              )}
              {!hasPermission && (
                <p role="alert" className="text-small text-danger">
                  {t("relations.add.notOwner")}
                </p>
              )}
              <label className="block space-y-1">
                <span className="text-label font-medium text-text">{t("relations.add.noteLabel")}</span>
                <textarea
                  value={note}
                  onChange={(event) => setNote(event.target.value.slice(0, 200))}
                  placeholder={t("relations.add.notePlaceholder")}
                  rows={2}
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-small text-text shadow-xs placeholder:text-text-muted hover:border-border-strong focus:border-primary focus:outline-none"
                />
              </label>
            </div>
          )}

          {error && (
            <p role="alert" className="text-small text-danger">
              {error}
            </p>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border-soft px-4 py-3">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={save} disabled={!target || !hasPermission || saving} data-action="save-relation">
            {saving ? t("relations.add.saving") : t("relations.add.save")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
