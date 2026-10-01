"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createRealRequest,
  deleteRealRequest,
  fetchRecentRequests,
  fetchRequestById,
  selectRealRequestResponse,
  updateRealRequest,
  updateRealRequestStatus,
  type CreateRealRequestInput,
  type UpdateRealRequestInput,
} from "@/lib/supabase/requests";
import type { KeysetCursor } from "@/lib/supabase/pagination";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { PromptRequest, PromptRequestStatus, UserProfile } from "@/types";

const PAGE_SIZE = 24;

interface RealRequestsContextValue {
  realRequests: PromptRequest[];
  hasMore: boolean;
  loadingMore: boolean;
  loadMore: () => Promise<void>;
  getCached: (id: string) => PromptRequest | undefined;
  fetchById: (id: string) => Promise<PromptRequest | null>;
  addRequest: (input: CreateRealRequestInput, authorProfile: UserProfile) => Promise<PromptRequest>;
  updateRequest: (id: string, input: UpdateRealRequestInput) => Promise<PromptRequest>;
  updateStatus: (id: string, status: Extract<PromptRequestStatus, "open" | "closed">) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
  /** Removes a request from the cache without calling the delete API again — for a caller (`PostMenu`'s `onDeleted`) that already did the real, successful delete itself. Mirrors `RealGeneratorsProvider.removeFromCache`. */
  removeFromCache: (id: string) => void;
  selectResponse: (id: string, promptId: string | null) => Promise<void>;
}

const RealRequestsContext = createContext<RealRequestsContextValue | null>(null);

/**
 * Real, cross-user, cross-device prompt requests — the same
 * `RealPromptsProvider` shape, backed by the actual Supabase
 * `prompt_requests` table. RLS (Bölüm 19) already guarantees only a
 * request's own author can call `updateStatus`/`deleteRequest`/
 * `selectResponse` successfully, so no client-side ownership check is
 * needed here.
 */
export function RealRequestsProvider({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [realRequests, setRealRequests] = useState<PromptRequest[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const cursorRef = useRef<KeysetCursor | null>(null);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchRecentRequests(PAGE_SIZE).then((page) => {
      if (cancelled) return;
      setRealRequests(page.items);
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursorRef.current) return;
    setLoadingMore(true);
    try {
      const page = await fetchRecentRequests(PAGE_SIZE, cursorRef.current);
      setRealRequests((prev) => {
        const seen = new Set(prev.map((r) => r.id));
        return [...prev, ...page.items.filter((r) => !seen.has(r.id))];
      });
      cursorRef.current = page.nextCursor;
      setHasMore(page.nextCursor !== null);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore]);

  const getCached = useCallback(
    (id: string) => realRequests.find((request) => request.id === id),
    [realRequests],
  );

  const fetchById = useCallback(
    async (id: string) => {
      const cached = realRequests.find((request) => request.id === id);
      if (cached) return cached;
      return fetchRequestById(id);
    },
    [realRequests],
  );

  const addRequest = useCallback(
    async (input: CreateRealRequestInput, authorProfile: UserProfile) => {
      if (!user) throw new Error(t("request.loginRequiredToPublish"));
      const request = await createRealRequest(input, user.id, authorProfile);
      if (!request.isDraft) setRealRequests((prev) => [request, ...prev]);
      return request;
    },
    [user, t],
  );

  const updateRequest = useCallback(async (id: string, input: UpdateRealRequestInput) => {
    const request = await updateRealRequest(id, input);
    setRealRequests((prev) => {
      if (prev.some((r) => r.id === id)) return prev.map((r) => (r.id === id ? request : r));
      return input.publish ? [request, ...prev] : prev;
    });
    return request;
  }, []);

  const updateStatus = useCallback(async (id: string, status: Extract<PromptRequestStatus, "open" | "closed">) => {
    await updateRealRequestStatus(id, status);
    setRealRequests((prev) => prev.map((request) => (request.id === id ? { ...request, status } : request)));
  }, []);

  const deleteRequest = useCallback(async (id: string) => {
    await deleteRealRequest(id);
    setRealRequests((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const removeFromCache = useCallback((id: string) => {
    setRealRequests((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const selectResponse = useCallback(async (id: string, promptId: string | null) => {
    const result = await selectRealRequestResponse(id, promptId);
    setRealRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? { ...request, selectedResponsePromptId: result.selectedResponsePromptId, status: result.status }
          : request,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({
      realRequests,
      hasMore,
      loadingMore,
      loadMore,
      getCached,
      fetchById,
      addRequest,
      updateRequest,
      updateStatus,
      deleteRequest,
      removeFromCache,
      selectResponse,
    }),
    [
      realRequests,
      hasMore,
      loadingMore,
      loadMore,
      getCached,
      fetchById,
      addRequest,
      updateRequest,
      updateStatus,
      deleteRequest,
      removeFromCache,
      selectResponse,
    ],
  );

  return <RealRequestsContext.Provider value={value}>{children}</RealRequestsContext.Provider>;
}

export function useRealRequests() {
  const ctx = useContext(RealRequestsContext);
  if (!ctx) throw new Error("useRealRequests must be used within a RealRequestsProvider");
  return ctx;
}
