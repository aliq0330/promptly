import type { ReactNode } from "react";

/**
 * Ortak oluşturma sayfası başlığı (Prompt, İstek, Hazır Ayar, Generator,
 * Workflow): solda serif başlık + açıklama, sağda "Taslaklar" butonu.
 * `status` (kayıt durumu gibi) açıklamanın yanına küçük bir satır olarak girer.
 */
export function CreatePageHeader({
  title,
  hint,
  drafts,
  status,
}: {
  title: string;
  hint: string;
  drafts: ReactNode;
  status?: ReactNode;
}) {
  return (
    <>
      <div className="mb-1 flex items-start justify-between gap-3">
        <h1 className="text-h1 font-semibold text-text">{title}</h1>
        {drafts}
      </div>
      <p className="text-sm text-text-muted">{hint}</p>
      {status ? <div className="mt-1.5 text-xs text-text-muted">{status}</div> : null}
      <div className="mb-6" />
    </>
  );
}
