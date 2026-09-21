"use client";

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
        className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border py-2.5 text-sm font-medium text-text transition-colors hover:bg-accent-surface"
      >
        <Plus size={16} />
        Koleksiyon oluştur
      </button>

      {collections.length === 0 ? (
        <div className="space-y-3 py-10 text-center">
          <FolderPlus size={32} className="mx-auto text-text-muted" />
          <p className="text-sm font-medium text-text">Henüz koleksiyonun yok</p>
          <p className="text-sm text-text-muted">Kaydettiğin çalışmaları düzenlemek için bir koleksiyon oluştur.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
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
