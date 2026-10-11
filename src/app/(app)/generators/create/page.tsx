import { GeneratorsHiddenRedirect } from "@/features/generators/generators-hidden-redirect";

/** Generator oluşturma gizlendi (CLAUDE.md §9.145); eski adres Oluştur ekranına yönlenir. */
export default function GeneratorCreatePage() {
  return <GeneratorsHiddenRedirect to="/create" />;
}
