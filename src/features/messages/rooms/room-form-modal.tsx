"use client";

import { useId, useMemo, useState } from "react";
import { ChevronRight } from "@/components/icons/chevron-right";
import { Button } from "@/components/ui/button";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { OptionGroup } from "@/components/ui/option-group";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { useTranslation } from "@/lib/i18n/language-provider";
import {
  ROOM_DESCRIPTION_MAX,
  ROOM_ICONS,
  ROOM_LIMIT,
  ROOM_NAME_MAX,
  ROOM_SECTION_MAX,
  roomOutcomeKey,
  sectionChoices,
  validateRoomName,
} from "@/lib/community-rooms";
import { createCommunityRoom, updateCommunityRoom } from "@/lib/supabase/community-rooms";
import { cn } from "@/lib/utils";
import type { CommunityRoom, CommunityRoomIcon } from "@/types";
import { refreshCommunityRooms } from "./use-community-rooms";
import { ROOM_ICON_COMPONENTS } from "./room-icon";
import { InlineAlert } from "@/components/ui/inline-alert";

const NEW_SECTION = "__new__";
const DEFAULT_SECTION = "__default__";

/**
 * Oda ekle / düzenle penceresi (docs/history/352-*, mockup 5): ad, açıklama, simge, bölüm, kim yazar, kim görür + "ne olacak" cümlesi.
 * Alttan açılan kart kalıbı (`SpaceDialog`: başlık ve alt düğmeler sabit, ortası kayar). `sectionOnly`: yönetimdeki "Bölüme taşı" — yalnız bölüm seçici.
 */
export function RoomFormModal({
  communityId,
  rooms,
  room,
  sectionOnly = false,
  onClose,
  onSaved,
}: {
  communityId: string;
  rooms: readonly CommunityRoom[];
  /** Verilirse düzenleme; yoksa yeni oda. */
  room?: CommunityRoom;
  sectionOnly?: boolean;
  onClose: () => void;
  onSaved?: (roomId: string) => void;
}) {
  const { t } = useTranslation();
  const uid = useId();
  const editing = Boolean(room);
  const isDefault = room?.isDefault === true;
  const [name, setName] = useState(room?.name ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [icon, setIcon] = useState<CommunityRoomIcon>(room?.icon ?? "prompt");
  const [section, setSection] = useState<string>(room?.section?.trim() ?? "");
  const [newSection, setNewSection] = useState("");
  const [sectionOpen, setSectionOpen] = useState(sectionOnly);
  const [posting, setPosting] = useState<"members" | "admins">(room?.postingPolicy ?? "members");
  const [reading, setReading] = useState<"all" | "staff">(room?.readPolicy ?? "all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showNameError, setShowNameError] = useState(false);

  const choices = useMemo(() => sectionChoices(rooms), [rooms]);
  const activeCount = rooms.filter((r) => !r.archivedAt).length;
  const limitReached = !editing && activeCount >= ROOM_LIMIT;
  const nameState = validateRoomName(name);
  const sectionValue = section === NEW_SECTION ? newSection.trim() : section;
  const sectionLabel = sectionValue || t("rooms.sectionDefault");

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (!sectionOnly && nameState !== "ok") {
      setShowNameError(true);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      let savedId = room?.id ?? "";
      if (room) {
        await updateCommunityRoom(
          room.id,
          sectionOnly
            ? { section: sectionValue }
            : { name: name.trim(), description, icon, section: sectionValue, postingPolicy: posting, ...(isDefault ? {} : { readPolicy: reading }) },
        );
      } else {
        savedId = await createCommunityRoom(communityId, { name: name.trim(), description, icon, section: sectionValue, postingPolicy: posting, readPolicy: reading });
      }
      await refreshCommunityRooms(communityId).catch(() => undefined);
      onSaved?.(savedId);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rooms.manage.actionFailed"));
      setBusy(false);
    }
  }

  const title = sectionOnly ? t("rooms.manage.moveTitle") : editing ? t("rooms.form.editTitle") : t("rooms.form.createTitle");
  return (
    <SpaceDialog
      title={title}
      onClose={onClose}
      busy={busy}
      formTestId="room-form"
      onSubmit={(event) => void submit(event)}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={busy || limitReached}>
            {busy ? t("common.saving") : editing ? t("rooms.form.save") : t("rooms.form.create")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        {limitReached && <InlineAlert>{t("rooms.form.limit", { max: ROOM_LIMIT })}</InlineAlert>}

        {!sectionOnly && (
          <>
            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor={`${uid}-name`} className="text-label font-semibold text-text">{t("rooms.form.name")}</label>
                <span className="text-caption font-semibold text-secondary">{t("rooms.form.required")}</span>
              </div>
              <div className={cn("mt-1.5 flex h-12 items-center gap-2 rounded-lg border bg-surface px-4", showNameError && nameState !== "ok" ? "border-danger" : "border-border focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20")}>
                <span aria-hidden className="font-semibold text-text-muted">#</span>
                <input
                  id={`${uid}-name`}
                  type="text"
                  value={name}
                  maxLength={ROOM_NAME_MAX + 10}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={t("rooms.form.namePlaceholder")}
                  aria-invalid={showNameError && nameState !== "ok"}
                  aria-describedby={`${uid}-name-hint`}
                  className="min-w-0 flex-1 bg-transparent text-body text-text outline-none placeholder:text-text-muted"
                />
                <span className="text-caption tabular-nums text-text-muted">{name.trim().length}/{ROOM_NAME_MAX}</span>
              </div>
              <p id={`${uid}-name-hint`} role={showNameError && nameState !== "ok" ? "alert" : undefined} className={cn("mt-1 text-caption", showNameError && nameState !== "ok" ? "text-danger" : "sr-only")}>
                {nameState === "empty" ? t("rooms.form.nameEmpty") : nameState === "tooLong" ? t("rooms.form.nameTooLong", { max: ROOM_NAME_MAX }) : ""}
              </p>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <label htmlFor={`${uid}-desc`} className="text-label font-semibold text-text">{t("rooms.form.description")}</label>
                <span className="text-caption text-text-muted">{t("rooms.form.optional")}</span>
              </div>
              <input
                id={`${uid}-desc`}
                type="text"
                value={description}
                maxLength={ROOM_DESCRIPTION_MAX}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={t("rooms.form.descriptionPlaceholder")}
                className="mt-1.5 h-12 w-full rounded-lg card-flat px-4 text-body text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
              />
            </div>

            <div>
              <p id={`${uid}-icon`} className="text-label font-semibold text-text">
                {t("rooms.form.icon")}
              </p>
              <ChoiceGroup<CommunityRoomIcon>
                labelledBy={`${uid}-icon`}
                variant="tile"
                iconOnly
                className="mt-1.5"
                value={icon}
                onChange={setIcon}
                options={ROOM_ICONS.map((key) => ({ key, label: t(`rooms.icon.${key}` as const), icon: ROOM_ICON_COMPONENTS[key] }))}
              />
            </div>
          </>
        )}

        <div>
          {!sectionOnly && (
            <button
              type="button"
              onClick={() => setSectionOpen((open) => !open)}
              aria-expanded={sectionOpen}
              className="flex min-h-[52px] w-full items-center justify-between rounded-lg card-flat px-4 text-left text-body hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="font-semibold text-text">{t("rooms.form.section")}</span>
              <span className="flex items-center gap-1.5 text-text-secondary">
                {sectionLabel}
                <ChevronRight size={20} className={cn("transition-transform", sectionOpen && "rotate-90")} aria-hidden />
              </span>
            </button>
          )}
          {sectionOpen && (
            <div className="mt-2 space-y-2">
              <OptionGroup<string>
                ariaLabel={t("rooms.form.sectionPick")}
                value={section === NEW_SECTION ? NEW_SECTION : section === "" ? DEFAULT_SECTION : section}
                onChange={(key) => setSection(key === DEFAULT_SECTION ? "" : key)}
                options={[
                  ...["", ...choices].map((choice) => ({ key: choice || DEFAULT_SECTION, label: choice || t("rooms.sectionDefault") })),
                  { key: NEW_SECTION, label: t("rooms.form.sectionNew") },
                ]}
              />
              {section === NEW_SECTION && (
                <input
                  type="text"
                  value={newSection}
                  maxLength={ROOM_SECTION_MAX}
                  onChange={(event) => setNewSection(event.target.value)}
                  placeholder={t("rooms.form.sectionNewPlaceholder")}
                  aria-label={t("rooms.form.sectionNewPlaceholder")}
                  className="h-12 w-full rounded-lg card-flat px-4 text-body text-text outline-none placeholder:text-text-muted focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              )}
            </div>
          )}
        </div>

        {!sectionOnly && (
          <>
            <div>
              <p id={`${uid}-writes`} className="mb-1.5 text-label font-semibold text-text">
                {t("rooms.form.whoWrites")}
              </p>
              <ChoiceGroup<"members" | "admins">
                labelledBy={`${uid}-writes`}
                variant="segmented"
                value={posting}
                onChange={setPosting}
                options={[
                  { key: "members", label: t("rooms.form.writeAll") },
                  { key: "admins", label: t("rooms.form.writeStaff") },
                ]}
              />
            </div>

            <div>
              <p id={`${uid}-sees`} className="mb-1.5 text-label font-semibold text-text">
                {t("rooms.form.whoSees")}
              </p>
              <ChoiceGroup<"all" | "staff">
                labelledBy={`${uid}-sees`}
                variant="segmented"
                disabled={isDefault}
                value={reading}
                onChange={setReading}
                options={[
                  { key: "all", label: t("rooms.form.seeAll") },
                  { key: "staff", label: t("rooms.form.seePrivate") },
                ]}
              />
            </div>

            {isDefault && <p className="text-caption text-text-muted">{t("rooms.form.defaultNote")}</p>}

            <p data-room-outcome className="rounded-lg bg-primary-soft px-4 py-3 text-small leading-relaxed text-text">{t(roomOutcomeKey(isDefault ? "all" : reading, posting))}</p>
          </>
        )}

        {error && <InlineAlert>{error}</InlineAlert>}
      </div>
    </SpaceDialog>
  );
}
