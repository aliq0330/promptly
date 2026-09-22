"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Blocks, Bookmark, GitBranch, Pencil, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { useOwnProfile } from "@/features/auth/own-profile-provider";
import { GeneratorPlayground } from "./generator-playground";
import { useGeneratorSaveState } from "./use-generator-save-state";
import { GENERATOR_CATEGORY_TOPIC_LABELS } from "./generator-category-meta";
import { fetchGeneratorBySlug, fetchGeneratorVersion, deleteGenerator, recordGeneratorRun, remixGenerator, type GeneratorVersionResult } from "@/lib/supabase/generators";
import { cn, formatCount, formatRelativeTime, profileHref } from "@/lib/utils";
import type { Generator, GeneratorValues } from "@/types";

/**
 * The real public generator detail + runtime page (`/generators/local?
 * slug=…` — §41/§20). Reuses `GeneratorPlayground` unchanged for the actual
 * "Generatoru Kullan" section, so the runtime a visitor uses here is
 * LITERALLY the same component the builder's own Live Preview/Preview step
 * already exercises (CLAUDE.md §12/§13).
 *
 * "Open in Prompt"/"Save" (§21-24) were deliberately collapsed into ONE real
 * bridge rather than two divergent paths: a generated prompt still needs a
 * title/author-facing description/content-type/tags before it can become a
 * real `Prompt` row, none of which a generator run has — so "Prompt Olarak
 * Aç" always records a real `generator_runs` row (so the origin link is
 * never lost) and hands off to `CreatePromptForm`'s new `?generatorRun=`
 * mode (task #8) to finish and actually publish, instead of a second,
 * parallel "instant save" action that would need to invent those missing
 * fields on its own.
 */
export function GeneratorDetailView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slug = searchParams.get("slug");
  const { user } = useAuth();
  const { profile } = useOwnProfile();

  const [generator, setGenerator] = useState<Generator | null>(null);
  const [version, setVersion] = useState<GeneratorVersionResult | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRemixing, setIsRemixing] = useState(false);
  const [isOpeningPrompt, setIsOpeningPrompt] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const saveState = useGeneratorSaveState(generator?.id ?? "");

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no slug to look up
      setLoaded(true);
      return;
    }
    setLoaded(false);
    fetchGeneratorBySlug(slug).then(async (found) => {
      if (cancelled) return;
      if (!found) {
        setGenerator(null);
        setLoaded(true);
        return;
      }
      const ver = found.currentVersionId ? await fetchGeneratorVersion(found.currentVersionId) : null;
      if (cancelled) return;
      setGenerator(found);
      setVersion(ver);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (!slug || !loaded) {
    return <div className="mx-auto max-w-lg px-4 py-16 text-center text-sm text-text-muted">{!slug ? "Generator bulunamadı." : "Yükleniyor…"}</div>;
  }

  if (!generator || !version) {
    return (
      <div className="mx-auto max-w-lg px-4 py-16 text-center">
        <h1 className="mb-2 text-lg font-semibold text-text">Generator bulunamadı</h1>
        <p className="text-sm text-text-muted">Bu generator silinmiş, gizli veya hiç var olmamış olabilir.</p>
      </div>
    );
  }

  const isOwner = user?.id === generator.creator.id;

  async function handleDelete() {
    if (!deleteConfirm) {
      setDeleteConfirm(true);
      return;
    }
    setIsDeleting(true);
    try {
      await deleteGenerator(generator!.id);
      router.push("/generators");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Silinemedi, lütfen tekrar dene.");
      setIsDeleting(false);
    }
  }

  async function handleRemix() {
    if (!user || !profile) return;
    setIsRemixing(true);
    setActionError(null);
    try {
      const remix = await remixGenerator(generator!, version!, user.id, profile);
      router.push(`/generators/create?edit=${remix.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Remix oluşturulamadı, lütfen tekrar dene.");
      setIsRemixing(false);
    }
  }

  async function handleOpenInPrompt(state: { values: GeneratorValues; prompt: string; negativePrompt: string | null }) {
    if (!user || !generator || !version) return;
    setIsOpeningPrompt(true);
    setActionError(null);
    try {
      const run = await recordGeneratorRun(generator.id, version.id, user.id, state.values, state.prompt, state.negativePrompt);
      router.push(`/create?generatorRun=${run.id}`);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kayıt oluşturulamadı, lütfen tekrar dene.");
      setIsOpeningPrompt(false);
    }
  }

  const canOpenInPrompt = generator.allowPromptEditing || generator.allowSavingGeneratedPrompts;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-4 py-6 sm:px-6">
      <div className="overflow-hidden rounded-lg border border-border bg-surface">
        {generator.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a real, potentially locally-produced data URL cover (see generator-details-form.tsx), same reasoning as that file's own cover preview
          <img src={generator.coverUrl} alt="" className="h-40 w-full object-cover sm:h-56" />
        ) : (
          <div className="flex h-24 w-full items-center justify-center bg-accent-surface text-primary sm:h-28">
            <Blocks size={32} />
          </div>
        )}

        <div className="space-y-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="accent">
              <Blocks size={11} className="mr-1" /> Generator
            </Badge>
            <Badge>{GENERATOR_CATEGORY_TOPIC_LABELS[generator.category]}</Badge>
            {generator.subcategory && <Badge variant="outline">{generator.subcategory}</Badge>}
            {generator.status === "draft" && <Badge variant="danger">Taslak</Badge>}
            {generator.visibility === "unlisted" && generator.status === "published" && <Badge variant="outline">Yalnızca bağlantıyla</Badge>}
            {generator.origin.type === "remix" && (
              <Badge variant="outline">
                <GitBranch size={11} className="mr-1" /> Remix
              </Badge>
            )}
          </div>

          <h1 className="text-xl font-semibold text-text sm:text-2xl">{generator.title}</h1>
          <p className="text-sm text-text-muted">{generator.description}</p>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link href={profileHref(generator.creator)} className="flex items-center gap-2">
              <Avatar src={generator.creator.avatarUrl} alt={generator.creator.displayName} size={32} />
              <span className="text-sm font-medium text-text">{generator.creator.displayName}</span>
            </Link>
            <p className="text-xs text-text-muted">{formatRelativeTime(generator.createdAt)}</p>
          </div>

          {generator.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {generator.tags.map((tag) => (
                <Badge key={tag.slug} variant="outline">
                  {tag.label}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-md bg-accent-surface/50 px-3 py-2 text-sm text-text-muted">
            <span>{formatCount(generator.useCount)} kullanım</span>
            <span>{formatCount(generator.saveCount)} kaydetme</span>
            <span>{formatCount(generator.remixCount)} remix</span>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
            {isOwner ? (
              <>
                <Link href={`/generators/create?edit=${generator.id}`} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium text-text hover:bg-accent-surface">
                  <Pencil size={14} /> Düzenle
                </Link>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={isDeleting}
                  className={cn(
                    "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-medium",
                    deleteConfirm ? "border-red-500 bg-red-500/10 text-red-600" : "border-border text-text-muted hover:bg-accent-surface hover:text-red-600",
                  )}
                >
                  <Trash2 size={14} /> {deleteConfirm ? "Emin misin? Tekrar tıkla" : "Sil"}
                </button>
              </>
            ) : (
              <>
                {generator.allowRemix && user && (
                  <Button type="button" variant="outline" size="sm" onClick={handleRemix} disabled={isRemixing}>
                    <GitBranch size={14} /> {isRemixing ? "Remix oluşturuluyor…" : "Remixle"}
                  </Button>
                )}
                {saveState.canSave && (
                  <Button type="button" variant={saveState.isSaved ? "secondary" : "outline"} size="sm" onClick={saveState.toggle} disabled={saveState.isToggling}>
                    <Bookmark size={14} fill={saveState.isSaved ? "currentColor" : "none"} /> {saveState.isSaved ? "Kaydedildi" : "Kaydet"}
                  </Button>
                )}
              </>
            )}
          </div>
          {actionError && <p className="text-sm text-red-500">{actionError}</p>}
          {!user && (
            <p className="text-xs text-text-muted">
              Remixlemek, kaydetmek ya da bir prompt oluşturmak için{" "}
              <Link href="/login" className="font-medium text-primary hover:underline">
                giriş yap
              </Link>
              .
            </p>
          )}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-surface p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold text-text">Generatoru Kullan</h2>
        <GeneratorPlayground
          schema={version.schema}
          enableNegativePrompt={generator.enableNegativePrompt}
          renderActions={
            canOpenInPrompt
              ? (state) =>
                  user ? (
                    <Button type="button" onClick={() => handleOpenInPrompt(state)} disabled={isOpeningPrompt || !state.prompt.trim()}>
                      {isOpeningPrompt ? "Açılıyor…" : "Prompt Olarak Aç"}
                    </Button>
                  ) : (
                    <p className="text-xs text-text-muted">
                      Bu çıktıyı gerçek bir prompt olarak açmak için{" "}
                      <Link href="/login" className="font-medium text-primary hover:underline">
                        giriş yap
                      </Link>
                      .
                    </p>
                  )
              : undefined
          }
        />
      </div>
    </div>
  );
}
