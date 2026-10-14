"use client";

import { LegalDocumentView } from "@/features/legal/legal-document-view";
import { PRIVACY_POLICY } from "@/features/legal/legal-content";

export default function PrivacyPage() {
  return <LegalDocumentView document={PRIVACY_POLICY} />;
}
