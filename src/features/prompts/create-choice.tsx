import Link from "next/link";
import { ArrowRight, Blocks, Sparkles, SquareTerminal } from "lucide-react";

/**
 * The picker shown when a user hits a bare "Oluştur" entry point (nav,
 * empty states, etc.) — creation branches into "Prompt oluştur" (existing
 * flow, `/create?mode=prompt`), "Generator oluştur" (Generator Builder
 * module, `/generators/create`) and "İstek oluştur" (`/requests/new`).
 * Deep links that already carry intent (`?duplicate=`, `?answerRequest=`,
 * `?edit=`, `?generatorRun=`, or `?mode=`) skip this screen entirely — see
 * create-gate.tsx.
 */
const OPTIONS = [
  {
    href: "/create?mode=prompt",
    icon: SquareTerminal,
    title: "Prompt oluştur",
    body: "Hazır bir promptu paylaş; türünü, aracını ve etiketlerini ekle.",
    hint: "Görsel · Metin · Kod · Video · Müzik",
  },
  {
    href: "/generators/create",
    icon: Blocks,
    title: "Generator oluştur",
    body: "Kod yazmadan parametrik bir prompt oluşturucu kur, toplulukla paylaş.",
    hint: "Alanlar · Seçenekler · JSON çıktı",
  },
  {
    href: "/requests/new",
    icon: Sparkles,
    title: "İstek oluştur",
    body: "İhtiyacın olan promptu tarif et, topluluk yanıtlasın.",
    hint: "Topluluk yanıtları",
  },
] as const;

export function CreateChoice() {
  return (
    <div className="mx-auto w-full max-w-4xl px-3 py-8 sm:px-5 sm:py-12 lg:px-8">
      <div className="mb-8 space-y-2 text-center">
        <p className="text-caption font-semibold uppercase tracking-[0.08em] text-primary">Oluştur</p>
        <h1 className="text-h1 font-semibold text-text">Ne oluşturmak istersin?</h1>
        <p className="mx-auto max-w-lg text-small text-text-muted">
          Hazır bir prompt paylaşabilir, kendi prompt generatorunu oluşturabilir veya topluluktan bir prompt isteyebilirsin.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 sm:gap-4">
        {OPTIONS.map((option) => (
          <Link
            key={option.href}
            href={option.href}
            className="group flex flex-col items-start gap-3 rounded-lg border border-border-soft bg-surface p-5 text-left shadow-card transition-[border-color,box-shadow] duration-200 hover:border-primary/40 hover:shadow-card-hover"
          >
            <span className="flex h-11 w-11 items-center justify-center rounded-md bg-primary-soft text-primary transition-colors duration-200 group-hover:bg-primary group-hover:text-primary-foreground">
              <option.icon size={20} strokeWidth={1.9} />
            </span>
            <span className="flex w-full items-center justify-between gap-2 text-h3 font-semibold text-text">
              {option.title}
              <ArrowRight size={16} className="text-text-muted transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-primary" />
            </span>
            <span className="text-small text-text-muted">{option.body}</span>
            <span className="mt-auto pt-1 text-caption font-medium text-text-secondary">{option.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
