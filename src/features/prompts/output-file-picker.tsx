"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FileAudio, FileVideo, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n/language-provider";
import { OUTPUT_MAX_BYTES, OUTPUT_MIME_TYPES, type OutputKind } from "@/lib/supabase/prompt-output";

function formatSize(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/**
 * Video / ses promptları için "Çıktı" dosyası seçici. Yalnızca dosyayı
 * seçtirir ve yerelde oynatılabilir önizlemesini gösterir — yükleme
 * yayın anında formun kendisi tarafından yapılır (seçim anında hiçbir şey
 * gönderilmez). Tür ve boyut, `result-media` bucket'ının kurallarıyla aynı
 * listeden önceden doğrulanır; böylece kullanıcı ham bir storage hatası
 * yerine anlaşılır bir mesaj görür.
 */
export function OutputFilePicker({
  kind,
  file,
  onChange,
  disabled,
}: {
  kind: OutputKind;
  file: File | null;
  onChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- derived object URL must follow the picked file
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const allowed: readonly string[] = OUTPUT_MIME_TYPES[kind];
  const formats = kind === "video" ? "MP4, WebM, MOV" : "MP3, WAV, OGG, M4A";

  function handlePick(event: React.ChangeEvent<HTMLInputElement>) {
    const picked = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!picked) return;
    if (!allowed.includes(picked.type)) {
      setError(t("output.unsupported", { formats }));
      return;
    }
    if (picked.size > OUTPUT_MAX_BYTES) {
      setError(t("output.tooLarge"));
      return;
    }
    setError(null);
    onChange(picked);
  }

  const Icon = kind === "video" ? FileVideo : FileAudio;

  return (
    <div className="space-y-3">
      <p className="text-sm text-text-muted">{kind === "video" ? t("output.hintVideo") : t("output.hintAudio")}</p>

      <input
        id={inputId}
        ref={inputRef}
        type="file"
        accept={allowed.join(",")}
        onChange={handlePick}
        disabled={disabled}
        className="sr-only"
        data-testid="output-file-input"
      />

      {file ? (
        <div className="space-y-3 rounded-lg border border-border-soft bg-surface-soft p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-soft text-primary">
              <Icon size={18} strokeWidth={1.75} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-text">{file.name}</p>
              <p className="text-caption text-text-muted">{formatSize(file.size)}</p>
            </div>
            <button
              type="button"
              onClick={() => onChange(null)}
              disabled={disabled}
              aria-label={t("output.remove")}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-text"
            >
              <X size={18} />
            </button>
          </div>
          {previewUrl &&
            (kind === "video" ? (
              <video src={previewUrl} controls playsInline preload="metadata" className="max-h-72 w-full rounded-md bg-black" />
            ) : (
              <audio src={previewUrl} controls preload="metadata" className="w-full" />
            ))}
          <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()} disabled={disabled}>
            {t("output.change")}
          </Button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={disabled}
          className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-soft px-4 py-8 text-center transition-colors hover:border-primary/60 hover:bg-primary-soft/40"
        >
          <Upload size={20} strokeWidth={1.75} className="text-text-muted" />
          <span className="text-sm font-medium text-text">{t("output.choose")}</span>
          <span className="text-caption text-text-muted">{formats} · {t("output.maxSize")}</span>
        </button>
      )}

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
      <p className="text-caption text-text-muted">{t("output.uploadNote")}</p>
    </div>
  );
}
