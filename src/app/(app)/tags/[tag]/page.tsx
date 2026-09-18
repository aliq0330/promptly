import { Tag } from "lucide-react";
import { PlaceholderPage } from "@/components/ui/placeholder-page";

export function generateStaticParams() {
  return [{ tag: "ai" }];
}

export default function TagDetailPage() {
  return (
    <PlaceholderPage
      icon={Tag}
      title="Etiket"
      description="Bu etikete sahip promptlar bir sonraki modülde burada listelenecek."
    />
  );
}
