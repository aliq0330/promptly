import { RedirectTo } from "@/components/layout/redirect-to";
import { DISCOVER_SECTION_HREF } from "@/lib/list-routes";

export default function PromptsPage() {
  return <RedirectTo href={DISCOVER_SECTION_HREF.prompts} />;
}
