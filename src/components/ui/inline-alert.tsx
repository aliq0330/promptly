import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

/**
 * The one inline message block (audit §6/§11): a short error, warning or notice shown where it happened, in a form, dialog or
 * list. Replaces the dozens of hand-written `rounded-md bg-danger-soft px-3 py-2 text-small text-danger` paragraphs. Errors are
 * announced (`role="alert"`); softer tones are `role="status"`.
 */
const TONES = {
  danger: "bg-danger-soft text-danger",
  warning: "bg-warning-soft text-warning",
  success: "bg-success-soft text-success",
  info: "bg-primary-soft text-primary-text",
} as const;

export function InlineAlert({
  tone = "danger",
  className,
  ...props
}: HTMLAttributes<HTMLParagraphElement> & { tone?: keyof typeof TONES }) {
  return <p role={tone === "danger" ? "alert" : "status"} className={cn("rounded-md px-3 py-2 text-small", TONES[tone], className)} {...props} />;
}
