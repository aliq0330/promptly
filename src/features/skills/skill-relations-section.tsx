"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "@/components/icons/plus";
import { Button } from "@/components/ui/button";
import { InlineAlert } from "@/components/ui/inline-alert";
import { CompactContentCard, type AttachmentState } from "@/features/content/compact-content-card";
import { ContentPickerDialog } from "@/features/teams/content-picker";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { SKILL_LIMITS } from "@/lib/skills/limits";
import { attachmentKey, fetchAttachmentCards, type AttachmentCard } from "@/lib/supabase/comment-attachments";
import { addSkillRelation, fetchSkillRelations, removeSkillRelation, skillErrorMessage, type SkillRelation, type SkillRelationType } from "@/lib/supabase/skill-package";

const KINDS: { type: SkillRelationType; label: TranslationKey }[] = [
  { type: "prompt", label: "skill.rel.addPrompt" },
  { type: "workflow", label: "skill.rel.addWorkflow" },
  { type: "preset", label: "skill.rel.addPreset" },
];

/**
 * Gelişmiş mod: Skill'e bağlı içerik (docs/history/389-*). Prompt / Workflow / Ayar paketi KOPYALANMAZ, kimlikle bağlanır (`skill_relations`);
 * seçim mevcut Oluştur/Seç kalıbının "Seç" penceresidir (`ContentPickerDialog`). Yalnız yayında + herkese açık içerik bağlanır (sunucu da zorlar).
 */
export function SkillRelationsSection({ skillId, ensureDraft, disabled }: { skillId: string | null; ensureDraft: () => Promise<string | null>; disabled?: boolean }) {
  const { t } = useTranslation();
  const [relations, setRelations] = useState<SkillRelation[]>([]);
  const [cards, setCards] = useState<Map<string, AttachmentCard>>(new Map());
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(Boolean(skillId));
  const [picker, setPicker] = useState<SkillRelationType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadCards = useCallback(async (list: SkillRelation[]) => {
    if (list.length === 0) return setCards(new Map());
    const result = await fetchAttachmentCards(list.map((relation) => ({ type: relation.type, id: relation.targetId })));
    setCards(result.cards);
    setFailed(new Set([...result.failed]));
  }, []);

  useEffect(() => {
    if (!skillId) return;
    let cancelled = false;
    fetchSkillRelations(skillId)
      .then(async (list) => {
        if (cancelled) return;
        setRelations(list);
        await loadCards(list);
      })
      .catch(() => !cancelled && setError(t("skill.rel.loadFailed")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `t` kimliği dil değişince değişir; yeniden yükleme gerekmez.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skillId, loadCards]);

  const already = useMemo(() => new Set(relations.filter((relation) => relation.type === picker).map((relation) => relation.targetId)), [relations, picker]);
  const full = relations.length >= SKILL_LIMITS.maxRelations;

  async function pick(item: { id: string }) {
    if (!picker) return;
    const id = await ensureDraft();
    if (!id) throw new Error(t("skill.pkg.needTitleFirst"));
    try {
      const created = await addSkillRelation(id, picker, item.id, relations.length);
      const next = [...relations, created];
      setRelations(next);
      await loadCards(next);
    } catch (err) {
      throw new Error(skillErrorMessage(err));
    }
  }

  async function remove(relation: SkillRelation) {
    if (!skillId) return;
    setError(null);
    try {
      await removeSkillRelation(skillId, relation.id);
      setRelations((prev) => prev.filter((item) => item.id !== relation.id));
    } catch (err) {
      setError(skillErrorMessage(err));
    }
  }

  return (
    <div className="space-y-3" data-skill-relations="">
      <p className="text-small text-text-secondary">{t("skill.rel.intro")}</p>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {loading ? (
        <p className="text-small text-text-muted" role="status">{t("common.loading")}</p>
      ) : relations.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-small text-text-muted">{t("skill.rel.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {relations.map((relation) => {
            const card = cards.get(attachmentKey({ type: relation.type, id: relation.targetId }));
            const state: AttachmentState = card ? { status: "ready", card } : failed.has(relation.type) ? { status: "error" } : { status: "hidden" };
            return (
              <li key={relation.id}>
                <CompactContentCard attachment={{ type: relation.type, id: relation.targetId }} state={state} onRemove={() => void remove(relation)} className="max-w-full" />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        {KINDS.map((kind) => (
          <Button key={kind.type} type="button" variant="outline" size="sm" disabled={disabled || full} onClick={() => setPicker(kind.type)} data-skill-relation-add={kind.type}>
            <Plus size={16} aria-hidden /> {t(kind.label)}
          </Button>
        ))}
      </div>
      {full && <p className="text-caption text-text-muted">{t("skill.rel.full", { max: String(SKILL_LIMITS.maxRelations) })}</p>}
      {picker && <ContentPickerDialog kind={picker} onClose={() => setPicker(null)} onPick={pick} alreadyIds={already} />}
    </div>
  );
}
