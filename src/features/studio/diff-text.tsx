import type { DiffSegment } from "@/lib/studio-diff";

/** Highlighted word diff — additions/removals are marked with underline/strikethrough as well as colour, never colour alone. */
export function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((segment, index) =>
        segment.kind === "same" ? (
          <span key={index}>{segment.text}</span>
        ) : segment.kind === "add" ? (
          <ins key={index} className="rounded-sm bg-success/15 text-text underline decoration-success/60 underline-offset-2">
            {segment.text}
          </ins>
        ) : (
          <del key={index} className="rounded-sm bg-danger/15 text-text-secondary decoration-danger/70">
            {segment.text}
          </del>
        ),
      )}
    </>
  );
}
