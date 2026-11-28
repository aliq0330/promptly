"use client";

import { Fragment, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChoiceGroup } from "@/components/ui/choice-group";
import { ROOM_ICON_COMPONENTS } from "@/features/messages/rooms/room-icon";
import { refreshCommunityRooms, useCommunityRooms } from "@/features/messages/rooms/use-community-rooms";
import { SxBtn, SxCard, SxField, SxGap, SxHash, SxLabel, SxNote, SxPage, SxRow, SxSep, SxSub, SxTag, SxVal, SxBarAction, SxFootPair } from "@/features/settings/sx";
import { OptionGroup } from "@/components/ui/option-group";
import {
  ROOM_DESCRIPTION_MAX,
  ROOM_ICONS,
  ROOM_LIMIT,
  ROOM_NAME_MAX,
  ROOM_SECTION_MAX,
  activeRooms,
  archivedRooms,
  groupRoomsBySection,
  sectionChoices,
  validateRoomName,
} from "@/lib/community-rooms";
import { communityHref } from "@/lib/communities";
import { useTranslation } from "@/lib/i18n/language-provider";
import { archiveCommunityRoom, createCommunityRoom, deleteCommunityRoom, reorderCommunityRooms, updateCommunityRoom } from "@/lib/supabase/community-rooms";
import type { ChatGroup, CommunityRoom, CommunityRoomIcon } from "@/types";

/** B1 · Sohbet odaları listesi · B2 · Oda formu (yeni / düzenle) — docs/mockups/ayar-sayfalari. */

function roomDesc(room: CommunityRoom, t: ReturnType<typeof useTranslation>["t"]): string {
  if (room.isDefault) return t("ay.rooms.descDefault");
  if (room.readPolicy === "staff") return t("ay.rooms.descPrivate");
  return room.postingPolicy === "admins" ? t("ay.rooms.descStaffWrites") : t("ay.rooms.descMembersWrite");
}

export function RoomsPage({ group, sub, room: roomParam, onToast }: { group: ChatGroup; sub: string | null; room: string | null; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const router = useRouter();
  const { rooms } = useCommunityRooms(group.id);
  const groups = useMemo(() => groupRoomsBySection(activeRooms(rooms), t("ay.rooms.sectionDefault")), [rooms, t]);
  const archived = useMemo(() => archivedRooms(rooms), [rooms]);
  const base = communityHref(group.id, "manage", "rooms");
  const go = (next: string | null) => router.replace(next ? `${base}&sub=${next}` : base);
  const activeCount = activeRooms(rooms).length;
  const editing = roomParam && roomParam !== "new" ? rooms.find((r) => r.id === roomParam) : undefined;
  const [sorting, setSorting] = useState(false);
  const [sortBusy, setSortBusy] = useState(false);
  const canSort = (group.myRole === "owner" || group.myRole === "admin" || group.myRole === "moderator") && activeCount > 1;

  /** Bir odayı kendi bölümünün içinde bir adım kaydırır; bölümler arası sıra değişmez (eski oda yönetimiyle aynı kural). */
  async function move(room: CommunityRoom, delta: -1 | 1) {
    if (sortBusy) return;
    const active = activeRooms(rooms);
    const key = (r: CommunityRoom) => r.section?.trim().toLocaleLowerCase("tr") ?? "";
    const same = active.filter((other) => key(other) === key(room));
    const swap = same[same.findIndex((other) => other.id === room.id) + delta];
    if (!swap) return;
    const ids = active.map((other) => other.id);
    const a = ids.indexOf(room.id);
    const b = ids.indexOf(swap.id);
    [ids[a], ids[b]] = [ids[b], ids[a]];
    setSortBusy(true);
    try {
      await reorderCommunityRooms(group.id, [...ids, ...archived.map((other) => other.id)]);
      await refreshCommunityRooms(group.id);
    } catch {
      onToast(t("rooms.manage.saveOrderFailed"));
    } finally {
      setSortBusy(false);
    }
  }

  return (
    <>
      <SxPage
        parent={t("ay.manage.title")}
        title={t("ay.rooms.title")}
        backHref={communityHref(group.id, "manage")}
        testId="community-rooms-page"
        action={
          <SxBarAction onClick={() => go("room&room=new")} disabled={activeCount >= ROOM_LIMIT}>
            {t("ay.rooms.new")}
          </SxBarAction>
        }
      >
        <p className="s" style={{ margin: "8px 20px 0" }}>{t("ay.rooms.intro", { count: activeCount, max: ROOM_LIMIT })}</p>
        {canSort && (
          <div style={{ margin: "12px 16px 0", display: "flex", justifyContent: "flex-end" }}>
            <SxBtn sm tone={sorting ? "pri" : undefined} onClick={() => setSorting((v) => !v)} data-testid="community-rooms-sort">
              {sorting ? t("ay.rooms.sortDone") : t("ay.rooms.sort")}
            </SxBtn>
          </div>
        )}
        {groups.map((g) => (
          <Fragment key={g.label}>
            <SxLabel>{g.label}</SxLabel>
            <SxCard>
              {g.rooms.map((room, index) => (
                <SxRow
                  key={room.id}
                  href={sorting ? undefined : `${base}&sub=room&room=${room.id}`}
                  lead={<SxHash />}
                  title={room.name}
                  desc={roomDesc(room, t)}
                  trailing={
                    sorting ? (
                      <span style={{ display: "flex", gap: 6 }}>
                        <SxBtn sm disabled={sortBusy || index === 0} aria-label={t("rooms.manage.moveUp")} onClick={() => void move(room, -1)}>↑</SxBtn>
                        <SxBtn sm disabled={sortBusy || index === g.rooms.length - 1} aria-label={t("rooms.manage.moveDown")} onClick={() => void move(room, 1)}>↓</SxBtn>
                      </span>
                    ) : room.isDefault ? (
                      <SxTag>{t("ay.rooms.locked")}</SxTag>
                    ) : room.readPolicy === "staff" ? (
                      <SxTag tone="or">{t("ay.rooms.private")}</SxTag>
                    ) : undefined
                  }
                />
              ))}
            </SxCard>
          </Fragment>
        ))}
        {archived.length > 0 && (
          <>
            <SxLabel>{t("ay.rooms.archive")}</SxLabel>
            <SxCard>
              <SxRow href={`${base}&sub=archived`} title={t("ay.rooms.archived")} desc={t("ay.rooms.archivedDesc", { count: archived.length })} />
            </SxCard>
          </>
        )}
        <SxGap h={16} />
        <SxNote>
          {t("ay.rooms.noteA")} <b>{t("ay.rooms.noteB")}</b> {t("ay.rooms.noteC")}
        </SxNote>
      </SxPage>

      {sub === "room" && roomParam === "new" && <RoomFormPage key="new" group={group} rooms={rooms} onClose={() => go(null)} onToast={onToast} />}
      {sub === "room" && editing && <RoomFormPage key={editing.id} group={group} rooms={rooms} room={editing} onClose={() => go(null)} onToast={onToast} />}
      {sub === "archived" && <ArchivedRoomsPage group={group} rooms={archived} onClose={() => go(null)} onToast={onToast} />}
    </>
  );
}

function ArchivedRoomsPage({ group, rooms, onClose, onToast }: { group: ChatGroup; rooms: CommunityRoom[]; onClose: () => void; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const isOwner = group.myRole === "owner";
  async function run(task: () => Promise<void>) {
    setBusy(true);
    try {
      await task();
      await refreshCommunityRooms(group.id).catch(() => undefined);
    } catch {
      onToast(t("rooms.manage.actionFailed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SxSub open onClose={onClose} parent={t("ay.rooms.title")} title={t("ay.rooms.archived")} testId="community-archived-rooms">
      <SxLabel>{t("ay.rooms.archive")}</SxLabel>
      <SxCard>
        {rooms.length === 0 && <SxRow title={t("ay.rooms.archivedEmpty")} />}
        {rooms.map((room) => (
          <SxRow
            key={room.id}
            lead={<SxHash />}
            title={room.name}
            trailing={
              <>
                <SxBtn disabled={busy} onClick={() => void run(() => archiveCommunityRoom(room.id, false))}>{t("rooms.manage.unarchive")}</SxBtn>
                {isOwner && (
                  <SxBtn tone="dng" disabled={busy} onClick={() => void run(() => deleteCommunityRoom(room.id))}>
                    {t("common.delete")}
                  </SxBtn>
                )}
              </>
            }
          />
        ))}
      </SxCard>
    </SxSub>
  );
}

const NEW_SECTION = "__new__";

/** B2 · Oda formu: ad, açıklama, simge, bölüm, kim yazar, kim görür; düzenlerken arşivle / sırala / sil. */
function RoomFormPage({ group, rooms, room, onClose, onToast }: { group: ChatGroup; rooms: readonly CommunityRoom[]; room?: CommunityRoom; onClose: () => void; onToast: (message: string) => void }) {
  const { t } = useTranslation();
  const editing = Boolean(room);
  const isDefault = room?.isDefault === true;
  const [name, setName] = useState(room?.name ?? "");
  const [description, setDescription] = useState(room?.description ?? "");
  const [icon, setIcon] = useState<CommunityRoomIcon>(room?.icon ?? "prompt");
  const [section, setSection] = useState<string>(room?.section?.trim() ?? "");
  const [newSection, setNewSection] = useState("");
  const [posting, setPosting] = useState<"members" | "admins">(room?.postingPolicy ?? "members");
  const [reading, setReading] = useState<"all" | "staff">(room?.readPolicy ?? "all");
  const [picker, setPicker] = useState<"icon" | "section" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [touched, setTouched] = useState(false);
  const activeCount = rooms.filter((r) => !r.archivedAt).length;
  const limitReached = !editing && activeCount >= ROOM_LIMIT;
  const nameState = validateRoomName(name);
  const sectionValue = section === NEW_SECTION ? newSection.trim() : section;
  const choices = useMemo(() => sectionChoices(rooms), [rooms]);
  const Icon = ROOM_ICON_COMPONENTS[icon];

  async function submit() {
    setTouched(true);
    if (busy || nameState !== "ok" || limitReached) return;
    setBusy(true);
    setError(null);
    try {
      if (room) {
        await updateCommunityRoom(room.id, { name: name.trim(), description, icon, section: sectionValue, postingPolicy: posting, ...(isDefault ? {} : { readPolicy: reading }) });
      } else {
        await createCommunityRoom(group.id, { name: name.trim(), description, icon, section: sectionValue, postingPolicy: posting, readPolicy: reading });
      }
      await refreshCommunityRooms(group.id).catch(() => undefined);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("rooms.manage.actionFailed"));
      setBusy(false);
    }
  }
  async function act(task: () => Promise<void>, done?: string) {
    setBusy(true);
    try {
      await task();
      await refreshCommunityRooms(group.id).catch(() => undefined);
      if (done) onToast(done);
      onClose();
    } catch {
      setError(t("rooms.manage.actionFailed"));
      setBusy(false);
    }
  }
  return (
    <>
      <SxPage
        close
        onBack={onClose}
        parent={t("ay.rooms.title")}
        title={editing ? t("rooms.form.editTitle") : t("rooms.form.createTitle")}
        testId="community-room-form-page"
        footer={
          <SxBtn tone="pri" full disabled={busy || limitReached} onClick={() => void submit()}>
            {busy ? t("common.saving") : editing ? t("rooms.form.save") : t("rooms.form.create")}
          </SxBtn>
        }
      >
        <SxLabel>{t("ay.rooms.info")}</SxLabel>
        <SxCard>
          <SxField id="oda-ad" label={t("rooms.form.name")} note={t("rooms.form.required")} inputProps={{ value: name, maxLength: ROOM_NAME_MAX + 10, onChange: (e) => setName(e.target.value), placeholder: t("rooms.form.namePlaceholder") }} hint={touched && nameState !== "ok" ? (nameState === "empty" ? t("rooms.form.nameEmpty") : t("rooms.form.nameTooLong", { max: ROOM_NAME_MAX })) : `${name.trim().length} / ${ROOM_NAME_MAX}`} error={touched && nameState !== "ok"} />
          <SxField id="oda-ac" label={t("rooms.form.description")} note={t("rooms.form.optional")} multiline style={{ minHeight: 80 }} textareaProps={{ value: description, maxLength: ROOM_DESCRIPTION_MAX, onChange: (e) => setDescription(e.target.value), placeholder: t("rooms.form.descriptionPlaceholder") }} />
          <SxSep />
          <SxRow nav title={t("rooms.form.icon")} desc={t("ay.rooms.iconHint")} trailing={<span className="hash"><Icon size={20} aria-hidden /></span>} onClick={() => setPicker("icon")} />
          <SxRow nav title={t("rooms.form.section")} desc={t("ay.rooms.sectionHint")} trailing={<SxVal>{sectionValue || t("ay.rooms.sectionDefault")}</SxVal>} onClick={() => setPicker("section")} />
        </SxCard>

        <SxLabel>{t("ay.rooms.permissions")}</SxLabel>
        <SxCard>
          <div className="fld">
            <div className="fl" id="oda-yaz">{t("rooms.form.whoWrites")}</div>
            <ChoiceGroup<"members" | "admins"> labelledBy="oda-yaz" variant="sx-seg" value={posting} onChange={setPosting} options={[{ key: "members", label: t("rooms.form.writeAll") }, { key: "admins", label: t("rooms.form.writeStaff") }]} />
          </div>
          <SxSep />
          <div className="fld">
            <div className="fl" id="oda-gor">{t("rooms.form.whoSees")}</div>
            <ChoiceGroup<"all" | "staff"> labelledBy="oda-gor" variant="sx-seg" disabled={isDefault} value={reading} onChange={setReading} options={[{ key: "all", label: t("rooms.form.seeAll") }, { key: "staff", label: t("rooms.form.seePrivate") }]} />
            <p className="hint">{t("ay.rooms.privateHint")}</p>
          </div>
        </SxCard>
        <SxGap h={16} />
        <SxNote>
          {t("rooms.form.defaultNote")} {t("ay.rooms.limitNote", { max: ROOM_LIMIT })}
          {(error || limitReached) && <span className="dgt"> {error ?? t("rooms.form.limit", { max: ROOM_LIMIT })}</span>}
        </SxNote>

        {editing && !isDefault && (
          <>
            <SxLabel>{t("ay.rooms.whileEditing")}</SxLabel>
            <SxCard>
              <SxRow nav title={t("ay.rooms.archiveRoom")} desc={t("ay.rooms.archiveRoomDesc")} onClick={() => void act(() => archiveCommunityRoom(room!.id, true))} />
            </SxCard>
          </>
        )}
      </SxPage>

      <SxSub open={picker === "icon"} onClose={() => setPicker(null)} parent={editing ? t("rooms.form.editTitle") : t("rooms.form.createTitle")} title={t("rooms.form.icon")} testId="room-icon-picker" footer={<SxBtn tone="pri" full onClick={() => setPicker(null)}>{t("ay.pick")}</SxBtn>}>
        <SxLabel>{t("ay.pickLabel")}</SxLabel>
        <div style={{ padding: "0 16px" }}>
          <ChoiceGroup<CommunityRoomIcon> variant="tile" iconOnly ariaLabel={t("rooms.form.icon")} value={icon} onChange={setIcon} options={ROOM_ICONS.map((key) => ({ key, label: t(`rooms.icon.${key}` as const), icon: ROOM_ICON_COMPONENTS[key] }))} />
        </div>
      </SxSub>
      <SxSub
        open={picker === "section"}
        onClose={() => setPicker(null)}
        parent={editing ? t("rooms.form.editTitle") : t("rooms.form.createTitle")}
        title={t("rooms.form.section")}
        testId="room-section-picker"
        footer={
          <SxFootPair cancelLabel={t("common.cancel")} onCancel={() => setPicker(null)}>
            <SxBtn tone="pri" full onClick={() => setPicker(null)}>{t("ay.pick")}</SxBtn>
          </SxFootPair>
        }
      >
        <SxLabel>{t("ay.pickLabel")}</SxLabel>
        <SxCard>
          <OptionGroup<string>
            variant="sx-list"
            ariaLabel={t("rooms.form.sectionPick")}
            value={section === NEW_SECTION ? NEW_SECTION : section === "" ? "__default__" : section}
            onChange={(key) => setSection(key === "__default__" ? "" : key)}
            options={[...["", ...choices].map((c) => ({ key: c || "__default__", label: c || t("ay.rooms.sectionDefault") })), { key: NEW_SECTION, label: t("rooms.form.sectionNew") }]}
          />
        </SxCard>
        {section === NEW_SECTION && (
          <SxCard style={{ marginTop: 14 }}>
            <SxField id="oda-bolum" label={t("rooms.form.sectionNew")} inputProps={{ value: newSection, maxLength: ROOM_SECTION_MAX, onChange: (e) => setNewSection(e.target.value), placeholder: t("rooms.form.sectionNewPlaceholder") }} />
          </SxCard>
        )}
      </SxSub>
    </>
  );
}

