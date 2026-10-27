"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { SquareTerminal } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { useTranslation } from "@/lib/i18n/language-provider";
import { fitScale } from "@/lib/workflow-flow-layout";
import type { Box } from "@/lib/space-connectors";
import type { PlanStep, WorkflowImportPlan } from "@/lib/workflow-board-plan";
import type { SpaceConnection } from "@/lib/supabase/spaces";
import { BoardConnectors } from "./board/board-connectors";
import { cn } from "@/lib/utils";

/**
 * Aktarma penceresinin önizlemesi (docs/history/262-*): planın gerçek yerleşimi (adım kartları, prompt'lar, görseller) ve okları,
 * pencere genişliğine ölçeklenmiş. Panoya yazılacak olanın aynısıdır; çizim panonun kendi ok katmanını (`BoardConnectors`) kullanır.
 */
export function WorkflowPlanPreview({ plan, steps }: { plan: WorkflowImportPlan; steps: readonly PlanStep[] }) {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const pad = 16;
  const world = { w: plan.size.w + pad * 2, h: plan.size.h + pad * 2 };
  const scale = width > 0 ? fitScale({ width: world.w, height: world.h }, { w: width }) : 1;
  const boxes = useMemo(() => {
    const out: Record<string, Box> = {};
    for (const item of plan.items) out[item.id] = { x: item.x + pad, y: item.y + pad, w: item.w, h: item.h };
    return out;
  }, [plan.items]);
  const connections = useMemo<SpaceConnection[]>(
    () =>
      plan.connections.map((c) => ({
        id: c.id,
        spaceId: "",
        fromItemId: c.fromItemId,
        toItemId: c.toItemId,
        label: c.label,
        lineStyle: c.lineStyle,
        arrow: c.arrow,
        route: c.route,
        color: c.color,
        sourceWorkflowId: null,
        sourceRole: c.role,
        createdBy: null,
        createdAt: "",
      })),
    [plan.connections],
  );
  const promptTitle = useMemo(() => new Map(steps.flatMap((step) => (step.content ? [[step.content.id, step.content.title] as const] : []))), [steps]);

  return (
    <div ref={hostRef} data-plan-preview="" className="relative w-full overflow-hidden rounded-xl border border-border-soft bg-surface-soft" style={{ height: Math.round(world.h * scale) }}>
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: world.w, height: world.h, transform: `scale(${scale})` }}>
        <BoardConnectors connections={connections} boxes={boxes} zoom={scale} selectedId={null} interactive={false} lowDetail={scale < 0.4} />
        {plan.items.map((item) => {
          const box = boxes[item.id];
          const style = { left: box.x, top: box.y, width: box.w, height: box.h };
          if (item.sourceRole === "step") {
            return (
              <div key={item.id} data-plan-step="" className="absolute overflow-hidden rounded-xl border border-primary/50 bg-surface p-3 shadow-card" style={{ ...style, zIndex: 10 }}>
                <div className="flex items-start gap-2">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{item.sourceStepNo}</span>
                  <p className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-5 text-text">{item.title || t("wfSpace.objects.untitledStep")}</p>
                </div>
                {item.body && <p className="mt-2 line-clamp-3 whitespace-pre-line break-words font-mono text-[11px] leading-4 text-text-muted">{item.body.replace(/^>> /gm, "→ ").replace(/^<< /gm, "← ")}</p>}
              </div>
            );
          }
          if (item.kind === "image") {
            return (
              <div key={item.id} data-plan-image="" className="absolute overflow-hidden rounded-lg border border-border bg-surface-soft" style={{ ...style, zIndex: 10 }}>
                {item.mediaUrl && <StorageImg src={item.mediaUrl} alt="" className="h-full w-full object-cover" />}
              </div>
            );
          }
          return (
            <div key={item.id} data-plan-prompt="" className={cn("absolute overflow-hidden rounded-xl border border-border bg-surface p-3")} style={{ ...style, zIndex: 10 }}>
              <p className="flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.08em] text-primary">
                <SquareTerminal size={12} aria-hidden />
                {t("spaces.item.prompt")}
              </p>
              <p className="mt-1 line-clamp-3 break-words text-[13px] font-semibold leading-[1.25] text-text">{(item.promptId ? promptTitle.get(item.promptId) : item.contentId ? promptTitle.get(item.contentId) : "") ?? ""}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
