"use client";

import { useEffect, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SpaceDialog } from "@/features/spaces/space-modals";
import { ExchangeError, FORMAT_META, exportFileName, serializePrompts, type ExchangeFormat, type ExchangePrompt } from "@/lib/exchange";
import { useTranslation } from "@/lib/i18n/language-provider";
import { downloadTextFile } from "./download-file";

const FORMATS: { value: ExchangeFormat; label: "exchange.export.json" | "exchange.export.markdown" | "exchange.export.csv"; hint: "exchange.export.jsonHint" | "exchange.export.markdownHint" | "exchange.export.csvHint" }[] = [
  { value: "json", label: "exchange.export.json", hint: "exchange.export.jsonHint" },
  { value: "markdown", label: "exchange.export.markdown", hint: "exchange.export.markdownHint" },
  { value: "csv", label: "exchange.export.csv", hint: "exchange.export.csvHint" },
];

/**
 * Promptları JSON / Markdown / CSV olarak indirir (docs/history/250-*). Veriyi `load` getirir (tek prompt ya da kütüphanenin hepsi);
 * dönüştürme `lib/exchange`'in saf çekirdeğindedir, sunucuya ayrıca bir şey yazılmaz.
 */
export function ExportPromptsModal({ single, load, onClose }: { single?: boolean; load: () => Promise<ExchangePrompt[]>; onClose: () => void }) {
  const { t } = useTranslation();
  const [items, setItems] = useState<ExchangePrompt[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [format, setFormat] = useState<ExchangeFormat>("json");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((loaded) => !cancelled && setItems(loaded))
      .catch(() => !cancelled && setLoadFailed(true));
    return () => {
      cancelled = true;
    };
    // `load` her render'da yeni bir fonksiyon olabilir; pencere açılırken bir kez çalışır.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleDownload() {
    if (!items || items.length === 0) return;
    setError(null);
    try {
      const text = serializePrompts(items, format);
      downloadTextFile(exportFileName(format, items.length === 1 ? items[0].title : ""), text, FORMAT_META[format].mime);
      onClose();
    } catch (err) {
      setError(err instanceof ExchangeError && err.code === "markdown_separator" ? t("exchange.export.separatorError") : t("exchange.export.failed"));
    }
  }

  const ready = items !== null && items.length > 0;
  return (
    <SpaceDialog
      title={single ? t("exchange.export.titleOne") : t("exchange.export.title")}
      onClose={onClose}
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" onClick={handleDownload} disabled={!ready} data-testid="exchange-download">
            <Download size={16} />
            {t("exchange.export.download")}
          </Button>
        </>
      }
    >
      <div className="space-y-4" data-testid="exchange-export">
        {loadFailed ? (
          <p role="alert" className="text-small text-danger">
            {t("exchange.export.loadFailed")}
          </p>
        ) : items === null ? (
          <p className="flex items-center gap-2 text-small text-text-secondary">
            <Loader2 size={16} className="animate-spin" />
            {t("exchange.export.preparing")}
          </p>
        ) : items.length === 0 ? (
          <p className="text-small text-text-secondary">{t("exchange.export.empty")}</p>
        ) : (
          <>
            {!single && <p className="text-small text-text-secondary">{t("exchange.export.count", { count: items.length })}</p>}
            <fieldset className="space-y-2">
              <legend className="mb-1 text-label font-semibold text-text">{t("exchange.export.formatLabel")}</legend>
              {FORMATS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors duration-200 ${format === option.value ? "border-primary bg-primary-soft" : "border-border-soft hover:bg-surface-soft"}`}
                >
                  <input type="radio" name="exchange-format" value={option.value} checked={format === option.value} onChange={() => setFormat(option.value)} className="mt-1 accent-primary" />
                  <span>
                    <span className="block text-small font-semibold text-text">{t(option.label)}</span>
                    <span className="block text-caption text-text-secondary">{t(option.hint)}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            <p className="text-caption text-text-muted">{t("exchange.export.note")}</p>
          </>
        )}
        {error && (
          <p role="alert" className="text-small text-danger">
            {error}
          </p>
        )}
      </div>
    </SpaceDialog>
  );
}
