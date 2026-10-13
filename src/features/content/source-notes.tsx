import { linkifyNote } from "@/lib/source-notes";

/** Credit lines split off a description (`splitSourceNotes`) — muted, with real links. */
export function SourceNotes({ notes }: { notes: string[] }) {
  if (notes.length === 0) return null;
  return (
    <ul className="max-w-2xl space-y-0.5 border-l-2 border-border-soft pl-3 text-caption leading-relaxed text-text-muted">
      {notes.map((note) => (
        <li key={note} className="break-words [overflow-wrap:anywhere]">
          {linkifyNote(note).map((part, i) =>
            part.href ? (
              <a key={i} href={part.href} target="_blank" rel="noopener noreferrer nofollow" className="underline decoration-border-strong underline-offset-2 hover:text-text">
                {part.text}
              </a>
            ) : (
              <span key={i}>{part.text}</span>
            ),
          )}
        </li>
      ))}
    </ul>
  );
}
