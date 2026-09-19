"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import {
  createRealRequest,
  deleteRealRequest,
  fetchRecentRequests,
  fetchRequestById,
  selectRealRequestResponse,
  updateRealRequestStatus,
  type CreateRealRequestInput,
} from "@/lib/supabase/requests";
import type { PromptRequest, PromptRequestStatus, UserProfile } from "@/types";

interface RealRequestsContextValue {
  realRequests: PromptRequest[];
  getCached: (id: string) => PromptRequest | undefined;
  fetchById: (id: string) => Promise<PromptRequest | null>;
  addRequest: (input: CreateRealRequestInput, authorProfile: UserProfile) => Promise<PromptRequest>;
  updateStatus: (id: string, status: PromptRequestStatus) => Promise<void>;
  deleteRequest: (id: string) => Promise<void>;
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
  const { user } = useAuth();
  const [realRequests, setRealRequests] = useState<PromptRequest[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchRecentRequests().then((requests) => {
      if (!cancelled) setRealRequests(requests);
    });
    return () => {
      cancelled = true;
    };
  }, []);

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
      if (!user) throw new Error("Giriş yapmadan istek yayınlanamaz.");
      const request = await createRealRequest(input, user.id, authorProfile);
      setRealRequests((prev) => [request, ...prev]);
      return request;
    },
    [user],
  );

  const updateStatus = useCallback(async (id: string, status: PromptRequestStatus) => {
    await updateRealRequestStatus(id, status);
    setRealRequests((prev) => prev.map((request) => (request.id === id ? { ...request, status } : request)));
  }, []);

  const deleteRequest = useCallback(async (id: string) => {
    await deleteRealRequest(id);
    setRealRequests((prev) => prev.filter((request) => request.id !== id));
  }, []);

  const selectResponse = useCallback(async (id: string, promptId: string | null) => {
    await selectRealRequestResponse(id, promptId);
    setRealRequests((prev) =>
      prev.map((request) =>
        request.id === id
          ? { ...request, selectedResponsePromptId: promptId ?? undefined, status: promptId ? "answered" : "open" }
          : request,
      ),
    );
  }, []);

  const value = useMemo(
    () => ({ realRequests, getCached, fetchById, addRequest, updateStatus, deleteRequest, selectResponse }),
    [realRequests, getCached, fetchById, addRequest, updateStatus, deleteRequest, selectResponse],
  );

  return <RealRequestsContext.Provider value={value}>{children}</RealRequestsContext.Provider>;
}

export function useRealRequests() {
  const ctx = useContext(RealRequestsContext);
  if (!ctx) throw new Error("useRealRequests must be used within a RealRequestsProvider");
  return ctx;
}
