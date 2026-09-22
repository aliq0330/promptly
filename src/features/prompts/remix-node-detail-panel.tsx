"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  GitCompare,
  GitMerge,
  History,
  Loader2,
  RotateCcw,
  XCircle,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import {
  acceptMergeRequest,
  fetchMergeRequestsForPrompt,
  rejectMergeRequest,
  withdrawMergeRequest,
} from "@/lib/supabase/merge-requests";
import { fetchVersionsForPrompt } from "@/lib/supabase/prompt-versions";
import { cn, formatRelativeTime, profileHref, promptHref } from "@/lib/utils";
import { MergeRequestModal } from "./merge-request-modal";
import { PromptDiffModal } from "./prompt-diff-modal";
import { VersionDiffModal } from "./version-diff-modal";
import type { MergeRequest, MergeRequestStatus, Prompt, PromptVersion, RemixGraphNode } from "@/types";

const STATUS_LABELS: Record<MergeRequestStatus, string> = {
  pending: "Bekliyor",
  accepted: "Kabul edildi",
  rejected: "Reddedildi",
  withdrawn: "Geri çekildi",
  cancelled: "İptal edildi (kaynak silindi)",
};

// Bu projenin `dark:` varyantının hiç uygulanmadığı kuralı (bkz. badge.tsx)
// burada da geçerli — tek tonlu sınıflar, `dark:` yok.
const STATUS_BADGE_CLASS: Record<MergeRequestStatus, string> = {
  pending: "bg-amber-500/15 text-amber-600",
  accepted: "bg-green-500/15 text-green-600",
  rejected: "bg-red-500/15 text-red-600",
  withdrawn: "bg-accent-surface text-text-muted",
  cancelled: "bg-accent-surface text-text-muted",
};

type DiffTarget = { compareId: string; compareLabel: "Doğrudan kaynak" | "Kök orijinal" } | null;

function upsertMergeRequests(existing: MergeRequest[], updates: MergeRequest[]): MergeRequest[] {
  const map = new Map(existing.map((mr) => [mr.id, mr] as const));
  for (const updated of updates) map.set(updated.id, updated);
  return Array.from(map.values());
}

/**
 * The map's detail panel for whichever node is currently selected (Aşama 4).
 * Everything here reads from data the map already fetched (`allNodes`,
 * `mergeRequests`) — no second graph query — except merge-request actions,
 * which re-fetch just this node's real requests afterward (via the same
 * `fetchMergeRequestsForPrompt` every other surface uses) rather than
 * hand-building an optimistic row: a merge request has too many
 * relationships (requester/target-owner profiles, resulting version) to
 * fake correctly, and the real row is one cheap query away.
 */
export function RemixNodeDetailPanel({
  node,
  currentPrompt,
  allNodes,
  mergeRequests,
  onMergeRequestsChanged,
  onSelectNode,
}: {
  node: RemixGraphNode;
  currentPrompt: Prompt;
  allNodes: RemixGraphNode[];
  mergeRequests: MergeRequest[];
  onMergeRequestsChanged: (next: MergeRequest[]) => void;
  onSelectNode: (id: string) => void;
}) {
  const { user } = useAuth();
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [diffTarget, setDiffTarget] = useState<DiffTarget>(null);
  const [pendingActionId, setPendingActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [versionDiffPair, setVersionDiffPair] = useState<{ from: PromptVersion; to: PromptVersion } | null>(null);

  // Sürüm geçmişi (Aşama 9/30) — yalnızca gerçekten bir merge kabul
  // edilmişse dolu döner (bu uygulamada düz bir "düzenle" hiç yok); boşsa
  // hiçbir şey render edilmiyor, sahte bir "henüz sürüm yok" mesajı da
  // eklenmedi (spec'in kendi kuralı: olmayan veriyi göstermeye çalışma).
  useEffect(() => {
    let cancelled = false;
    if (node.isDeleted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- a deleted node's content is never fetched, so its version list is always empty
      setVersions([]);
      return;
    }
    fetchVersionsForPrompt(node.id).then((result) => {
      if (!cancelled) setVersions(result);
    });
    return () => {
      cancelled = true;
    };
  }, [node.id, node.isDeleted]);

  const directSource = node.sourcePromptId ? allNodes.find((n) => n.id === node.sourcePromptId) ?? null : null;
  const rootOriginal = node.rootPromptId ? allNodes.find((n) => n.id === node.rootPromptId) ?? null : null;
  const children = useMemo(() => allNodes.filter((n) => n.sourcePromptId === node.id), [allNodes, node.id]);
  // Bir ilk-nesil remixte doğrudan kaynak = kök orijinal (ikisi de aynı
  // ata) — Aşama 24/33'ün "asla mükerrer seçenek gösterme" kuralı.
  const isFirstGeneration = node.originType === "remix" && node.sourcePromptId === node.rootPromptId;

  const relatedRequests = useMemo(
    () =>
      mergeRequests
        .filter((mr) => mr.sourcePromptId === node.id || mr.targetPromptId === node.id)
        .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    [mergeRequests, node.id],
  );

  // Merge hedefi olabilecek gerçek atalar — doğrudan kaynaktan köke kadar
  // zincir. Asıl doğrulama (hedefin gerçekten bir ata olduğu, silinmemiş
  // olduğu vb.) zaten `create_merge_request` RPC'sinin içinde; bu yalnızca
  // kullanıcıya anlamlı bir seçenek listesi sunuyor, aynı 20-adım guard'ı
  // (`fetchRemixChain`'le aynı desen) kullanarak.
  const ancestorCandidates = useMemo(() => {
    if (node.originType !== "remix" || node.isDeleted) return [];
    const chain: RemixGraphNode[] = [];
    const seen = new Set<string>();
    let cursorId: string | null = node.sourcePromptId;
    let guard = 0;
    while (cursorId && !seen.has(cursorId) && guard < 20) {
      const ancestor = allNodes.find((n) => n.id === cursorId);
      if (!ancestor) break;
      seen.add(ancestor.id);
      if (!ancestor.isDeleted) chain.push(ancestor);
      cursorId = ancestor.sourcePromptId;
      guard += 1;
    }
    return chain;
  }, [node, allNodes]);

  const isOwnNode = user?.id === node.author.id;
  const canCreateMergeRequest = isOwnNode && node.originType === "remix" && !node.isDeleted && ancestorCandidates.length > 0;

  async function refreshRelatedRequests() {
    const updated = await fetchMergeRequestsForPrompt(node.id);
    onMergeRequestsChanged(upsertMergeRequests(mergeRequests, updated));
  }

  async function handleAccept(requestId: string) {
    setPendingActionId(requestId);
    setActionError(null);
    try {
      await acceptMergeRequest(requestId);
      await refreshRelatedRequests();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Kabul edilemedi, lütfen tekrar dene.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleReject(requestId: string) {
    setPendingActionId(requestId);
    setActionError(null);
    try {
      await rejectMergeRequest(requestId);
      await refreshRelatedRequests();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Reddedilemedi, lütfen tekrar dene.");
    } finally {
      setPendingActionId(null);
    }
  }

  async function handleWithdraw(requestId: string) {
    setPendingActionId(requestId);
    setActionError(null);
    try {
      await withdrawMergeRequest(requestId);
      await refreshRelatedRequests();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Geri çekilemedi, lütfen tekrar dene.");
    } finally {
      setPendingActionId(null);
    }
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-background/60 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <Badge variant={node.originType === "original" ? "default" : "outline"}>
            {node.originType === "original" ? "Orijinal" : "Remix"}
          </Badge>
          {node.id === currentPrompt.id && <Badge variant="accent">Bu sayfa</Badge>}
        </div>
        <h3 className="mt-1 truncate text-sm font-semibold text-text">{node.isDeleted ? "Silinmiş içerik" : node.title}</h3>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
          <Avatar src={node.author.avatarUrl} alt={node.author.displayName} size={18} />
          <Link href={profileHref(node.author)} className="hover:underline">
            {node.author.displayName}
          </Link>
          <span aria-hidden>·</span>
          <span>{formatRelativeTime(node.createdAt)}</span>
        </div>
      </div>

      {node.isDeleted && (
        <p className="flex items-start gap-1.5 rounded-md bg-accent-surface/60 px-2.5 py-2 text-xs text-text-muted">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          Bu içerik silindi. Kendi remixleri ve içerikleri korunuyor; yalnızca bu içeriğin kendi metni artık görüntülenemiyor.
        </p>
      )}

      <dl className="space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <dt className="text-text-muted">Doğrudan kaynak:</dt>
          <dd className="min-w-0 truncate text-text">
            {!node.sourcePromptId ? (
              "— (orijinal içerik)"
            ) : directSource ? (
              directSource.isDeleted ? (
                <span className="italic text-text-muted">Silinmiş içerik</span>
              ) : (
                <button type="button" onClick={() => onSelectNode(directSource.id)} className="hover:underline">
                  {directSource.title}
                </button>
              )
            ) : (
              <span className="italic text-text-muted">Kaynağa erişilemiyor</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-text-muted">Kök orijinal:</dt>
          <dd className="min-w-0 truncate text-text">
            {!node.rootPromptId ? (
              "— (bu, kök içerik)"
            ) : rootOriginal ? (
              rootOriginal.isDeleted ? (
                <span className="italic text-text-muted">Silinmiş içerik</span>
              ) : (
                <button type="button" onClick={() => onSelectNode(rootOriginal.id)} className="hover:underline">
                  {rootOriginal.title}
                </button>
              )
            ) : (
              <span className="italic text-text-muted">Kaynağa erişilemiyor</span>
            )}
          </dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="text-text-muted">Remix sayısı:</dt>
          <dd className="text-text">{children.length}</dd>
        </div>
      </dl>

      {!node.isDeleted && (
        <div className="flex flex-wrap gap-1.5">
          <Link href={promptHref({ id: node.id })}>
            <Button type="button" variant="outline" size="sm">
              <ExternalLink size={13} />
              İçeriği Aç
            </Button>
          </Link>
          <Link href={`/create?remix=${node.id}`}>
            <Button type="button" variant="outline" size="sm">
              <GitBranch size={13} />
              Remixle
            </Button>
          </Link>
          {directSource && !directSource.isDeleted && (
            <Link href={promptHref({ id: directSource.id })}>
              <Button type="button" variant="ghost" size="sm">
                <GitBranch size={13} />
                Kaynağı Aç
              </Button>
            </Link>
          )}
        </div>
      )}

      {!node.isDeleted && node.originType === "remix" && (directSource || rootOriginal) && (
        <div className="space-y-1.5 border-t border-border pt-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Farkları karşılaştır</p>
          <div className="flex flex-wrap gap-1.5">
            {directSource && !directSource.isDeleted && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDiffTarget({ compareId: directSource.id, compareLabel: "Doğrudan kaynak" })}
              >
                <GitCompare size={13} />
                Doğrudan kaynakla karşılaştır
              </Button>
            )}
            {!isFirstGeneration && rootOriginal && !rootOriginal.isDeleted && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setDiffTarget({ compareId: rootOriginal.id, compareLabel: "Kök orijinal" })}
              >
                <GitCompare size={13} />
                Kök orijinalle karşılaştır
              </Button>
            )}
          </div>
        </div>
      )}

      {canCreateMergeRequest && (
        <div className="border-t border-border pt-2.5">
          <Button type="button" variant="primary" size="sm" onClick={() => setShowMergeModal(true)}>
            <GitMerge size={13} />
            Merge talebi oluştur
          </Button>
        </div>
      )}

      {relatedRequests.length > 0 && (
        <div className="space-y-2 border-t border-border pt-2.5">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Merge talepleri ({relatedRequests.length})</p>
          <ul className="space-y-2">
            {relatedRequests.map((mr) => {
              const isTargetOwner = user?.id === mr.targetOwner.id;
              const isRequester = user?.id === mr.requester.id;
              const isBusy = pendingActionId === mr.id;
              return (
                <li key={mr.id} className="rounded-md border border-border bg-surface p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate text-text">
                      {mr.requester.displayName} → {mr.targetOwner.displayName}
                    </span>
                    <span className={cn("shrink-0 rounded-sm px-1.5 py-0.5 font-medium", STATUS_BADGE_CLASS[mr.status])}>
                      {STATUS_LABELS[mr.status]}
                    </span>
                  </div>
                  <p className="mt-1 text-text-muted">{mr.contributionSummary}</p>
                  {mr.status === "rejected" && mr.decisionReason && <p className="mt-1 italic text-text-muted">Neden: {mr.decisionReason}</p>}
                  {mr.status === "pending" && isTargetOwner && (
                    <div className="mt-1.5 flex gap-1.5">
                      <Button type="button" size="sm" variant="primary" disabled={isBusy} onClick={() => handleAccept(mr.id)}>
                        {isBusy ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
                        Kabul et
                      </Button>
                      <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => handleReject(mr.id)}>
                        <XCircle size={12} />
                        Reddet
                      </Button>
                    </div>
                  )}
                  {mr.status === "pending" && isRequester && !isTargetOwner && (
                    <div className="mt-1.5">
                      <Button type="button" size="sm" variant="outline" disabled={isBusy} onClick={() => handleWithdraw(mr.id)}>
                        <RotateCcw size={12} />
                        Geri çek
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
          {actionError && <p className="text-xs text-red-500">{actionError}</p>}
        </div>
      )}

      {versions.length > 0 && (
        <div className="space-y-2 border-t border-border pt-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-muted">
            <History size={12} />
            Sürüm Geçmişi ({versions.length})
          </p>
          <ul className="space-y-2">
            {versions.map((version, index) => {
              const previous = index > 0 ? versions[index - 1] : null;
              return (
                <li key={version.id} className="rounded-md border border-border bg-surface p-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 truncate text-text">
                      {version.createdBy && <Avatar src={version.createdBy.avatarUrl} alt={version.createdBy.displayName} size={16} />}
                      v{version.versionNumber} — {version.createdBy?.displayName ?? "Silinmiş kullanıcı"}
                    </span>
                    <span className="shrink-0 text-text-muted">{formatRelativeTime(version.createdAt)}</span>
                  </div>
                  {version.changeSummary && <p className="mt-1 text-text-muted">{version.changeSummary}</p>}
                  {previous && (
                    <div className="mt-1.5">
                      <Button type="button" size="sm" variant="outline" onClick={() => setVersionDiffPair({ from: previous, to: version })}>
                        <GitCompare size={12} />
                        Önceki sürümle karşılaştır
                      </Button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {showMergeModal && (
        <MergeRequestModal
          source={node}
          candidates={ancestorCandidates}
          onClose={() => setShowMergeModal(false)}
          onCreated={() => {
            refreshRelatedRequests();
          }}
        />
      )}

      {diffTarget && (
        <PromptDiffModal
          subjectId={node.id}
          compareId={diffTarget.compareId}
          compareLabel={diffTarget.compareLabel}
          onClose={() => setDiffTarget(null)}
          onRequestMerge={
            canCreateMergeRequest
              ? () => {
                  setDiffTarget(null);
                  setShowMergeModal(true);
                }
              : undefined
          }
        />
      )}

      {versionDiffPair && (
        <VersionDiffModal from={versionDiffPair.from} to={versionDiffPair.to} onClose={() => setVersionDiffPair(null)} />
      )}
    </div>
  );
}
