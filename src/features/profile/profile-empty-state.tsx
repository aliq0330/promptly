import type { IconComponent } from "@/components/icons/icon";
import type { LineArtKind } from "@/components/line-art/kinds";
import { EmptyState } from "@/components/ui/empty-state";

/** Profile tab/filter empty state — delegates to the design system's shared EmptyState. */
export function ProfileEmptyState({
  icon,
  title,
  description,
  action,
  scene,
}: {
  icon: IconComponent;
  title: string;
  description: string;
  action?: { label: string; href: string };
  scene?: LineArtKind;
}) {
  return <EmptyState icon={icon} scene={scene} title={title} description={description} action={action} className="border-0" />;
}
