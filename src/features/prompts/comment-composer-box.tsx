"use client";

import type { ReactNode } from "react";
import { MentionTextarea } from "@/features/mentions/mention-field";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/** Bu uzunluktan sonra sayaç telefonda da görünür (kısa yazıda araç satırında yer açık kalsın). */
const COUNTER_ALWAYS_FROM = 1800;

/**
 * Yorum / yanıt / düzenleme yazma kutusu (docs/history/454-*): yazı alanı, ince ayırıcı çizgi ve araç satırı TEK çizgili çerçevededir; odaklanınca
 * kenarlık maviye döner. Gönder (ve varsa Vazgeç) masaüstü/tablette araç satırının sağındadır; telefonda Vazgeç'li kutularda (yanıt) düğmeler kutunun
 * ALTINA iner (Gönder solda, Vazgeç sağda) çünkü üç araç + iki düğme dar kutuya sığmaz. Yeni bir yorum yazma yüzeyi bu kutuyu kullanır.
 */
export function CommentComposerBox({
  value,
  onChange,
  placeholder,
  autoFocus,
  maxLength = 2000,
  minHeightClass = "min-h-19",
  toolbar,
  preview,
  submit,
  cancel,
  showCounter = true,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  maxLength?: number;
  /** Yazı alanının en küçük yüksekliği (yanıt/düzenleme kutuları biraz daha yüksektir). */
  minHeightClass?: string;
  /** `CommentExtrasToolbar` (fotoğraf · GIF · içerik). */
  toolbar: ReactNode;
  /** Seçili ekin önizlemesi (`CommentExtrasPreview`): kutunun içinde, araç satırının üstünde. */
  preview?: ReactNode;
  /** Birincil düğme (Gönder / Kaydet). Verilmezse yalnız araç satırı çizilir (düğmeler dışarıda, ör. alttan kartın sabit altlığı). */
  submit?: ReactNode;
  /** İkincil düğme (Vazgeç). */
  cancel?: ReactNode;
  showCounter?: boolean;
  className?: string;
}) {
  const { t } = useTranslation();
  const isPhone = useMediaQuery("(max-width: 639px)");
  const below = isPhone && Boolean(cancel) && Boolean(submit);
  const counter = showCounter && value.length > 0 && (
    <span className={cn("whitespace-nowrap text-caption tabular-nums text-text-muted", value.length < COUNTER_ALWAYS_FROM && "max-sm:hidden")} data-comment-counter="">
      {t("comments.charCount", { count: value.length })}
    </span>
  );

  return (
    <div className={cn("min-w-0 flex-1", className)} data-comment-composer-box="">
      <div className="rounded-lg border border-border-strong bg-surface transition-[border-color,box-shadow] duration-200 ease-soft focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20">
        <MentionTextarea
          value={value}
          onChange={onChange}
          maxLength={maxLength}
          rows={2}
          autoFocus={autoFocus}
          placeholder={placeholder}
          className={cn(
            "block max-h-60 w-full resize-none bg-transparent px-4 pb-2 pt-3 text-small text-text placeholder:text-text-muted field-sizing-content focus:outline-none",
            minHeightClass,
          )}
        />
        {preview && <div className="px-3 pb-2">{preview}</div>}
        <div className="flex items-center gap-1 border-t border-border-soft py-1.5 pl-1.5 pr-2">
          {toolbar}
          <span className="ml-auto flex items-center gap-2">
            {counter}
            {!below && cancel}
            {!below && submit}
          </span>
        </div>
      </div>
      {below && (
        <div className="mt-3 flex items-center justify-between gap-2">
          {submit}
          {cancel}
        </div>
      )}
    </div>
  );
}
