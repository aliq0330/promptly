"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { SkillIssue } from "@/lib/skills/package-validate";
import { saveSkillFile, skillErrorMessage, SkillValidationError, type SkillFile } from "@/lib/supabase/skill-package";
import { issueText } from "./skill-issues";

export interface UploadTask {
  id: string;
  path: string;
  size: number;
  progress: number;
  status: "uploading" | "done" | "error";
  message: string | null;
  issues: SkillIssue[];
}

interface Pending {
  path: string;
  bytes: Uint8Array;
}

/**
 * Dosya yükleme kuyruğu (docs/history/389-*): her dosya ön kontrolden geçer (yol + içerik), ilerleme bildirir, iptal edilebilir ve hata verirse yeniden
 * denenebilir. Skill henüz kaydedilmediyse ilk yüklemede taslağı `ensureDraft` oluşturur. Aynı yoldaki dosya DEĞİŞTİRİLİR (eski nesne silinir).
 * Dosya başına bir görev; görevler ardışık çalışır (Storage'a tek seferde çok bağlantı açılmaz).
 */
export function useSkillUploads({ ensureDraft, files, onSaved }: { ensureDraft: () => Promise<string | null>; files: SkillFile[]; onSaved: (file: SkillFile) => void }) {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<UploadTask[]>([]);
  const filesRef = useRef(files);
  const controllers = useRef(new Map<string, AbortController>());
  const pending = useRef(new Map<string, Pending>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const timers = useRef(new Set<number>());
  const mounted = useRef(true);

  useEffect(() => {
    filesRef.current = files;
  });
  useEffect(() => {
    mounted.current = true;
    const live = timers.current;
    const abort = controllers.current;
    return () => {
      mounted.current = false;
      live.forEach((timer) => window.clearTimeout(timer));
      abort.forEach((controller) => controller.abort());
    };
  }, []);

  const patch = useCallback((id: string, change: Partial<UploadTask>) => {
    if (mounted.current) setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...change } : task)));
  }, []);
  const remove = useCallback((id: string) => {
    pending.current.delete(id);
    controllers.current.delete(id);
    if (mounted.current) setTasks((prev) => prev.filter((task) => task.id !== id));
  }, []);

  const run = useCallback(
    async (id: string, item: Pending) => {
      patch(id, { status: "uploading", progress: 0, message: null, issues: [] });
      const controller = new AbortController();
      controllers.current.set(id, controller);
      try {
        const skillId = await ensureDraft();
        if (!skillId) {
          patch(id, { status: "error", message: t("skill.pkg.needTitleFirst") });
          return;
        }
        const existing = filesRef.current.find((file) => file.path.toLowerCase() === item.path.toLowerCase()) ?? null;
        const saved = await saveSkillFile({ skillId, path: item.path, bytes: item.bytes, existing, onProgress: (fraction) => patch(id, { progress: fraction }), signal: controller.signal });
        onSaved(saved);
        patch(id, { status: "done", progress: 1 });
        pending.current.delete(id);
        const timer = window.setTimeout(() => {
          timers.current.delete(timer);
          remove(id);
        }, 2500);
        timers.current.add(timer);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return remove(id);
        if (error instanceof SkillValidationError) {
          patch(id, { status: "error", message: issueText(error.issues[0], t), issues: error.issues });
        } else {
          patch(id, { status: "error", message: skillErrorMessage(error, "skill.error.files") });
        }
      } finally {
        controllers.current.delete(id);
      }
    },
    [ensureDraft, onSaved, patch, remove, t],
  );

  /** Dosyaları kuyruğa alır; yollar paket içi göreli yollardır (ör. `rules/style.md`). */
  const enqueue = useCallback(
    (items: Pending[]) => {
      const created = items.map((item) => ({ id: crypto.randomUUID(), item }));
      setTasks((prev) => [...prev, ...created.map(({ id, item }) => ({ id, path: item.path, size: item.bytes.length, progress: 0, status: "uploading" as const, message: null, issues: [] }))]);
      for (const { id, item } of created) pending.current.set(id, item);
      queue.current = queue.current.then(async () => {
        for (const { id, item } of created) {
          if (!pending.current.has(id)) continue; // yüklemeden önce iptal edildi
          await run(id, item);
        }
      });
    },
    [run],
  );

  const cancel = useCallback(
    (id: string) => {
      controllers.current.get(id)?.abort();
      remove(id);
    },
    [remove],
  );

  const retry = useCallback(
    (id: string) => {
      const item = pending.current.get(id);
      if (!item) return;
      queue.current = queue.current.then(() => run(id, item));
    },
    [run],
  );

  const busy = tasks.some((task) => task.status === "uploading");
  return { tasks, enqueue, cancel, retry, dismiss: remove, busy };
}

export type SkillUploads = ReturnType<typeof useSkillUploads>;
