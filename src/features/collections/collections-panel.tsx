"use client";

import { EmptyState } from "@/components/ui/empty-state";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bookmark, FolderPlus, Plus } from "lucide-react";
import { CollectionCard } from "./collection-card";
import { CollectionFormModal } from "./collection-form-modal";
import { createCollection, fetchFollowedCollections, fetchOwnCollections, updateCollection } from "@/lib/supabase/collections";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Collection, UserProfile } from "@/types";

/**
 * The profile "Kaydedilenler" tab — only ever rendered for the signed-in
 * owner viewing their own profile (ProfileView already gates the whole tab
 * this way), so every collection here belongs to the viewer regardless of its
 * visibility flag. The first tile opens "Kaydedilenler" (`/saved`, the union
 * of everything in any collection); the cards after it are the collections
 * themselves, "Genel" first, each an independent list.
 */
export function CollectionsPanel({ ownerId, ownerProfile }: { ownerId: string; ownerProfile: UserProfile }) {
  const { t } = useTranslation();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<"none" | "create" | { edit: Collection }>("none");
  const [followed, setFollowed] = useState<Collection[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchFollowedCollections(ownerId).then((list) => !cancelled && setFollowed(list));
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resyncs the loading flag when ownerId changes (owner never actually changes here, but keeps the effect correct if it ever did)
    setLoading(true);
    fetchOwnCollections(ownerId).then((result) => {
      if (!cancelled) {
        setCollections(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [ownerId]);

  if (loading) {
    return <p className="py-10 text-center text-sm text-text-muted">{t("common.loading")}</p>;
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setFormMode("create")}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-label font-medium text-text-secondary transition-colors hover:border-primary/40 hover:bg-surface-soft hover:text-primary"
      >
        <Plus size={16} />
        {t("collection.createButton")}
      </button>

      <div className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
        <SavedShortcutCard />
        {collections.map((collection) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            onEdit={() => setFormMode({ edit: collection })}
            onDeleted={() => setCollections((prev) => prev.filter((c) => c.id !== collection.id))}
          />
        ))}
      </div>

      {collections.length === 0 && (
        <EmptyState
          icon={FolderPlus}
          title={t("collection.emptyTitle")}
          description={t("collection.emptyDescription")}
          className="border-0"
        />
      )}

      {followed.length > 0 && (
        <section aria-labelledby="followed-collections-heading" className="space-y-3 pt-4">
          <h3 id="followed-collections-heading" className="text-caption font-semibold uppercase tracking-[0.08em] text-text-muted">
            {t("collection.followedHeading")}
          </h3>
          <div className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
            {followed.map((collection) => (
              <CollectionCard key={collection.id} collection={collection} readOnly />
            ))}
          </div>
        </section>
      )}

      {formMode === "create" && (
        <CollectionFormModal
          onClose={() => setFormMode("none")}
          onSubmit={async (values) => {
            const created = await createCollection(values, ownerId, ownerProfile);
            setCollections((prev) => [created, ...prev]);
            setFormMode("none");
          }}
        />
      )}

      {typeof formMode === "object" && (
        <CollectionFormModal
          collection={formMode.edit}
          onClose={() => setFormMode("none")}
          onSubmit={async (values) => {
            await updateCollection(formMode.edit.id, values);
            setCollections((prev) =>
              prev.map((c) => (c.id === formMode.edit.id ? { ...c, name: values.name, visibility: values.visibility } : c)),
            );
            setFormMode("none");
          }}
        />
      )}
    </div>
  );
}

/** The "Kaydedilenler" tile: not a collection, a view over all of them — styled like a collection card so it reads as the first item in the shelf. */
function SavedShortcutCard() {
  const { t } = useTranslation();
  return (
    <Link
      href="/saved"
      className="group block min-w-0 overflow-hidden rounded-lg border border-border-soft bg-surface shadow-card transition-[border-color,box-shadow] duration-200 hover:border-border hover:shadow-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-soft text-primary">
        <span className="flex h-12 w-12 items-center justify-center rounded-md bg-primary-soft">
          <Bookmark size={22} strokeWidth={1.75} />
        </span>
      </div>
      <div className="min-w-0 space-y-1 p-3">
        <p className="truncate text-label font-semibold text-text">{t("nav.saved")}</p>
        <p className="text-caption text-text-muted">{t("saved.tileHint")}</p>
      </div>
    </Link>
  );
}
