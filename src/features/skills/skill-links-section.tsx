"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus } from "@/components/icons/plus";
import { Search } from "@/components/icons/search";
import { X } from "@/components/icons/x";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { InlineAlert } from "@/components/ui/inline-alert";
import { Modal } from "@/components/ui/modal";
import { AsideSection, DetailSection } from "@/features/content/detail-parts";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fetchSkillFeedPage } from "@/lib/supabase/skill-discovery";
import { addSkillLink, fetchLinkedSkills, fetchSkillLinks, removeSkillLink, SKILL_LINK_MAX, type SkillLink } from "@/lib/supabase/skill-links";
import { skillErrorMessage } from "@/lib/supabase/skill-package";
import type { Skill } from "@/types";
import { SkillCard } from "./skill-card";

/** Okuma tarafı: bu Skill ile birlikte kullanılan Skill'ler. Liste boşsa ya da hiçbiri okunamıyorsa bölüm hiç çizilmez. */
export function SkillLinkedSkills({ skillId, aside = false }: { skillId: string; aside?: boolean }) {
  const { t } = useTranslation();
  const [skills, setSkills] = useState<Skill[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchSkillLinks(skillId)
      .then(async (links) => {
        if (links.length === 0) return;
        const found = await fetchLinkedSkills(links);
        if (!cancelled) setSkills(found);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [skillId]);
  if (skills.length === 0) return null;
  const list = (
    <ul className={aside ? "grid gap-3" : "grid gap-3 sm:grid-cols-2"} data-skill-linked="">
      {skills.map((skill) => (
        <li key={skill.id}>
          <SkillCard skill={skill} />
        </li>
      ))}
    </ul>
  );
  return aside ? (
    <AsideSection id="skill-links" title={t("skill.links.title")}>
      {list}
    </AsideSection>
  ) : (
    <DetailSection title={t("skill.links.title")} id="skill-links">
      {list}
    </DetailSection>
  );
}

/** Düzenleyici tarafı: Skill ekle (başlıkla ara, yalnız yayında + herkese açık) ve kaldır. Yalnız sahibi yazar; sunucu kuralları ayrıca zorlar. */
export function SkillLinksEditor({ skillId, ensureDraft, disabled }: { skillId: string | null; ensureDraft: () => Promise<string | null>; disabled?: boolean }) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<SkillLink[]>([]);
  const [skills, setSkills] = useState<Map<string, Skill>>(new Map());
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (list: SkillLink[]) => {
    setLinks(list);
    const found = await fetchLinkedSkills(list);
    setSkills(new Map(found.map((skill) => [skill.id, skill])));
  }, []);

  useEffect(() => {
    if (!skillId) return;
    let cancelled = false;
    fetchSkillLinks(skillId)
      .then(async (list) => {
        if (!cancelled) await load(list);
      })
      .catch(() => !cancelled && setError(t("skill.links.loadFailed")));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `t` kimliği dil değişince değişir; yeniden yükleme gerekmez
  }, [skillId, load]);

  async function add(skill: Skill) {
    setError(null);
    const id = await ensureDraft();
    if (!id) return setError(t("skill.pkg.needTitleFirst"));
    try {
      const created = await addSkillLink(id, skill.id, links.length);
      setSkills((prev) => new Map(prev).set(skill.id, skill));
      setLinks((prev) => [...prev, created]);
      setOpen(false);
    } catch (err) {
      setError(skillErrorMessage(err));
    }
  }

  async function remove(link: SkillLink) {
    if (!skillId) return;
    setError(null);
    try {
      await removeSkillLink(skillId, link.id);
      setLinks((prev) => prev.filter((item) => item.id !== link.id));
    } catch (err) {
      setError(skillErrorMessage(err));
    }
  }

  const full = links.length >= SKILL_LINK_MAX;
  return (
    <div className="space-y-3" data-skill-links-editor="">
      <p className="text-small text-text-secondary">{t("skill.links.intro")}</p>
      {error && <InlineAlert tone="danger">{error}</InlineAlert>}
      {links.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-4 text-center text-small text-text-muted">{t("skill.links.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {links.map((link) => (
            <li key={link.id} className="flex items-center gap-2 rounded-lg card-flat px-3 py-2" data-skill-link={link.linkedSkillId}>
              <span className="min-w-0 flex-1 truncate text-small font-semibold text-text">{skills.get(link.linkedSkillId)?.title ?? t("skill.links.unavailable")}</span>
              <button type="button" onClick={() => void remove(link)} aria-label={t("skill.links.remove")} className="rounded-full p-1.5 text-text-muted hover:bg-surface-soft hover:text-text">
                <X size={16} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
      <Button type="button" variant="outline" size="sm" disabled={disabled || full} onClick={() => setOpen(true)} data-skill-link-add="">
        <Plus size={16} aria-hidden /> {t("skill.links.add")}
      </Button>
      {full && <p className="text-caption text-text-muted">{t("skill.links.full", { max: String(SKILL_LINK_MAX) })}</p>}
      {open && <SkillLinkPicker excludeIds={new Set([skillId ?? "", ...links.map((link) => link.linkedSkillId)])} onPick={add} onClose={() => setOpen(false)} />}
    </div>
  );
}

function SkillLinkPicker({ excludeIds, onPick, onClose }: { excludeIds: Set<string>; onPick: (skill: Skill) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Skill[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      fetchSkillFeedPage({ query: query.trim(), sort: "popular" }, 12)
        .then((page) => !cancelled && setItems(page.items.filter((skill) => !excludeIds.has(skill.id))))
        .catch(() => !cancelled && setItems([]));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `excludeIds` her render yeni bir Set'tir; arama yalnız sorguya bağlıdır
  }, [query]);
  return (
    <Modal onClose={onClose} labelledBy="skill-link-picker-title">
      <div data-skill-link-picker="" className="flex max-h-[80dvh] w-full max-w-lg flex-col overflow-hidden rounded-lg card-flat shadow-pop">
        <div className="shrink-0 space-y-3 px-5 pb-2 pt-4">
          <h2 id="skill-link-picker-title" className="font-display text-h3 font-bold text-text">
            {t("skill.links.pickTitle")}
          </h2>
          <label className="relative block">
            <span className="sr-only">{t("skill.searchPlaceholder")}</span>
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden />
            <Input type="search" dense value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("skill.searchPlaceholder")} className="pl-10" />
          </label>
        </div>
        <ul className="min-h-[8rem] flex-1 space-y-1 overflow-y-auto px-3 pb-3">
          {items === null ? (
            <li className="mx-2 mt-2 h-16 skeleton-shimmer rounded-lg" aria-busy="true" />
          ) : items.length === 0 ? (
            <li className="mx-2 mt-2 rounded-lg border border-dashed border-border px-4 py-6 text-center text-small text-text-muted">{t("skill.discover.noMatchTitle")}</li>
          ) : (
            items.map((skill) => (
              <li key={skill.id}>
                <button type="button" onClick={() => onPick(skill)} data-skill-link-pick={skill.id} className="flex w-full flex-col rounded-xl px-3 py-2 text-left hover:bg-surface-soft focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                  <span className="truncate text-body font-semibold text-text">{skill.title}</span>
                  <span className="truncate text-small text-text-muted">{skill.summary}</span>
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="shrink-0 border-t border-border-soft px-5 py-3 text-right">
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
