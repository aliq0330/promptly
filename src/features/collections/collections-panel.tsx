"use client";

import { EmptyState } from "@/components/ui/empty-state";

import { useEffect, useState } from "react";
import { FolderPlus, Plus } from "lucide-react";
import { CollectionCard } from "./collection-card";
import { CollectionFormModal } from "./collection-form-modal";
import { createCollection, fetchOwnCollections, updateCollection } from "@/lib/supabase/collections";
import type { Collection, UserProfile } from "@/types";

/**
 * The profile "Kaydedilenler > Koleksiyonlar" sub-tab — only ever rendered
 * for the signed-in owner viewing their own profile (ProfileView already
 * gates the whole "Kaydedilenler" tab this way), so every collection here
 * belongs to the viewer regardless of its visibility flag.
 */
export function CollectionsPanel({ ownerId, ownerProfile }: { ownerId: string; ownerProfile: UserProfile }) {
  const [collections, setCollections] = useState<Collection[]>([]);
  const [loading, setLoading] = useState(true);
  const [formMode, setFormMode] = useState<"none" | "create" | { edit: Collection }>("none");

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
    return <p className="py-10 text-center text-sm text-text-muted">Yükleniyor…</p>;
  }

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={() => setFormMode("create")}
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-label font-medium text-text-secondary transition-colors hover:border-primary/40 hover:bg-surface-soft hover:text-primary"
      >
        <Plus size={16} />
        Koleksiyon oluştur
      </button>

      {collections.length === 0 ? (
        <EmptyState
          icon={FolderPlus}
          title="Henüz koleksiyonun yok"
          description="Kaydettiğin çalışmaları düzenlemek için bir koleksiyon oluştur."
          className="border-0"
        />
      ) : (
        <div className="grid grid-cols-2 gap-x-3 gap-y-5 pt-2 sm:grid-cols-3 sm:gap-x-4 lg:grid-cols-4">
          {collections.map((collection) => (
            <CollectionCard
              key={collection.id}
              collection={collection}
              onEdit={() => setFormMode({ edit: collection })}
              onDeleted={() => setCollections((prev) => prev.filter((c) => c.id !== collection.id))}
            />
          ))}
        </div>
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
