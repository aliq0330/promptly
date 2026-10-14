"use client";

import { LegalDocumentView } from "@/features/legal/legal-document-view";
import { TERMS_OF_USE } from "@/features/legal/legal-content";

export default function TermsPage() {
  return <LegalDocumentView document={TERMS_OF_USE} />;
}
