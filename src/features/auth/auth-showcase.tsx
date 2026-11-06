"use client";

import { useEffect, useState } from "react";
import { Coverflow } from "@/components/ui/coverflow";
import { StorageAppearanceImage } from "@/components/ui/storage-media";
import { loadShowcase, SHOWCASE_MIN_ITEMS } from "@/features/feed/showcase-data";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import type { Prompt } from "@/types";

const SAMPLE_LINES = ["cinematic portrait, neon rain, 85mm", "system: you are a senior reviewer…", "lo-fi hip hop, 80 bpm, vinyl crackle"];

/**
 * The side panel of the sign-in / sign-up pages (docs/history/346-*): a slowly turning coverflow of the community's favourite
 * picture prompts, so a visitor sees what they are about to join. It is decoration — a tap only brings a card forward, nothing
 * opens. It only loads on desktop (the panel is hidden below `lg`), and while the pictures are loading or when there are too
 * few of them the panel keeps the three sample prompt lines it always had.
 */
export function AuthShowcase() {
  const { t } = useTranslation();
  const wide = useMediaQuery("(min-width: 1024px)");
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (!wide) return;
    let alive = true;
    loadShowcase()
      .then((items) => {
        if (alive && items.length >= SHOWCASE_MIN_ITEMS) setPrompts(items);
      })
      .catch((err) => console.error("auth showcase", err));
    return () => {
      alive = false;
    };
  }, [wide]);

  if (!prompts) {
    return (
      <div aria-hidden className="space-y-2 pt-2">
        {SAMPLE_LINES.map((line, index) => (
          <div
            key={line}
            className="prompt-text flex max-w-sm items-center gap-2 rounded-lg border border-border-soft bg-surface-soft px-3 py-2 text-text-muted shadow-xs"
            style={{ opacity: 1 - index * 0.25 }}
          >
            <span className="text-primary">›</span>
            {line}
          </div>
        ))}
      </div>
    );
  }

  const current = prompts[active];
  return (
    <div className="-mx-10 pt-2">
      <Coverflow
        items={prompts}
        active={active}
        onActiveChange={setActive}
        itemKey={(prompt) => prompt.id}
        itemLabel={(prompt) => prompt.title}
        label={t("showcase.wallAria")}
        autoplay
        className="h-[19rem]"
        renderCard={(prompt) => {
          const media = prompt.media[0];
          return <StorageAppearanceImage src={media.url} alt="" color={media.color} placeholder={media.placeholder} sizes="20vw" className="object-cover" />;
        }}
      />
      <p className="px-10 pt-2 text-center font-display text-body font-bold text-text" aria-live="polite">
        {current.title}
      </p>
    </div>
  );
}
