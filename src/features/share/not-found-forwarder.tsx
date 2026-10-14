"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { buttonClassName } from "@/components/ui/button";
import { absoluteUrl } from "@/lib/utils";
import { detailHrefFor, parseSharePath } from "@/lib/share-link";
import { useTranslation } from "@/lib/i18n/language-provider";

const subscribeNever = () => () => {};

/**
 * The site's 404 page. GitHub Pages serves it for any path that has no file,
 * which includes a share link (`/share/<kind>/<key>/`) copied for content that
 * was published after the last build and so has no static share page yet. Such
 * a link is forwarded to the real detail page instead of dead-ending; every
 * other unknown path just gets the "not found" message.
 */
export function NotFoundForwarder() {
  const { t } = useTranslation();
  // Derived from the real address bar (the server render has no pathname, so it starts "not forwarding").
  const sharedKey = useSyncExternalStore(
    subscribeNever,
    () => {
      const shared = parseSharePath(window.location.pathname);
      return shared ? detailHrefFor(shared.kind, shared.key) : "";
    },
    () => "",
  );
  const forwarding = sharedKey !== "";

  useEffect(() => {
    if (sharedKey) window.location.replace(absoluteUrl(sharedKey));
  }, [sharedKey]);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      {forwarding ? (
        <p className="text-small text-text-muted" role="status">
          {t("share.pageOpening")}
        </p>
      ) : (
        <>
          <h1 className="text-h2 text-text">{t("common.notFound")}</h1>
          <p className="text-small text-text-muted">{t("notFound.description")}</p>
          <Link href="/" className={buttonClassName({ size: "md" })}>
            {t("nav.home")}
          </Link>
        </>
      )}
    </main>
  );
}
