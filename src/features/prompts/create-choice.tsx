"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ChevronRight, CircleFadingPlus, Megaphone, SlidersHorizontal, Sparkles, SquareTerminal, Workflow, type LucideIcon } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { useAuth } from "@/features/auth/auth-provider";
import { useAuthPrompt } from "@/features/auth/auth-prompt-provider";
import { SpacesIcon } from "@/features/spaces/space-visuals";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { TranslationKey } from "@/lib/i18n/translations";
import { cn } from "@/lib/utils";
import { ShareExistingModal } from "./share-existing-modal";

type MenuOption = { key: string; href: string; icon: LucideIcon; titleKey: TranslationKey; hintKey?: TranslationKey };

/** Büyük satırlar: en sık oluşturulanlar. */
const ROWS: MenuOption[] = [
  { key: "prompt", href: "/create?mode=prompt", icon: SquareTerminal, titleKey: "createMenu.prompt", hintKey: "create.promptHint" },
  { key: "request", href: "/requests/new", icon: Sparkles, titleKey: "createMenu.request", hintKey: "createMenu.requestHint" },
  // Hikâye (docs/history/198-*): 24 saatlik paylaşım; topluluk bağlamı kendi hedef kitlesi olarak taşınır.
  { key: "story", href: "/stories/create", icon: CircleFadingPlus, titleKey: "create.storyTitle", hintKey: "createMenu.storyHint" },
];

/** Küçük karolar: kurulumlu türler. Space (docs/history/215-*) Spaces sayfasında oluşturma penceresiyle açılır. */
const TILES: MenuOption[] = [
  { key: "workflow", href: "/workflows/create", icon: Workflow, titleKey: "createMenu.workflow" },
  { key: "preset", href: "/presets/create", icon: SlidersHorizontal, titleKey: "createMenu.preset" },
  { key: "space", href: "/spaces?new=1", icon: SpacesIcon, titleKey: "createMenu.space" },
];

/** A weekly theme's `?tag=` is carried into whichever type is picked (each form attaches it, see `usePrefillTag`). */
function withParam(href: string, name: string, value: string | null): string {
  if (!value) return href;
  return `${href}${href.includes("?") ? "&" : "?"}${name}=${encodeURIComponent(value)}`;
}

/**
 * Oluştur menüsünün içeriği (docs/history/216-*): Prompt / İstek / Hikâye büyük satır, Workflow / Hazır ayar / Space küçük karo, en altta
 * "Var olan içeriği paylaş". Alt menünün "+"sı ve kenar çubuğunun "Oluştur"u bunu alttan açılan pencerede (`CreateMenuSheet`), doğrudan
 * `/create` adresi sayfa olarak (`CreateChoice`) gösterir — tek liste. `tag`/`community` seçilen türe taşınır (Space hariç).
 */
export function CreateMenuList({ tag = null, community = null, onPick }: { tag?: string | null; community?: string | null; onPick?: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { requireAuth } = useAuthPrompt();
  const [shareExisting, setShareExisting] = useState(false);
  const hrefOf = (option: MenuOption) => (option.key === "space" ? option.href : withParam(withParam(option.href, "tag", tag), "community", community));

  return (
    <div data-create-menu="">
      <ul className="divide-y divide-border-soft">
        {ROWS.map((option) => (
          <li key={option.key}>
            <Link href={hrefOf(option)} onClick={onPick} data-create-option={option.key} className="group flex min-h-16 items-center gap-3 px-1 py-3 transition-colors">
              <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl transition-colors", option.key === "prompt" ? "bg-primary-soft text-primary" : "bg-surface-soft text-text-secondary group-hover:text-primary")}>
                <option.icon size={20} strokeWidth={1.9} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body font-semibold text-text">{t(option.titleKey)}</span>
                {option.hintKey && <span className="block truncate text-caption text-text-muted">{t(option.hintKey)}</span>}
              </span>
              <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-3 gap-2 pt-3">
        {TILES.map((option) => (
          <Link
            key={option.key}
            href={hrefOf(option)}
            onClick={onPick}
            data-create-option={option.key}
            className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl bg-surface-soft px-2 py-3 text-center text-small font-semibold text-text transition-colors hover:bg-primary-soft hover:text-primary"
          >
            <option.icon size={20} strokeWidth={1.9} className="text-text-secondary" />
            {t(option.titleKey)}
          </Link>
        ))}
      </div>
      {/* Yeni içerik değil: var olan bir içeriği topluluklarda duyur (aynı Paylaş satırı). */}
      <button
        type="button"
        onClick={() => requireAuth("create") && setShareExisting(true)}
        data-create-share-existing=""
        className="group mt-2 flex min-h-16 w-full items-center gap-3 px-1 py-3 text-left"
      >
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-surface-soft text-text-secondary group-hover:text-primary">
          <Megaphone size={19} strokeWidth={1.9} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-body font-semibold text-text">{t("create.shareExistingTitle")}</span>
          <span className="block text-caption text-text-muted">{t("create.shareExistingBody")}</span>
        </span>
        <ChevronRight size={18} aria-hidden className="shrink-0 text-text-muted transition-transform group-hover:translate-x-0.5" />
      </button>
      {shareExisting && user && <ShareExistingModal userId={user.id} onClose={() => setShareExisting(false)} />}
    </div>
  );
}

/** "+" / "Oluştur": menü alttan açılır (masaüstünde ortada pencere); seçim yapılınca kapanır. */
export function CreateMenuSheet({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <Modal onClose={onClose} labelledBy="create-menu-title">
      <div className="w-full max-w-md rounded-t-2xl border border-border bg-surface px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-pop sm:rounded-2xl sm:pb-4" onClick={(event) => event.stopPropagation()}>
        <h2 id="create-menu-title" className="px-1 pb-1 text-h3 font-bold text-text">
          {t("create.eyebrow")}
        </h2>
        <CreateMenuList onPick={onClose} />
      </div>
    </Modal>
  );
}

/**
 * Doğrudan `/create` ziyareti (yer imi, eski bağlantılar): aynı menü sayfa olarak. Niyet taşıyan bağlantılar (`?duplicate=`, `?edit=`,
 * `?mode=prompt`…) bu ekranı atlar — `create-gate.tsx`.
 */
export function CreateChoice() {
  const { t } = useTranslation();
  const params = useSearchParams();
  return (
    <div className="mx-auto w-full max-w-md px-3 py-6 sm:px-5 sm:py-10">
      <h1 className="px-1 pb-2 text-h2 font-bold text-text">{t("create.title")}</h1>
      <CreateMenuList tag={params.get("tag")} community={params.get("community")} />
    </div>
  );
}
