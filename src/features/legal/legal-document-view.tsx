"use client";

import { Fragment } from "react";
import { PageContainer } from "@/components/ui/page-header";
import { usePageTitle } from "@/components/layout/page-title";
import { useTranslation } from "@/lib/i18n/language-provider";
import { LEGAL_CONTACT_EMAIL, type LegalDocument } from "./legal-content";

/** A static legal page (Privacy Policy / Terms of Use) in the visitor's language. Public: no login needed. */
export function LegalDocumentView({ document }: { document: LegalDocument }) {
  const { t, language } = useTranslation();
  usePageTitle(document.title[language]);

  return (
    <PageContainer className="mx-auto max-w-3xl space-y-8">
      <header className="space-y-3">
        <h1 className="font-serif text-h1 text-text">{document.title[language]}</h1>
        <p className="text-caption text-text-muted">{document.updated[language]}</p>
        <p className="text-body text-text-secondary">{document.intro[language]}</p>
      </header>

      {document.sections.map((section, index) => (
        <section key={index} className="space-y-3">
          <h2 className="text-h3 text-text">{section.title[language]}</h2>
          {section.blocks.map((block, blockIndex) => (
            <Fragment key={blockIndex}>
              {block.type === "p" ? (
                <p className="break-words text-body leading-relaxed text-text-secondary">{block.text[language]}</p>
              ) : (
                <ul className="list-disc space-y-2 pl-5 text-body leading-relaxed text-text-secondary marker:text-text-muted">
                  {block.items[language].map((item, itemIndex) => (
                    <li key={itemIndex} className="break-words">
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </Fragment>
          ))}
        </section>
      ))}

      <section className="space-y-2 border-t border-border-soft pt-6">
        <h2 className="text-h3 text-text">{t("legal.contactTitle")}</h2>
        <p className="text-body text-text-secondary">
          {t("legal.contactBody")}{" "}
          <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="font-medium text-primary underline underline-offset-2 hover:no-underline">
            {LEGAL_CONTACT_EMAIL}
          </a>
        </p>
      </section>
    </PageContainer>
  );
}
