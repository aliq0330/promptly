import type { AiKind, AiOutput, AiProvider } from "./types";

/**
 * Results of the Üret page, kept ONLY in this browser (IndexedDB) so a
 * generated image/text survives leaving the page. Nothing is sent anywhere;
 * "Geçmişi temizle" wipes it. Capped so a few large images can't fill the disk.
 */
export interface HistoryEntry {
  id: string;
  createdAt: number;
  provider: AiProvider;
  model: string;
  kind: AiKind;
  /** The final prompt that was sent (preset phrases included). */
  prompt: string;
  presetTitle?: string;
  output: AiOutput;
}

const DB_NAME = "promptly-generate";
const STORE = "results";
export const HISTORY_LIMIT = 30;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("no indexedDB"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return open().then(
    (db) =>
      new Promise<T | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const request = work(tx.objectStore(STORE));
        tx.oncomplete = () => {
          db.close();
          resolve(request ? (request.result as T) : undefined);
        };
        tx.onerror = tx.onabort = () => {
          db.close();
          reject(tx.error);
        };
      }),
  );
}

/** Newest first. Storage errors (private mode, blocked) resolve to an empty list. */
export async function listHistory(): Promise<HistoryEntry[]> {
  try {
    const all = (await run<HistoryEntry[]>("readonly", (store) => store.getAll())) ?? [];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  } catch {
    return [];
  }
}

export async function addHistory(entry: HistoryEntry): Promise<void> {
  try {
    await run("readwrite", (store) => {
      store.put(entry);
    });
    const all = await listHistory();
    for (const old of all.slice(HISTORY_LIMIT)) await deleteHistory(old.id);
  } catch {
    // History is a convenience; a failed write never blocks generating.
  }
}

export async function deleteHistory(id: string): Promise<void> {
  try {
    await run("readwrite", (store) => {
      store.delete(id);
    });
  } catch {
    // ignore
  }
}

export async function clearHistory(): Promise<void> {
  try {
    await run("readwrite", (store) => {
      store.clear();
    });
  } catch {
    // ignore
  }
}
