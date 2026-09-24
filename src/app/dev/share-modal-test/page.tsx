"use client";

/**
 * Temporary, dev-only test harness for the Unified Share System (CLAUDE.md
 * Bölüm 9.52) — same idea as `/dev/image-analysis-test` (Bölüm 9.47): the
 * three content types' real production data-fetching (Supabase) can't be
 * exercised live in this sandbox, so this renders the actual, unmodified
 * `ShareTriggerButton`/`ShareModal`/`PostMenu` components against realistic,
 * hand-built fixtures instead — proving the wiring (correct preview, correct
 * `/messages?...` href per content type, correct native-share/clipboard
 * target URL, and that "Mesajla gönder" is genuinely gone from the 3-dot
 * menu) without needing a live backend. Not linked from anywhere in the
 * real app; safe to delete once verified, same as its precedent.
 */
import { PostMenu } from "@/features/prompts/post-menu";
import { ShareTriggerButton } from "@/features/prompts/share-modal";
import { RealGeneratorsProvider } from "@/features/generators/real-generators-provider";
import { MessageBubble, type MessageBubbleActions } from "@/features/messages/message-bubble";
import { composeGeneratorShareBody } from "@/features/messages/generator-share-format";
import type { Generator, Message, Prompt, PromptRequest, UserProfile } from "@/types";

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

export const FIXTURE_PROMPT: Prompt = {
  id: "5eed0000-0000-4000-8000-0000000000a1",
  author: AUTHOR,
  title: "Neon şehir portresi",
  description: "Karanlık bir sokakta neon ışıklarla aydınlanan sinematik bir portre.",
  promptText: "cinematic portrait, neon lights, rain-soaked street, 85mm lens, shallow depth of field",
  tool: "Midjourney",
  contentType: "image",
  media: [
    {
      id: "m1",
      url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      width: 400,
      height: 400,
      alt: "Neon portre",
    },
  ],
  tags: [],
  origin: { type: "original" },
  likeCount: 12,
  commentCount: 3,
  isLiked: false,
  isSaved: false,
  status: "published",
  showOnProfile: true,
  createdAt: "2026-01-01T00:00:00Z",
  deletedAt: null,
  generatedFrom: null,
};

export const FIXTURE_GENERATOR: Generator = {
  id: "5eed0000-0000-4000-8000-0000000000b1",
  creator: AUTHOR,
  title: "Ürün Fotoğrafı Oluşturucu",
  slug: "urun-fotografi-olusturucu",
  description: "Bir ürünün stüdyo çekimi tarzında görselini üretmek için yapılandırılmış alanlar.",
  coverUrl: null,
  category: "image",
  subcategory: "Ürün Fotoğrafçılığı",
  tags: [],
  visibility: "public",
  status: "published",
  allowPromptEditing: true,
  allowSavingGeneratedPrompts: true,
  enableNegativePrompt: false,
  currentVersionId: "v1",
  useCount: 41,
  saveCount: 6,
  likeCount: 9,
  commentCount: 1,
  isSaved: false,
  createdAt: "2026-01-02T00:00:00Z",
  updatedAt: "2026-01-02T00:00:00Z",
};

export const FIXTURE_REQUEST: PromptRequest = {
  id: "5eed0000-0000-4000-8000-0000000000c1",
  author: AUTHOR,
  title: "Retro bilim kurgu poster tarzı bir prompt arıyorum",
  description: "80'lerin bilim kurgu film afişlerine benzeyen, canlı renkli bir kompozisyon istiyorum.",
  creativeDirection: "Synthwave renk paleti, büyük tipografi alanı bırakılmış olsun.",
  preferredTool: "Midjourney",
  contentType: "image",
  tags: [],
  status: "open",
  responseCount: 2,
  createdAt: "2026-01-03T00:00:00Z",
  deletedAt: null,
};

const NOOP_MESSAGE_ACTIONS: MessageBubbleActions = {
  onStartReply: () => {},
  onStartEdit: () => {},
  onCancelEdit: () => {},
  onSubmitEdit: () => {},
  editDraft: "",
  onEditDraftChange: () => {},
  isSavingEdit: false,
  editError: null,
  onRequestDelete: () => {},
  onCancelDeleteConfirm: () => {},
  deleteConfirm: null,
  isDeletingId: null,
};

// Built through the REAL `composeGeneratorShareBody` (the exact function
// `local-conversation-view.tsx` calls at send time) so this fixture proves
// the actual compose→parse round trip, not a hand-typed guess at the format.
export const FIXTURE_GENERATOR_SHARE_MESSAGE: Message = {
  id: "5eed0000-0000-4000-8000-0000000000d1",
  conversationId: "5eed0000-0000-4000-8000-0000000000e1",
  senderId: AUTHOR.id,
  body: composeGeneratorShareBody("Bak bunu dene", FIXTURE_GENERATOR.title, FIXTURE_GENERATOR.slug),
  sharedPromptId: null,
  sharedRequestId: null,
  replyToMessageId: null,
  editedAt: null,
  deletedAt: null,
  createdAt: "2026-01-04T00:00:00Z",
};

export default function ShareModalTestPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-10 p-6">
      <h1 className="text-xl font-semibold text-text">Share Modal — test harness</h1>

      <section className="space-y-2 rounded-lg border border-border p-4" data-testid="prompt-section">
        <h2 className="text-sm font-semibold text-text">Prompt</h2>
        <div className="flex items-center gap-3">
          <PostMenu promptId={FIXTURE_PROMPT.id} authorId={AUTHOR.id} />
          <ShareTriggerButton target={{ contentType: "prompt", prompt: FIXTURE_PROMPT }} label="Paylaş" />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4" data-testid="generator-section">
        <h2 className="text-sm font-semibold text-text">Generator</h2>
        <div className="flex items-center gap-3">
          <PostMenu generatorId={FIXTURE_GENERATOR.id} generatorSlug={FIXTURE_GENERATOR.slug} authorId={AUTHOR.id} />
          <ShareTriggerButton target={{ contentType: "generator", generator: FIXTURE_GENERATOR }} label="Paylaş" />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4" data-testid="request-section">
        <h2 className="text-sm font-semibold text-text">Prompt İsteği</h2>
        <div className="flex items-center gap-3">
          <ShareTriggerButton target={{ contentType: "request", request: FIXTURE_REQUEST }} label="Paylaş" />
        </div>
      </section>

      <section className="space-y-2 rounded-lg border border-border p-4" data-testid="generator-message-bubble-section">
        <h2 className="text-sm font-semibold text-text">Mesaj balonu — paylaşılan generator</h2>
        <RealGeneratorsProvider>
          <MessageBubble
            message={FIXTURE_GENERATOR_SHARE_MESSAGE}
            isMe={false}
            replyPreview={null}
            isEditingHere={false}
            isActive={false}
            onActivate={() => {}}
            reactions={[]}
            currentUserId={null}
            onReact={() => {}}
            actions={NOOP_MESSAGE_ACTIONS}
          />
        </RealGeneratorsProvider>
      </section>
    </main>
  );
}
