"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { getUserById } from "@/mocks/users";
import { getRequestById as getMockRequestById, mockRequests } from "@/mocks/requests";
import type { PromptMedia, PromptRequest, PromptRequestStatus, Tag } from "@/types";

const STORAGE_KEY = "promptly-local-requests";

export interface NewRequestInput {
  title: string;
  description: string;
  creativeDirection: string;
  contentType: PromptRequest["contentType"];
  preferredTool: string | null;
  tags: Tag[];
  referenceImage?: PromptMedia;
}

interface RequestsContextValue {
  /** Mock requests + this browser's own locally-created ones, unsorted. */
  allRequests: PromptRequest[];
  getRequestById: (id: string) => PromptRequest | undefined;
  addRequest: (input: NewRequestInput) => PromptRequest;
  deleteRequest: (id: string) => void;
  updateStatus: (id: string, status: PromptRequestStatus) => void;
  /** Pass `null` to clear the selection. Only meaningful on requests "me" owns. */
  selectResponse: (requestId: string, promptId: string | null) => void;
}

const RequestsContext = createContext<RequestsContextValue | null>(null);

/**
 * Real, working request creation/management — same localStorage
 * architecture as follows/likes/saves/comments (CLAUDE.md section 2): this
 * browser only, authored as "me". Status changes and response selection
 * only ever apply to locally-created requests, since "me" never owns any
 * of the seed mock requests (all authored by other mock users) — there is
 * no client-side check standing in for real authorization here, "me" is
 * structurally incapable of touching a request it doesn't own because the
 * mutations below only ever look up ids inside the local array.
 */
export function RequestsProvider({ children }: { children: React.ReactNode }) {
  const [localRequests, setLocalRequests] = useState<PromptRequest[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setLocalRequests(JSON.parse(stored));
      }
    } catch {
      // localStorage unavailable or corrupt — start with none.
    }
  }, []);

  const persist = useCallback((next: PromptRequest[]) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // localStorage unavailable — still works for this session.
    }
  }, []);

  const addRequest = useCallback(
    (input: NewRequestInput): PromptRequest => {
      const request: PromptRequest = {
        id: `local-req-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        author: getUserById("me")!,
        title: input.title.trim(),
        description: input.description.trim(),
        creativeDirection: input.creativeDirection.trim(),
        contentType: input.contentType,
        preferredTool: input.preferredTool,
        referenceImage: input.referenceImage,
        tags: input.tags,
        status: "open",
        responseCount: 0,
        createdAt: new Date().toISOString(),
      };
      setLocalRequests((prev) => {
        const next = [...prev, request];
        persist(next);
        return next;
      });
      return request;
    },
    [persist],
  );

  const deleteRequest = useCallback(
    (id: string) => {
      setLocalRequests((prev) => {
        const next = prev.filter((request) => request.id !== id);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const updateStatus = useCallback(
    (id: string, status: PromptRequestStatus) => {
      setLocalRequests((prev) => {
        const next = prev.map((request) => (request.id === id ? { ...request, status } : request));
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const selectResponse = useCallback(
    (requestId: string, promptId: string | null) => {
      setLocalRequests((prev) => {
        const next = prev.map((request) =>
          request.id === requestId
            ? {
                ...request,
                selectedResponsePromptId: promptId ?? undefined,
                status: promptId ? ("answered" as const) : request.status,
              }
            : request,
        );
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const getRequestById = useCallback(
    (id: string) => localRequests.find((request) => request.id === id) ?? getMockRequestById(id),
    [localRequests],
  );

  const allRequests = useMemo(() => [...mockRequests, ...localRequests], [localRequests]);

  const value = useMemo(
    () => ({ allRequests, getRequestById, addRequest, deleteRequest, updateStatus, selectResponse }),
    [allRequests, getRequestById, addRequest, deleteRequest, updateStatus, selectResponse],
  );

  return <RequestsContext.Provider value={value}>{children}</RequestsContext.Provider>;
}

export function useRequests() {
  const ctx = useContext(RequestsContext);
  if (!ctx) throw new Error("useRequests must be used within a RequestsProvider");
  return ctx;
}
