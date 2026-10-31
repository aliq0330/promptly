/**
 * Workflow'u OTOMATİK çalıştırma — saf mantık (docs/history/296-*). Promptly sunucuda hiçbir model çalıştırmaz: bu zincir TARAYICIDA, kişinin KENDİ API
 * anahtarıyla çalışır (`lib/ai-generate`; anahtar sunucuya hiç gitmez). Elle "Adım adım" modunun (`lib/workflow-run.ts`) üstüne kurulur ve AYNI durumu
 * kullanır: bir adımın çıktısı o adımın İLK çıktı alanına yazılır, ona bağlı sonraki adım girdisi olarak kendiliğinden okur.
 *
 * Kurallar (ilk dilim): yalnız yayında + metin türünde Prompt adımları çalışır; her çalışan adımın en az bir çıktısı tanımlı olmalıdır (zincir o çıktıdan
 * beslenir). Çalışamayan adım (istek, görsel/ses/video, yayında olmayan, çıktısız) zinciri DURDURUR — elle yapılıp çıktısı yapıştırılırsa zincir
 * kaldığı yerden devam eder. Bağlı bir girdinin kaynağı boşsa model çağrılmaz (eksik girdiyle para harcanmaz). Ağa/React'e dokunmaz: model ve prompt
 * yükleme dışarıdan verilir (`ChainDeps`), bu yüzden birim testlidir.
 */
import type { WorkflowStep } from "@/types";
import { resolveInputs, setRunOutput, toggleStepDone, type WorkflowRunState } from "./workflow-run.ts";

export type StepRunBlock = "no_content" | "not_prompt" | "unpublished" | "not_text" | "no_output";

/** Adım otomatik çalıştırılabilir mi; değilse neden (`null` = çalışabilir). */
export function stepRunBlock(step: WorkflowStep): StepRunBlock | null {
  const ref = step.content;
  if (!ref) return "no_content";
  if (ref.type !== "prompt") return "not_prompt";
  if (!ref.published) return "unpublished";
  if (ref.contentType !== "text") return "not_text";
  if (step.outputs.length === 0) return "no_output";
  return null;
}

/** Adımın (ilk çıktısında) bir sonucu var mı — elle yapıştırılmış ya da daha önce otomatik üretilmiş. */
export function hasStepResult(step: WorkflowStep, state: WorkflowRunState): boolean {
  return step.outputs.some((output) => (state.outputs[output.id] ?? "").trim() !== "");
}

/** Bu adım için model çağrısı yapılacak mı: çalışabilir ve (bitmiş + sonuçlu değil). */
export function needsRun(step: WorkflowStep, state: WorkflowRunState): boolean {
  return stepRunBlock(step) === null && !(state.done.includes(step.id) && hasStepResult(step, state));
}

export interface ChainPlan {
  /** Çalıştırılacak adımların sırası (model çağrısı olacak olanlar). */
  runs: number[];
  /** Zincirin duracağı ilk adım (çalışamayan ve sonucu olmayan) ve nedeni; yoksa `null`. */
  stopsAt: { index: number; reason: StepRunBlock } | null;
}

/** `from` adımından başlayınca ne olacağı: kaç model çağrısı, nerede durur. Çalıştırmadan önce maliyet notu için kullanılır. */
export function planChain(steps: WorkflowStep[], state: WorkflowRunState, from = 0): ChainPlan {
  const runs: number[] = [];
  for (let index = Math.max(0, from); index < steps.length; index += 1) {
    const step = steps[index];
    const block = stepRunBlock(step);
    if (block) {
      if (hasStepResult(step, state)) continue;
      return { runs, stopsAt: { index, reason: block } };
    }
    if (needsRun(step, state)) runs.push(index);
  }
  return { runs, stopsAt: null };
}

/** Başlanacak adım: modele gidecek ilk adım; yoksa durma noktası; hiçbiri yoksa 0. */
export function firstStepToRun(steps: WorkflowStep[], state: WorkflowRunState): number {
  const plan = planChain(steps, state, 0);
  if (plan.runs.length > 0) return plan.runs[0];
  return plan.stopsAt?.index ?? 0;
}

/**
 * Adımın modele gidecek metni: prompt metni + (varsa) girdiler. Girdiler "Etiket:\ndeğer" bloklarıdır, prompt'tan boş satırla ayrılır.
 * Boş girdi atlanır. Manuel akışta kişi girdiyi araca kendisi yapıştırır; burada aynı şeyi sistem yapar (kural tek yerde, görünür).
 */
export function composeStepPrompt(promptText: string, inputs: { label: string; value: string }[]): string {
  const blocks = inputs.filter((input) => input.value.trim() !== "").map((input) => `${input.label}:\n${input.value.trim()}`);
  return blocks.length === 0 ? promptText.trim() : `${promptText.trim()}\n\n${blocks.join("\n\n")}`;
}

/**
 * "Baştan çalıştır": otomatik çalışabilen adımların çıktılarını ve "bitti" işaretlerini temizler. Elle yapılan (çalışamayan) adımlara, onların çıktılarına
 * ve kişinin kendi girdilerine DOKUNMAZ — yalnız modelin üreteceği şey yeniden üretilir.
 */
export function clearAutoResults(steps: WorkflowStep[], state: WorkflowRunState): WorkflowRunState {
  const outputs = { ...state.outputs };
  const cleared = new Set<string>();
  for (const step of steps) {
    if (stepRunBlock(step) !== null) continue;
    cleared.add(step.id);
    for (const output of step.outputs) delete outputs[output.id];
  }
  return { ...state, outputs, done: state.done.filter((id) => !cleared.has(id)) };
}

export type ChainErrorKind = "invalid_key" | "quota" | "network" | "blocked" | "model" | "empty" | "unknown" | "prompt_load" | "variable" | "missing_input";
const PROVIDER_KINDS: readonly string[] = ["invalid_key", "quota", "network", "blocked", "model", "empty", "unknown"];

export interface ChainStepError {
  kind: ChainErrorKind;
  /** `variable`: değişken adı; `missing_input`: kaynak çıktının etiketi; sağlayıcı hatasında kısa ayrıntı. */
  detail?: string;
}

export type ChainEvent =
  | { type: "start"; index: number }
  | { type: "done"; index: number; state: WorkflowRunState; text: string }
  | { type: "kept"; index: number }
  | { type: "blocked"; index: number; reason: StepRunBlock }
  | { type: "error"; index: number; error: ChainStepError };

export type ChainStop = "completed" | "aborted" | "blocked" | "error";

export type LoadedPrompt = { ok: true; text: string } | { ok: false; missingVariable?: string };

export interface ChainDeps {
  /** Adımın prompt metnini (değişkenler varsayılanlarıyla çözülmüş) yükler. */
  loadPrompt(step: WorkflowStep, signal: AbortSignal): Promise<LoadedPrompt>;
  /** Tek model çağrısı; hata `{ kind }` taşıyan bir `Error` olarak fırlatılır (`AiError`). */
  generate(prompt: string, signal: AbortSignal): Promise<string>;
}

export interface ChainResult {
  state: WorkflowRunState;
  stop: ChainStop;
  /** `blocked` / `error` / `aborted` için durulan adım. */
  at?: number;
}

function isAbort(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (typeof error === "object" && error !== null && (error as { name?: string }).name === "AbortError");
}

/**
 * Zinciri `from` adımından sona kadar çalıştırır. Her adım sonrası `onEvent` (durum güncel `state` ile) çağrılır; sonuç durumu döner.
 * İlk hata/engelde durur (sonraki adımlar önceki çıktıya bağlı olabilir). `signal` iptal edilirse çalışan çağrı kesilir ve zincir `aborted` ile biter.
 */
export async function runWorkflowChain(args: {
  steps: WorkflowStep[];
  state: WorkflowRunState;
  from: number;
  deps: ChainDeps;
  signal: AbortSignal;
  onEvent?: (event: ChainEvent) => void;
  /** Etiketi olmayan girdi için görünen ad (çevrilmiş metin dışarıdan verilir). */
  defaultInputLabel: string;
}): Promise<ChainResult> {
  const { steps, deps, signal, onEvent, defaultInputLabel } = args;
  let state = args.state;
  for (let index = Math.max(0, args.from); index < steps.length; index += 1) {
    if (signal.aborted) return { state, stop: "aborted", at: index };
    const step = steps[index];

    const block = stepRunBlock(step);
    if (block) {
      if (hasStepResult(step, state)) {
        onEvent?.({ type: "kept", index });
        continue;
      }
      onEvent?.({ type: "blocked", index, reason: block });
      return { state, stop: "blocked", at: index };
    }
    if (state.done.includes(step.id) && hasStepResult(step, state)) {
      onEvent?.({ type: "kept", index });
      continue;
    }

    onEvent?.({ type: "start", index });
    const fail = (error: ChainStepError): ChainResult => {
      onEvent?.({ type: "error", index, error });
      return { state, stop: "error", at: index };
    };

    const inputs: { label: string; value: string }[] = [];
    for (const resolved of resolveInputs(steps, index, state)) {
      if (resolved.kind === "linked" && resolved.value.trim() === "") return fail({ kind: "missing_input", detail: resolved.outputLabel || resolved.input.label });
      inputs.push({ label: resolved.input.label || defaultInputLabel, value: resolved.value });
    }

    let loaded: LoadedPrompt;
    try {
      loaded = await deps.loadPrompt(step, signal);
    } catch (error) {
      if (isAbort(error, signal)) return { state, stop: "aborted", at: index };
      return fail({ kind: "prompt_load" });
    }
    if (!loaded.ok) return fail(loaded.missingVariable ? { kind: "variable", detail: loaded.missingVariable } : { kind: "prompt_load" });

    let text: string;
    try {
      text = (await deps.generate(composeStepPrompt(loaded.text, inputs), signal)).trim();
    } catch (error) {
      if (isAbort(error, signal)) return { state, stop: "aborted", at: index };
      const kind = (error as { kind?: unknown } | null)?.kind;
      return fail({ kind: typeof kind === "string" && PROVIDER_KINDS.includes(kind) ? (kind as ChainErrorKind) : "unknown", detail: (error as Error | null)?.message || undefined });
    }
    if (text === "") return fail({ kind: "empty" });

    state = setRunOutput(state, step.outputs[0].id, text);
    if (!state.done.includes(step.id)) state = toggleStepDone(state, step.id);
    onEvent?.({ type: "done", index, state, text });
  }
  return { state, stop: "completed" };
}
