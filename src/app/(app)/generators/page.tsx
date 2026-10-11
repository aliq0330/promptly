import { GeneratorsHiddenRedirect } from "@/features/generators/generators-hidden-redirect";

/** Generator keşfi gizlendi (CLAUDE.md §9.145); eski liste adresi Promptlar'a yönlenir. */
export default function GeneratorsPage() {
  return <GeneratorsHiddenRedirect to="/prompts" />;
}
