import type { ProjectPerson } from "@/lib/supabase/team-projects";
import type { ProjectRole } from "@/lib/team-projects";
import type { BoardPageInfo } from "@/lib/team-board";

/**
 * Ekip panosu yapılandırması (docs/history/367-*): `SpaceBoard` bunu aldığında ekip kipine geçer (yüzen araç çubukları, pano grubu, yorumlar, Paylaş).
 * Kişisel Space panosu bu prop'u vermez ve eskisi gibi çalışır.
 */
export interface TeamBoardConfig {
  teamId: string;
  teamName: string;
  projectId: string;
  projectTitle: string;
  fileId: string | null;
  fileTitle: string | null;
  role: ProjectRole | null;
  /** Açık panonun GRUBUNUN sayfaları (bağımsız pano tek sayfadır). */
  pages: BoardPageInfo[];
  currentId: string;
  mainTitle: string;
  /** Açık panonun grubu (docs/history/368-*); bağımsız panoda `null`. */
  groupId: string | null;
  groupTitle: string | null;
  people: ProjectPerson[];
  archived: boolean;
  accessMode: "selected" | "all";
  /** Ekibe kullanıcı adıyla davet (ekip yöneticisi) ve proje rollerini düzenleme (lider) — pencereleri sayfa açar. */
  canInvite: boolean;
  onInvite: () => void;
  canEditAccess: boolean;
  onEditAccess: () => void;
  /** Proje bilgi penceresi (kişiler, değişkenler). */
  onInfo: () => void;
  /** Bildirimden gelen yorum kimliği (`?comment=`): açılışta panel açılır ve yer gösterilir. */
  openComment: string | null;
  /** Yol çubuğunun geri bağlantısı. */
  backHref: string;
  hrefOf: (areaId: string) => string;
  navigate: (href: string, mode?: "push" | "replace") => void;
  /** Proje ayrıntısını yeniden okutur (pano sayısı/adı/sırası değişince). */
  reload: () => void;
}
