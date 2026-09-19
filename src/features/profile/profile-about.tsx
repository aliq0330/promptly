import { Calendar, Globe } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { UserProfile } from "@/types";

function formatJoinDate(isoDate: string): string {
  return new Date(isoDate).toLocaleDateString("tr-TR", { year: "numeric", month: "long" });
}

/**
 * Only ever renders fields the user actually has (CLAUDE.md section 8:
 * "yalnızca mevcut ve kullanıcı tarafından paylaşılmış bilgileri göster").
 * There's no social-links array, location, or AI-tool list in the data
 * model — those aren't invented here; only bio/website/interests/join date
 * exist for real.
 */
export function ProfileAbout({ user }: { user: UserProfile }) {
  const hasAnything = user.bio || user.website || (user.interests && user.interests.length > 0);

  return (
    <div className="space-y-5 px-4 py-5 lg:px-6">
      {user.bio && <p className="whitespace-pre-wrap text-sm text-text">{user.bio}</p>}

      <div className="space-y-2 text-sm text-text-muted">
        {user.website && (
          <a
            href={user.website.startsWith("http") ? user.website : `https://${user.website}`}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-2 text-primary hover:underline"
          >
            <Globe size={15} className="shrink-0" />
            {user.website}
          </a>
        )}
        <p className="flex items-center gap-2">
          <Calendar size={15} className="shrink-0" />
          {formatJoinDate(user.createdAt)} tarihinde katıldı
        </p>
      </div>

      {user.interests && user.interests.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
            Yaratıcı İlgi Alanları
          </p>
          <div className="flex flex-wrap gap-1.5">
            {user.interests.map((interest) => (
              <Badge key={interest}>{interest}</Badge>
            ))}
          </div>
        </div>
      )}

      {!hasAnything && (
        <p className="py-6 text-center text-sm text-text-muted">
          Bu kullanıcı henüz profiline ek bilgi eklemedi.
        </p>
      )}
    </div>
  );
}
