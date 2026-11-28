"use client";

import Link from "next/link";
import { useEffect, useState, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { DialogShell } from "@/components/ui/dialog-shell";
import { Modal } from "@/components/ui/modal";
import { OptionGroup } from "@/components/ui/option-group";
import { Switch } from "@/components/ui/switch";
import { CREATE_PAGE_QUERY } from "@/features/content/create-page-shell";
import { useTranslation } from "@/lib/i18n/language-provider";
import { useMediaQuery } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";

/**
 * Ayar sayfaları ortak parçaları — mobil mockup'ın (docs/mockups/ayar-sayfalari/) birebir karşılığı. Stil `app/ayar-kit.css`'tedir
 * (`.sx` kökü, mockup'la AYNI sınıf adları); burası yalnız o işaretlemeyi bileşen yapar. Topluluk · Ekip · Space ayar/yönetim sayfaları
 * kendi kart/satır/düğmesini yazmaz, bunları kullanır.
 *   Telefon (< md): `SxPage` ekranı kaplayan tam ekran sayfadır (üst çubuk · gövde · altta sabit eylem; uygulama menüleri gizli).
 *   md+          : kabuk yok — aynı gövde mevcut sayfa çerçevesinin içinde okuma sütununda akar.
 */

export function useSxPhone(): boolean {
  return useMediaQuery(CREATE_PAGE_QUERY);
}

export interface SxPageProps {
  /** Üst çubukta başlığın üstündeki küçük üst ad. */
  parent?: string;
  title: string;
  /** Geri bağlantısı; verilmezse `onBack` düğmesi çizilir. */
  backHref?: string;
  onBack?: () => void;
  /** ‹ yerine ✕ (onay ve form sayfaları). */
  close?: boolean;
  /** Sağdaki metin eylemi (`SxBarAction`). */
  action?: ReactNode;
  /** Altta sabit eylem çubuğu (`SxFoot`). */
  footer?: ReactNode;
  testId?: string;
  children: ReactNode;
}

/** Telefonda tam ekran sayfa; md+'da yalnız okuma sütunu. */
export function SxPage({ parent, title, backHref, onBack, close, action, footer, testId, children }: SxPageProps) {
  const { t } = useTranslation();
  const phone = useSxPhone();
  useEffect(() => {
    if (!phone) return;
    const root = document.documentElement;
    root.setAttribute("data-compose-open", "");
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      root.removeAttribute("data-compose-open");
      document.body.style.overflow = previous;
    };
  }, [phone]);

  if (!phone) {
    return (
      <div className="sx sx-flow" data-sx-page data-testid={testId}>
        <div className="body">{children}</div>
        {footer && <div className="foot">{footer}</div>}
      </div>
    );
  }
  const label = close ? t("common.close") : t("common.back");
  const lead = backHref && !close ? (
    <Link href={backHref} className="back" aria-label={label} data-sx-back />
  ) : (
    <button type="button" className={close ? "close" : "back"} aria-label={label} onClick={onBack} data-sx-back />
  );
  return (
    <div className="sx sx-shell" data-sx-page role="dialog" aria-modal="false" aria-label={title} data-testid={testId}>
      <div className="bar">
        {lead}
        <div className="bt">
          {parent && <small>{parent}</small>}
          <b role="heading" aria-level={1}>
            {title}
          </b>
        </div>
        {action}
      </div>
      <div className="sx-scroll" data-sx-scroll>
        <div className="body">{children}</div>
      </div>
      {footer && (
        <div className="foot" data-keyboard-hide data-sx-foot>
          {footer}
        </div>
      )}
    </div>
  );
}

/** Üst çubuğun sağındaki metin eylemi ("Kaydet"). `off` = değişiklik yok. */
export function SxBarAction({ children, off, onClick, disabled, type = "button" }: { children: ReactNode; off?: boolean; onClick?: () => void; disabled?: boolean; type?: "button" | "submit" }) {
  return (
    <button type={type} className={cn("bact", off && "off")} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Altta sabit eylem çubuğu: sol `meta` ("2 değişiklik") + tam genişlik birincil düğme; ya da Vazgeç + eylem. */
export function SxFoot({ meta, children }: { meta?: ReactNode; children: ReactNode }) {
  return (
    <>
      {meta && <span className="meta">{meta}</span>}
      {children}
    </>
  );
}

export function SxLabel({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  return (
    <div className={cn("lab", className)} id={id}>
      {children}
    </div>
  );
}

export function SxCard({ children, className, style, testId }: { children: ReactNode; className?: string; style?: CSSProperties; testId?: string }) {
  return (
    <div className={cn("card", className)} style={style} data-testid={testId}>
      {children}
    </div>
  );
}

export function SxSep() {
  return <div className="sep" />;
}

export function SxGap({ h }: { h: number }) {
  return <div style={{ height: h }} />;
}

export interface SxRowProps {
  /** Sol baştaki görsel (`SxCover`, `SxAvatar`, `SxHash`). */
  lead?: ReactNode;
  title: ReactNode;
  desc?: ReactNode;
  /** Sağdaki kontrol: `SxBtn`, `SxSwitch`, `SxVal`, `SxTag`. */
  trailing?: ReactNode;
  href?: string;
  onClick?: () => void;
  /** Başlığı ve açıklamayı üstten hizala (çok satırlı açıklama). */
  top?: boolean;
  /** Sağda › (alt sayfa). */
  nav?: boolean;
  /** Sağda ✓ (seçili satır). */
  check?: boolean;
  titleClass?: string;
  /** Başlık/açıklamanın altına ek satırlar (etiketler vb.). */
  children?: ReactNode;
  testId?: string;
  disabled?: boolean;
  attrs?: { [data: `data-${string}`]: string | undefined };
}

/** Standart satır: [lead] başlık + soluk açıklama [trailing]. `href` → bağlantı, `onClick` → düğme, ikisi de yoksa düz satır. */
export function SxRow({ lead, title, desc, trailing, href, onClick, top, nav, check, titleClass, children, testId, disabled, attrs }: SxRowProps) {
  const cls = cn("row", top && "top", (nav ?? Boolean(href || onClick)) && "nav", check && "on-ck");
  const body = (
    <>
      {lead}
      <div className="rt">
        <div className={cn("t", titleClass)}>{title}</div>
        {desc && <div className="s">{desc}</div>}
        {children}
      </div>
      {trailing}
    </>
  );
  if (href) {
    return (
      <Link href={href} className={cls} data-testid={testId} {...attrs}>
        {body}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick} disabled={disabled} data-testid={testId} {...attrs}>
        {body}
      </button>
    );
  }
  return (
    <div className={cls} data-testid={testId} {...attrs}>
      {body}
    </div>
  );
}

/** Sütun satırı: başlık, açıklama, altında düğme (tehlikeli bölge ve arşiv kartları). */
export function SxRowCol({ title, desc, children, titleClass, testId }: { title: ReactNode; desc?: ReactNode; children?: ReactNode; titleClass?: string; testId?: string }) {
  return (
    <div className="row col" data-testid={testId}>
      <div className={cn("t", titleClass)}>{title}</div>
      {desc && <div className="s">{desc}</div>}
      {children}
    </div>
  );
}

type BtnTone = "pri" | "dng" | "out" | "sel" | "off";
export function SxBtn({
  tone,
  full,
  sm,
  href,
  className,
  children,
  ...rest
}: { tone?: BtnTone; full?: boolean; sm?: boolean; href?: string; className?: string; children: ReactNode } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className">) {
  const cls = cn("btn", tone, full && "full", sm && "sm", className);
  if (href) {
    return (
      <Link href={href} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" className={cls} {...rest}>
      {children}
    </button>
  );
}

export function SxSwitch({ checked, onChange, label, disabled, attrs }: { checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; attrs?: { [data: `data-${string}`]: string | undefined } }) {
  return <Switch variant="sx" checked={checked} onChange={onChange} label={label} disabled={disabled} {...attrs} />;
}

export function SxVal({ children }: { children: ReactNode }) {
  return <span className="val">{children}</span>;
}

export function SxTag({ children, tone }: { children: ReactNode; tone?: "or" | "ok" | "dg" }) {
  return <span className={cn("tag", tone)}>{children}</span>;
}

export function SxNote({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  return (
    <div className={cn("note", className)} style={style}>
      {children}
    </div>
  );
}

const PALETTE = ["var(--color-primary)", "var(--color-success)", "var(--color-secondary)", "var(--color-warning)", "var(--color-danger)", "var(--color-primary-hover)"];
function hashColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PALETTE[h % PALETTE.length];
}
export function initialsOf(name: string, max = 2): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, max)
    .map((part) => part[0]?.toLocaleUpperCase("tr"))
    .join("");
}

/** Yuvarlak kişi avatarı: görsel varsa görsel, yoksa ada göre sabit renkte baş harfler. */
export function SxAvatar({ name, src, large, color }: { name: string; src?: string | null; large?: boolean; color?: string }) {
  return (
    <span className={cn("av", large && "lg")} style={{ background: color ?? hashColor(name) }} aria-hidden>
      {/* eslint-disable-next-line @next/next/no-img-element -- herkese açık avatar adresi */}
      {src ? <img src={src} alt="" width={large ? 72 : 44} height={large ? 72 : 44} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : initialsOf(name)}
    </span>
  );
}

/** Kare görsel / baş harf kutusu (topluluk, ekip, Space kapağı). `children` verilirse (GroupAvatar vb.) içine çizilir. */
export function SxCover({ name, color, style, children }: { name: string; color?: string; style?: CSSProperties; children?: ReactNode }) {
  return (
    <span className="cov" style={{ background: color ?? hashColor(name), ...style }} aria-hidden>
      {children ?? initialsOf(name)}
    </span>
  );
}

export function SxHash({ children = "#" }: { children?: ReactNode }) {
  return <span className="hash">{children}</span>;
}

/** Etiketli metin alanı (`fld` + `fl` + `inp`). */
export function SxField({
  id,
  label,
  note,
  hint,
  error,
  multiline,
  rows,
  inputProps,
  textareaProps,
  style,
}: {
  id: string;
  label: ReactNode;
  /** Etiketin sağındaki soluk not ("Zorunlu", "İsteğe bağlı"). */
  note?: ReactNode;
  hint?: ReactNode;
  error?: boolean;
  multiline?: boolean;
  rows?: number;
  inputProps?: InputHTMLAttributes<HTMLInputElement>;
  textareaProps?: TextareaHTMLAttributes<HTMLTextAreaElement>;
  style?: CSSProperties;
}) {
  return (
    <div className="fld">
      <label className="fl" htmlFor={id}>
        {label}
        {note && <em>{note}</em>}
      </label>
      {multiline ? <textarea id={id} className="inp" rows={rows} style={style} {...textareaProps} /> : <input id={id} className="inp" {...inputProps} />}
      {hint && <p className={cn("hint", error && "err")}>{hint}</p>}
    </div>
  );
}

/** Altta "Vazgeç" (120 px) + asıl eylem (kalan genişlik) çifti (onay ve seçici sayfaları). */
export function SxFootPair({ cancelLabel, onCancel, children }: { cancelLabel: string; onCancel: () => void; children: ReactNode }) {
  return (
    <>
      <button type="button" className="btn out full" style={{ flex: "0 0 120px" }} onClick={onCancel}>
        {cancelLabel}
      </button>
      {children}
    </>
  );
}

/**
 * Alt sayfa: telefonda tam ekran `SxPage`, md+'da aynı gövde `Modal` içinde (mevcut pencere davranışı korunur). `open` false ise hiçbir şey çizmez.
 * Adres parametresiyle (`sub=`) açılan sayfalar bunu kullanır; geri/kapat `onClose`.
 */
export function SxSub({ open, onClose, ...page }: SxPageProps & { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const phone = useSxPhone();
  if (!open) return null;
  if (phone) return <SxPage {...page} onBack={onClose} backHref={undefined} />;
  const id = `sx-sub-${page.testId ?? "dialog"}`;
  return (
    <Modal onClose={onClose} labelledBy={id}>
      <DialogShell className="sx flex max-h-[85dvh] w-full max-w-md flex-col overflow-hidden" data-testid={page.testId}>
        <div className="bar" style={{ paddingLeft: 16 }}>
          <div className="bt">
            {page.parent && <small>{page.parent}</small>}
            <b id={id} role="heading" aria-level={2}>
              {page.title}
            </b>
          </div>
          {page.action}
          <button type="button" className="close" aria-label={t("common.close")} onClick={onClose} />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="body">{page.children}</div>
        </div>
        {page.footer && <div className="foot">{page.footer}</div>}
      </DialogShell>
    </Modal>
  );
}

export interface SxPickerOption<K extends string> {
  key: K;
  label: string;
  desc?: string;
}

/** Seçici sayfa (mockup C4): açılır liste yerine seçili değeri gösteren tam ekran liste; altta "Seç". */
export function SxPicker<K extends string>(props: SxPickerProps<K>) {
  return props.open ? <SxPickerInner {...props} /> : null;
}

interface SxPickerProps<K extends string> {
  open: boolean;
  onClose: () => void;
  parent?: string;
  title: string;
  intro?: string;
  label?: string;
  options: SxPickerOption<K>[];
  value: K | null;
  onPick: (key: K) => void;
  note?: ReactNode;
  pickLabel: string;
  testId?: string;
}

function SxPickerInner<K extends string>({
  open,
  onClose,
  parent,
  title,
  intro,
  label,
  options,
  value,
  onPick,
  note,
  pickLabel,
  testId,
}: SxPickerProps<K>) {
  const [draft, setDraft] = useState<K | null>(value);
  return (
    <SxSub
      open={open}
      onClose={onClose}
      parent={parent}
      title={title}
      testId={testId}
      footer={
        <SxBtn
          tone="pri"
          full
          onClick={() => {
            if (draft !== null) onPick(draft);
            onClose();
          }}
        >
          {pickLabel}
        </SxBtn>
      }
    >
      {intro && <p className="s" style={{ margin: "8px 20px 0" }}>{intro}</p>}
      {label && <SxLabel>{label}</SxLabel>}
      <SxCard>
        <OptionGroup variant="sx-list" ariaLabel={title} value={draft} onChange={setDraft} options={options.map((o) => ({ key: o.key, label: o.label, description: o.desc }))} />
      </SxCard>
      {note && (
        <>
          <SxGap h={16} />
          <SxNote>{note}</SxNote>
        </>
      )}
    </SxSub>
  );
}

/**
 * Onay sayfası (mockup B6 · D3 · F6): ✕ + başlık, bir cümle, "Silinecekler" listesi, isteğe bağlı ek kart (`extra`), adı yazdırma alanı,
 * altta Vazgeç + kırmızı eylem. Geri alınamaz işlemlerin tek onay yüzeyi; telefonda tam ekran, md+'da pencere (`SxSub`).
 */
export function SxConfirmPage({
  parent,
  title,
  lead,
  listLabel,
  items,
  extra,
  typeLabel,
  typePlaceholder,
  typeValue,
  onTypeChange,
  note,
  cancelLabel,
  confirmLabel,
  confirmTone = "dng",
  disabled,
  busy,
  error,
  onConfirm,
  onClose,
  testId,
}: {
  parent?: string;
  title: string;
  lead: ReactNode;
  listLabel?: string;
  items?: string[];
  extra?: ReactNode;
  typeLabel?: string;
  typePlaceholder?: string;
  typeValue?: string;
  onTypeChange?: (value: string) => void;
  note?: ReactNode;
  cancelLabel: string;
  confirmLabel: string;
  confirmTone?: "dng" | "pri";
  disabled?: boolean;
  busy?: boolean;
  error?: string | null;
  onConfirm: () => void;
  onClose: () => void;
  testId?: string;
}) {
  const { t } = useTranslation();
  const off = disabled || busy;
  return (
    <SxSubClose
      onClose={onClose}
      parent={parent}
      title={title}
      testId={testId}
      footer={
        <SxFootPair cancelLabel={cancelLabel} onCancel={onClose}>
          <SxBtn tone={confirmTone} full disabled={off} style={disabled ? { opacity: 0.45 } : undefined} onClick={onConfirm}>
            {busy ? t("common.loading") : confirmLabel}
          </SxBtn>
        </SxFootPair>
      }
    >
      <div style={{ padding: "18px 20px 0" }}>
        <p style={{ fontSize: 16, lineHeight: "24px" }}>{lead}</p>
      </div>
      {items && listLabel && (
        <>
          <SxLabel>{listLabel}</SxLabel>
          <SxCard>
            {items.map((item) => (
              <div className="row" key={item}>
                <div className="rt">
                  <div className="t">{item}</div>
                </div>
              </div>
            ))}
          </SxCard>
        </>
      )}
      {extra}
      {typeLabel && (
        <>
          <SxLabel>{t("ay.confirm.label")}</SxLabel>
          <SxCard style={{ paddingTop: 14, paddingBottom: 6 }}>
            <label className="fl" htmlFor="sx-confirm-input">
              {typeLabel}
            </label>
            <input id="sx-confirm-input" className="inp" placeholder={typePlaceholder} value={typeValue ?? ""} onChange={(e) => onTypeChange?.(e.target.value)} autoComplete="off" />
            <p className="hint">{typePlaceholder}</p>
          </SxCard>
        </>
      )}
      {note && (
        <>
          <SxGap h={16} />
          <SxNote>{note}</SxNote>
        </>
      )}
      {error && (
        <>
          <SxGap h={12} />
          <SxNote>
            <span className="dgt">{error}</span>
          </SxNote>
        </>
      )}
    </SxSubClose>
  );
}

/** `SxSub`'ın ✕'li (kapat) hâli: telefonda ✕ başlıklı tam ekran sayfa. */
function SxSubClose({ onClose, ...page }: Omit<SxPageProps, "close" | "onBack"> & { onClose: () => void }) {
  const phone = useSxPhone();
  if (phone) return <SxPage {...page} close onBack={onClose} />;
  return <SxSub open onClose={onClose} {...page} />;
}
