"use client";

import type { IconComponent } from "@/components/icons/icon";
import { formatCount } from "@/lib/utils";

export interface RowMetric {
  icon: IconComponent;
  /** Accessible name and tooltip ("Kopyalama"). */
  label: string;
  value: number;
}

/**
 * The counters of a row in the viewer's OWN library (docs/history/478-*, My content): what the post is used for — copies and saves — instead of the
 * social counters (like / comment), which stay one tap away on the post. Passed to `ContentCardPost` as `ownMetrics`; only an `own` row draws it.
 */
export function RowMetrics({ items }: { items: RowMetric[] }) {
  return (
    <div className="flex items-center gap-4 px-2" data-row-metrics="">
      {items.map(({ icon: Icon, label, value }) => (
        <span key={label} title={label} aria-label={`${label}: ${value}`} className="inline-flex items-center gap-1.5 text-small font-semibold tabular-nums text-text-muted">
          <Icon size={16} aria-hidden />
          {formatCount(value)}
        </span>
      ))}
    </div>
  );
}
