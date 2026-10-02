"use client";

/**
 * Temporary, dev-only comparison harness for "gönderi kartında birden fazla
 * görsel olursa ne yapılabilir" (CLAUDE.md, in progress) — same idea as
 * `/dev/share-modal-test` (Bölüm 9.52) / `/dev/generator-visual-options-test`
 * (Bölüm 9.53): renders the real, unmodified `PostHeader`/`ContentCard`/
 * `PromptPreviewBox`/`ContentTags`/`PromptCardFooter` around each of the
 * four real candidate output-figure components from
 * `multi-image-output-options.tsx`, side by side, against a realistic
 * 5-image fixture (deterministic offline `placeholderArt`, no network) — so
 * the options can be compared visually (screenshot) before picking one, not
 * just described in prose. Not linked from anywhere in the real app; safe
 * to delete once a choice is made.
 */
import { ContentCard, ContentCardBody, ContentCardTitle } from "@/features/content/content-card";
import { ContentTypeLabel } from "@/features/content/content-type-label";
import { ContentTags } from "@/features/content/content-tags";
import { PostHeader } from "@/features/prompts/post-header";
import { PromptPreviewBox } from "@/features/prompts/prompt-preview-box";
import { PromptCardFooter } from "@/features/prompts/prompt-card-footer";
import { CONTENT_TYPE_META } from "@/features/prompts/content-type-meta";
import {
  OutputBadgeOnly,
  OutputCollageGrid,
  OutputDotIndicator,
  OutputThumbnailStrip,
} from "@/features/prompts/multi-image-output-options";
import { placeholderArt } from "@/lib/placeholder-image";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { Prompt, PromptMedia, UserProfile } from "@/types";

const AUTHOR: UserProfile = {
  id: "5eed0000-0000-4000-8000-000000000001",
  username: "ayse",
  displayName: "Ayşe Yılmaz",
  avatarUrl: null,
  coverUrl: null,
  bio: null,
  website: null,
  followerCount: 12,
  followingCount: 4,
  createdAt: "2026-01-01T00:00:00Z",
};

function media(count: number): PromptMedia[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `m${i + 1}`,
    url: placeholderArt(`ejder-${i}`, 900, 1125),
    width: 900,
    height: 1125,
    alt: `Ejder prompt görseli ${i + 1}`,
  }));
}

function promptWithMedia(count: number): Prompt {
  return {
    id: `5eed0000-0000-4000-8000-00000000c${count}`,
    author: AUTHOR,
    title: "Bulutların üstünde ejder",
    description: "Gün batımında bulutların üstünde süzülen, pulları ışık saçan bir ejder.",
    promptText: "majestic dragon soaring above the clouds at sunset, iridescent scales, cinematic lighting, 8k",
    tool: "Midjourney",
    tools: ["midjourney:v7"],
    contentType: "image",
    category: "fantasy",
    subcategory: null,
    media: media(count),
    tags: [
      { slug: "fantastik", label: "Fantastik" },
      { slug: "ejder", label: "Ejder" },
    ],
    origin: { type: "original" },
    likeCount: 48,
    saveCount: 11,
    commentCount: 6,
    isLiked: false,
    isSaved: false,
    status: "published",
    showOnProfile: true,
    createdAt: "2026-02-10T12:00:00Z",
    deletedAt: null,
    generatedFrom: null,
  };
}

const PROMPT_5 = promptWithMedia(5);
const PROMPT_1 = promptWithMedia(1);
const PROMPT_2 = promptWithMedia(2);
const PROMPT_3 = promptWithMedia(3);
const PROMPT_4 = promptWithMedia(4);

function OptionCard({
  label,
  tradeoffs,
  prompt,
  Output,
}: {
  label: string;
  tradeoffs: string;
  prompt: Prompt;
  Output: (props: { media: PromptMedia[] }) => React.ReactElement | null;
}) {
  const { t } = useTranslation();
  const meta = CONTENT_TYPE_META[prompt.contentType];
  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-label font-semibold text-text">{label}</h2>
        <p className="text-caption text-text-muted">{tradeoffs}</p>
      </div>
      <ContentCard href="#">
        <ContentCardBody>
          <PostHeader prompt={prompt} />
          <div className="space-y-2">
            <ContentTypeLabel icon={meta.icon} label={`${t(meta.labelKey)} Prompt`} detail={prompt.tool} />
            <ContentCardTitle href="#" title={prompt.title} description={prompt.description} />
          </div>
          <PromptPreviewBox prompt={prompt} lines={3} />
          <Output media={prompt.media} />
          <ContentTags tags={prompt.tags} />
        </ContentCardBody>
        <PromptCardFooter prompt={prompt} />
      </ContentCard>
    </div>
  );
}

export default function MultiImageCardOptionsPage() {
  return (
    <main className="mx-auto max-w-6xl space-y-10 bg-background p-6">
      <header className="space-y-1">
        <h1 className="text-h1 font-semibold text-text">
          Gönderi kartında birden fazla görsel — 4 seçenek
        </h1>
        <p className="max-w-3xl text-body text-text-secondary">
          Aynı 5 görselli prompt, PromptCard&apos;ın gerçek, değiştirilmemiş kabuğu
          (başlık, prompt bloğu, etiketler, aksiyon satırı) içinde — yalnızca
          &quot;Çıktı&quot; önizleme figürü dört farklı şekilde render ediliyor.
        </p>
      </header>

      <section>
        <h2 className="mb-4 text-h2 font-semibold text-text">Dört seçenek, yan yana (5 görsel)</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <OptionCard
            label="1 — Rozet (Badge only)"
            tradeoffs="Ekstra yükseklik yok, yeni etkileşim yok. En güvenli/sade seçenek ama diğer görsellerden hiçbir ipucu vermiyor."
            prompt={PROMPT_5}
            Output={OutputBadgeOnly}
          />
          <OptionCard
            label="2 — Önizleme şeridi"
            tradeoffs="Kartın altına küçük bir önizleme satırı ekliyor (biraz ekstra yükseklik). Detay sayfasındaki şeritle aynı dil, varyete gerçekten görülüyor."
            prompt={PROMPT_5}
            Output={OutputThumbnailStrip}
          />
          <OptionCard
            label="3 — Kolaj / mozaik"
            tradeoffs="Aynı tek-görsel alanını kolaja bölüyor (ekstra yükseklik yok). En zengin önizleme ama her görsel daha küçük kırpılıyor, düzen sayıya göre değişiyor."
            prompt={PROMPT_5}
            Output={OutputCollageGrid}
          />
          <OptionCard
            label="4 — Nokta göstergesi"
            tradeoffs="Bugünkü görünüm aynen kalıyor, yalnızca altta küçük, tıklanamaz noktalar ekleniyor (Instagram karusel ipucu). Ekstra yükseklik yok."
            prompt={PROMPT_5}
            Output={OutputDotIndicator}
          />
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-h2 font-semibold text-text">
          Kolaj seçeneğinin sayıya göre değişen düzeni (1 / 2 / 3 / 4 görsel)
        </h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4">
          <OptionCard label="1 görsel" tradeoffs="Tek görselde hiçbir fark yok — bugünküyle birebir aynı." prompt={PROMPT_1} Output={OutputCollageGrid} />
          <OptionCard label="2 görsel" tradeoffs="Yan yana iki yarım." prompt={PROMPT_2} Output={OutputCollageGrid} />
          <OptionCard label="3 görsel" tradeoffs="Solda büyük bir, sağda üst üste iki." prompt={PROMPT_3} Output={OutputCollageGrid} />
          <OptionCard label="4 görsel" tradeoffs="2×2 ızgara." prompt={PROMPT_4} Output={OutputCollageGrid} />
        </div>
      </section>
    </main>
  );
}
