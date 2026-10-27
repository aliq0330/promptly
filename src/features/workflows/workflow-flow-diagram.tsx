"use client";

import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link2Off, Sparkles, SquareTerminal, Workflow as WorkflowIcon } from "lucide-react";
import { StorageImg } from "@/components/ui/storage-media";
import { useTranslation } from "@/lib/i18n/language-provider";
import { RELATION_TYPES } from "@/lib/relations/types";
import { fetchWorkflowFlow, type WorkflowFlowData } from "@/lib/supabase/workflow-flow";
import {
  computeFlowLayout,
  fitScale,
  FLOW_NODE_H,
  FLOW_NODE_W,
  FLOW_PAD_X,
  type FlowBox,
  type FlowOptions,
} from "@/lib/workflow-flow-layout";
import { cn } from "@/lib/utils";
import type { WorkflowStep } from "@/types";

/**
 * Workflow akış diyagramı (docs/history/261-*): adımlar düğüm, ardışık adımlar arasında çıktı → girdi oku, altta adımda kullanılan
 * prompt kartı ve kartlar arasındaki ilişkiler. SALT OKUNUR; hiçbir olay işleyicisi yoktur (Space panosu kendi işaretçi olaylarını
 * yakalar, workflow sayfasında tıklama "Panoyu aç" bağlantısına aittir). Yerleşim `lib/workflow-flow-layout.ts`'tedir (saf, testli);
 * burada yalnız çizilir ve kutuya / genişliğe ölçeklenir. Düzenleme tek yerde kalır: workflow'un kendisi.
 */

export type FlowFit = { mode: "box" } | { mode: "width" };

export function useWorkflowFlow(workflowId: string | null | undefined): { data: WorkflowFlowData | null; state: "loading" | "ready" | "failed" } {
  const [result, setResult] = useState<{ id: string; data: WorkflowFlowData | null } | null>(null);
  useEffect(() => {
    if (!workflowId) return;
    let cancelled = false;
    fetchWorkflowFlow(workflowId).then(
      (data) => !cancelled && setResult({ id: workflowId, data }),
      () => !cancelled && setResult({ id: workflowId, data: null }),
    );
    return () => {
      cancelled = true;
    };
  }, [workflowId]);
  const current = result && result.id === workflowId ? result : null;
  if (!workflowId) return { data: null, state: "failed" };
  if (!current) return { data: null, state: "loading" };
  return { data: current.data, state: current.data ? "ready" : "failed" };
}

function Chip({ children, tone = "plain" }: { children: React.ReactNode; tone?: "plain" | "flow" }) {
  return (
    <span
      className={cn(
        "max-w-full truncate rounded-md px-1.5 py-0.5 text-[11px] leading-4",
        tone === "flow" ? "bg-primary-soft font-semibold text-primary" : "border border-border-soft bg-surface-soft font-mono text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}

const MAX_CHIPS = 3;

function ChipRow({ chips }: { chips: { label: string; tone?: "plain" | "flow" }[] }) {
  const { t } = useTranslation();
  const shown = chips.slice(0, MAX_CHIPS);
  return (
    <div className="flex min-w-0 flex-wrap gap-1">
      {shown.map((chip, index) => (
        <Chip key={index} tone={chip.tone}>
          {chip.label}
        </Chip>
      ))}
      {chips.length > MAX_CHIPS && <Chip>{t("wfSpace.flow.moreChips", { count: chips.length - MAX_CHIPS })}</Chip>}
    </div>
  );
}

function StepNode({ step, index, steps, box, options, lowDetail }: { step: WorkflowStep; index: number; steps: WorkflowStep[]; box: FlowBox; options: FlowOptions; lowDetail: boolean }) {
  const { t } = useTranslation();
  const inputs = step.inputs.map((input) => {
    const from = input.source ? steps.findIndex((s) => s.id === input.source!.stepId) : -1;
    return from >= 0 ? { label: t("wfSpace.flow.fromStep", { n: from + 1 }), tone: "flow" as const } : { label: input.label || "—", tone: "plain" as const };
  });
  const outputs = step.outputs.map((output) => ({ label: output.label || "—" }));
  return (
    <div
      data-flow-node={index}
      className="absolute flex flex-col gap-2 overflow-hidden rounded-xl border border-border bg-surface p-3 shadow-card"
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      <div className="flex items-start gap-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-[12px] font-bold text-primary-foreground">{index + 1}</span>
        <p className="line-clamp-2 min-w-0 flex-1 text-[14px] font-semibold leading-5 text-text">{step.title || t("wfSpace.flow.untitledStep")}</p>
      </div>
      {!lowDetail &&
        (options.showIo ? (
          <>
            <div className="grid grid-cols-[46px_minmax(0,1fr)] items-start gap-1.5">
              <span className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-text-muted">{t("wfSpace.flow.input")}</span>
              {inputs.length > 0 ? <ChipRow chips={inputs} /> : <span className="text-[11px] text-text-muted">—</span>}
            </div>
            <div className="grid grid-cols-[46px_minmax(0,1fr)] items-start gap-1.5">
              <span className="pt-0.5 text-[10px] font-bold uppercase tracking-[0.07em] text-text-muted">{t("wfSpace.flow.output")}</span>
              {outputs.length > 0 ? <ChipRow chips={outputs} /> : <span className="text-[11px] text-text-muted">—</span>}
            </div>
          </>
        ) : (
          step.description && <p className="line-clamp-4 break-words text-[12px] leading-4 text-text-secondary">{step.description}</p>
        ))}
    </div>
  );
}

function LinkCard({ step, box, lowDetail }: { step: WorkflowStep; box: FlowBox; lowDetail: boolean }) {
  const { t } = useTranslation();
  const content = step.content;
  const Icon = step.stepType === "request" ? Sparkles : SquareTerminal;
  return (
    <div
      data-flow-link=""
      className={cn(
        "absolute flex flex-col gap-1.5 overflow-hidden rounded-xl border bg-surface p-3",
        content ? "border-border shadow-card" : "border-dashed border-border-strong",
      )}
      style={{ left: box.x, top: box.y, width: box.w, height: box.h }}
    >
      {!lowDetail && (
        <>
          <p className={cn("flex items-center gap-1.5 text-[10.5px] font-bold uppercase tracking-[0.07em]", content ? "text-primary" : "text-text-muted")}>
            {content ? <Icon size={12} aria-hidden /> : <Link2Off size={12} aria-hidden />}
            {content ? t(step.stepType === "request" ? "spaces.content.request" : "spaces.item.prompt") : t(step.contentMissing ? "spaces.source.unavailable" : "wfSpace.flow.noContent")}
          </p>
          {content && (
            <div className="flex min-h-0 flex-1 items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="line-clamp-3 break-words text-[13px] font-semibold leading-[1.25] text-text">{content.title}</p>
                <p className="mt-1 truncate text-[11.5px] text-text-muted">@{content.authorUsername}</p>
              </div>
              {content.thumbnailUrl && <StorageImg src={content.thumbnailUrl} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />}
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Tuvalin doğal boyutu ve ölçeği hesaplanır; `box` kipinde üst kutuya (ör. pano öğesi) sığar, `width` kipinde genişliğe uyar ve yüksekliği kendisi belirler. */
export const WorkflowFlowDiagram = memo(function WorkflowFlowDiagram({
  data,
  options,
  fit,
  lowDetail = false,
  className,
}: {
  data: WorkflowFlowData;
  options: Pick<FlowOptions, "showIo" | "showLinks" | "showRelations">;
  fit: FlowFit;
  lowDetail?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const { workflow, steps, relations } = data;
  const { showIo, showLinks, showRelations } = options;
  const layout = useMemo(
    () => computeFlowLayout(steps, { showIo, showLinks, showRelations }, relations),
    [steps, relations, showIo, showLinks, showRelations],
  );
  const markerId = useId().replace(/:/g, "");
  const hostRef = useRef<HTMLDivElement>(null);
  const [host, setHost] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => setHost({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const scale = host && host.w > 0 ? (fit.mode === "width" ? fitScale(layout, { w: host.w }) : fitScale(layout, host)) : 1;
  const offsetX = fit.mode === "box" && host ? Math.max(0, (host.w - layout.width * scale) / 2) : 0;
  const offsetY = fit.mode === "box" && host ? Math.max(0, (host.h - layout.height * scale) / 2) : 0;
  const stepTitle = (index: number) => steps[index]?.title || t("wfSpace.flow.untitledStep");

  return (
    <div
      ref={hostRef}
      data-workflow-flow={workflow.id}
      className={cn("relative overflow-hidden", fit.mode === "box" ? "h-full w-full" : "w-full", className)}
      style={fit.mode === "width" ? { height: Math.round(layout.height * scale) } : undefined}
    >
      <div className="absolute left-0 top-0 origin-top-left" style={{ width: layout.width, height: layout.height, transform: `translate(${offsetX}px, ${offsetY}px) scale(${scale})` }}>
        <div className="absolute inset-2 rounded-[28px] border-2 border-dashed border-border-strong bg-surface/60" aria-hidden />
        <div className="absolute flex items-center gap-2.5" style={{ left: FLOW_PAD_X, right: FLOW_PAD_X, top: 18, height: 32 }}>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.07em] text-primary">
            <WorkflowIcon size={13} aria-hidden />
            {t("workflow.singular")}
          </span>
          <p className="min-w-0 flex-1 truncate font-display text-[17px] font-bold text-text">{workflow.title}</p>
          <span className="hidden shrink-0 text-[12px] text-text-muted sm:inline">{t("workflow.stepCount", { count: steps.length })}</span>
        </div>

        <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={layout.width} height={layout.height} aria-hidden>
          <defs>
            <marker id={markerId} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 1 9 5 0 9z" className="fill-primary" />
            </marker>
          </defs>
          {showLinks &&
            layout.links.map((link, index) => (
              <path key={`lk${index}`} d={`M${link.x + link.w / 2} ${layout.nodes[index].y + FLOW_NODE_H}V${link.y}`} className="stroke-border-strong" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
            ))}
          {layout.arrows.map((arrow) => (
            <path key={`ar${arrow.from}`} d={arrow.path} className="stroke-primary" strokeWidth={2} fill="none" markerEnd={`url(#${markerId})`} />
          ))}
          {layout.relations.map((rel) => (
            <path key={`rl${rel.a}-${rel.b}`} d={rel.path} className="stroke-secondary" strokeWidth={1.5} strokeDasharray="5 4" fill="none" />
          ))}
        </svg>

        {layout.nodes.map((node) => (
          <StepNode key={steps[node.index].id} step={steps[node.index]} index={node.index} steps={steps} box={node} options={{ showIo, showLinks, showRelations }} lowDetail={lowDetail} />
        ))}
        {showLinks && layout.links.map((link, index) => <LinkCard key={`lc${steps[index].id}`} step={steps[index]} box={link} lowDetail={lowDetail} />)}

        {!lowDetail &&
          layout.arrows
            .filter((arrow) => arrow.label)
            .map((arrow) => (
              <span
                key={`al${arrow.from}`}
                className="absolute max-w-[120px] -translate-x-1/2 -translate-y-1/2 truncate rounded-full border border-border bg-surface px-2 py-0.5 font-mono text-[10px] text-primary"
                style={{ left: arrow.labelX, top: arrow.labelY }}
              >
                {arrow.label}
              </span>
            ))}
        {!lowDetail &&
          layout.relations.map((rel) => {
            const type = data.relations.find((r) => (r.a === rel.a && r.b === rel.b) || (r.a === rel.b && r.b === rel.a))?.type;
            return (
              <span
                key={`rt${rel.a}-${rel.b}`}
                className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-full border border-secondary/40 bg-surface px-2 py-0.5 text-[10.5px] font-semibold text-secondary"
                style={{ left: rel.labelX, top: rel.labelY }}
              >
                {type ? t(RELATION_TYPES[type].labelKey) : ""}
              </span>
            );
          })}
        {!lowDetail &&
          layout.crossRowRelations.map((rel) => {
            const type = data.relations.find((r) => (r.a === rel.a && r.b === rel.b) || (r.a === rel.b && r.b === rel.a))?.type;
            return (
              <p key={`cr${rel.a}-${rel.b}`} className="absolute truncate text-[11px] font-semibold text-secondary" style={{ left: layout.nodes[rel.a].x, top: rel.labelY, width: FLOW_NODE_W }}>
                ↔ {t("wfSpace.flow.relatesTo", { n: rel.b + 1, title: stepTitle(rel.b), type: type ? t(RELATION_TYPES[type].labelKey) : "" })}
              </p>
            );
          })}
      </div>
    </div>
  );
});
