import type { IconComponent } from "@/components/icons/icon";
import { cn } from "@/lib/utils";

/**
 * Görünürlük etiketi (docs/history/420-*): Topluluk, Space ve Ekip aynı hapı kullanır (ikon 12 px + `text-caption`, `bg-surface-soft`).
 * Düzeyin adını/ikonunu her alan kendi sözlüğünden verir; görünüm tek yerdedir.
 */
export function VisibilityTag({ icon: Icon, label, className, ...rest }: { icon: IconComponent; label: string; className?: string; [data: `data-${string}`]: string | undefined }) {
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-surface-soft px-2 py-0.5 text-caption font-medium text-text-secondary", className)} {...rest}>
      <Icon size={12} aria-hidden />
      {label}
    </span>
  );
}
