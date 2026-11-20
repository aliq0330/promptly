"use client";

import { useEffect, useSyncExternalStore } from "react";
import { fetchCallHistory } from "@/lib/supabase/calls";
import { lastCallByConversation, missedCount, upsertCall } from "@/lib/webrtc/call-history";
import type { CallRow } from "@/lib/webrtc/types";
import { subscribeCallRows } from "./call-events";

/**
 * Son çağrılar (docs/history/450-*): mesaj listesi satırlarında "son mesaj yerine son arama" önizlemesi için, kullanıcı başına bir kez
 * yüklenen en yeni 60 bitmiş çağrı. Modül düzeyindeki depo (satır başına istek YOK); `call-events` ile canlı güncellenir.
 */
let rows: CallRow[] = [];
let loadedFor: string | null = null;
let loading = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

async function ensureLoaded(userId: string): Promise<void> {
  if (loadedFor === userId || loading) return;
  loading = true;
  try {
    const page = await fetchCallHistory(userId, null, 60);
    let next: CallRow[] = [];
    for (const row of page) next = upsertCall(next, row, userId);
    rows = next;
    loadedFor = userId;
    emit();
  } catch (error) {
    // Önizleme bir süstür: yüklenemezse liste son mesajı göstermeye devam eder.
    console.error("call log store", error);
  } finally {
    loading = false;
  }
}

let wired = false;
function wire(userId: string) {
  if (wired) return;
  wired = true;
  subscribeCallRows((row) => {
    if (!loadedFor) return;
    rows = upsertCall(rows, row, loadedFor);
    emit();
  });
  void userId;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Konuşma kimliği → son bitmiş çağrı (yüklenene dek boş). */
export function useLastCalls(userId: string | null): Map<string, CallRow> {
  useEffect(() => {
    if (!userId) return;
    wire(userId);
    void ensureLoaded(userId);
  }, [userId]);
  const snapshot = useSyncExternalStore(subscribe, () => rows, () => rows);
  return userId && loadedFor === userId ? lastCallByConversation(snapshot, userId) : EMPTY;
}
const EMPTY = new Map<string, CallRow>();

/** Cevapsız (gelen) arama sayısı: Mesajlar menüsündeki "Aramalar" rozeti. Yüklenene dek 0. */
export function useMissedCallCount(userId: string | null): number {
  useLastCalls(userId);
  const snapshot = useSyncExternalStore(subscribe, () => rows, () => rows);
  return userId && loadedFor === userId ? missedCount(snapshot, userId) : 0;
}
