import { RedirectTo } from "@/components/layout/redirect-to";
import { SKILLS_LIST_HREF } from "@/lib/skills/flag";

/** Eski `/skills` adresi: Skill listesi artık Keşfet'in bir bölümüdür (docs/history/419-*). */
export default function SkillsPage() {
  return <RedirectTo href={SKILLS_LIST_HREF} />;
}
