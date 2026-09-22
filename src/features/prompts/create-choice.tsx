import Link from "next/link";
import { Blocks, Sparkles, Wand2 } from "lucide-react";

/**
 * The picker shown when a user hits a bare "Oluştur" entry point (nav,
 * empty states, etc.) — creation branches into "Prompt oluştur" (existing
 * flow, `/create?mode=prompt`), "Generator oluştur" (Generator Builder
 * module, `/generators/create`) and "İstek oluştur" (`/requests/new`).
 * Deep links that already carry intent (`?remix=`, `?remixResponse=`,
 * `?duplicate=`, `?answerRequest=`, `?edit=`, `?generatorRun=`, or
 * `?mode=`) skip this screen entirely — see create-gate.tsx.
 */
export function CreateChoice() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 lg:px-6">
      <h1 className="mb-1 text-center text-lg font-semibold text-text">Ne oluşturmak istersin?</h1>
      <p className="mb-8 text-center text-sm text-text-muted">
        Hazır bir prompt paylaşabilir, kendi prompt generatorunu oluşturabilir veya topluluktan bir prompt isteyebilirsin.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        <Link
          href="/create?mode=prompt"
          className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-accent-surface/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface text-primary">
            <Wand2 size={20} />
          </span>
          <span className="text-sm font-semibold text-text">Prompt oluştur</span>
          <span className="text-sm text-text-muted">
            Hazır bir prompt paylaş ve toplulukla keşfet.
          </span>
        </Link>

        <Link
          href="/generators/create"
          className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-accent-surface/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface text-primary">
            <Blocks size={20} />
          </span>
          <span className="text-sm font-semibold text-text">Generator oluştur</span>
          <span className="text-sm text-text-muted">Kod yazmadan kendi parametrik prompt generatorunu oluştur.</span>
        </Link>

        <Link
          href="/requests/new"
          className="group flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-5 text-left transition-colors hover:border-primary hover:bg-accent-surface/40"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-surface text-primary">
            <Sparkles size={20} />
          </span>
          <span className="text-sm font-semibold text-text">İstek oluştur</span>
          <span className="text-sm text-text-muted">İhtiyacın olan promptu topluluktan iste.</span>
        </Link>
      </div>
    </div>
  );
}
