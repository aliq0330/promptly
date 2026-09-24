import type { LucideIcon } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";

/** Profile tab/filter empty state — delegates to the design system's shared EmptyState. */
export function ProfileEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; href: string };
}) {
  return <EmptyState icon={icon} title={title} description={description} action={action} className="border-0" />;
}
