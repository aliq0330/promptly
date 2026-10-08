"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  MAX_MESSAGE_IMAGES,
  MessageImageError,
  prepareMessageImage,
  sniffImageMime,
  type PreparedMessageImage,
} from "@/lib/supabase/message-images";
import { translateForRuntime } from "@/lib/i18n/translations";

/** A photo the user has picked but not sent yet. `preparing` while it is validated/shrunk, `ready` once `prepared` is set. */
export interface ComposerImage {
  key: string;
  /** `blob:` URL of the original file — only for the preview strip / optimistic bubble, never uploaded or stored. */
  previewUrl: string;
  status: "preparing" | "ready" | "failed";
  prepared: PreparedMessageImage | null;
  width: number | null;
  height: number | null;
}

/**
 * The composer's pending photo selection: validates real file type (magic
 * bytes, not extension), enforces the per-message limit, shrinks large
 * photos, and keeps `blob:` preview URLs from leaking. Picking never sends
 * anything — the parent hands `images` to its send routine.
 */
export function useComposerImages() {
  const [images, setImages] = useState<ComposerImage[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const imagesRef = useRef<ComposerImage[]>([]);
  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  // Revoke whatever is still held when the composer goes away.
  useEffect(
    () => () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.previewUrl);
    },
    [],
  );

  const addFiles = useCallback(async (files: File[]) => {
    setNotice(null);
    let slots = MAX_MESSAGE_IMAGES - imagesRef.current.length;
    if (files.length > slots) setNotice(translateForRuntime("messages.imageLimit", { count: MAX_MESSAGE_IMAGES }));

    for (const file of files) {
      if (slots <= 0) break;
      // Cheap synchronous gate first so a wrong file never even gets a preview.
      const mime = await sniffImageMime(file);
      if (!mime) {
        setNotice(translateForRuntime("messages.imageTypeNotAllowed"));
        continue;
      }
      slots -= 1;
      const key = crypto.randomUUID();
      const previewUrl = URL.createObjectURL(file);
      setImages((prev) => [...prev, { key, previewUrl, status: "preparing", prepared: null, width: null, height: null }]);
      prepareMessageImage(file)
        .then((prepared) => {
          setImages((prev) =>
            prev.map((image) =>
              image.key === key ? { ...image, status: "ready", prepared, width: prepared.width, height: prepared.height } : image,
            ),
          );
        })
        .catch((err) => {
          setNotice(err instanceof MessageImageError ? err.message : translateForRuntime("image.processFailed"));
          URL.revokeObjectURL(previewUrl);
          setImages((prev) => prev.filter((image) => image.key !== key));
        });
    }
  }, []);

  const remove = useCallback((key: string) => {
    setNotice(null);
    setImages((prev) => {
      const target = prev.find((image) => image.key === key);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((image) => image.key !== key);
    });
  }, []);

  /** Hands the current selection to the caller (who now owns the preview URLs) and empties the composer. */
  const take = useCallback((): ComposerImage[] => {
    const taken = imagesRef.current;
    imagesRef.current = [];
    setImages([]);
    setNotice(null);
    return taken;
  }, []);

  const dismissNotice = useCallback(() => setNotice(null), []);

  const isPreparing = images.some((image) => image.status === "preparing");
  return { images, notice, addFiles, remove, take, isPreparing, dismissNotice };
}
