import { RedirectTo } from "@/components/layout/redirect-to";
import { DISCOVER_SECTION_HREF } from "@/lib/list-routes";

export default function WorkflowsPage() {
  return <RedirectTo href={DISCOVER_SECTION_HREF.workflows} />;
}
