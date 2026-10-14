import { Fragment } from "react";
import Link from "next/link";
import { splitMentions } from "@/lib/mentions";
import { profileHref } from "@/lib/utils";

/**
 * Plain text where each `@username` is a link to that profile (comments, a request's creative
 * direction). Whether the person exists is not checked here — the profile page says "not
 * found" itself — so an unknown name is just a link to that page.
 */
export function MentionText({ text }: { text: string }) {
  return (
    <>
      {splitMentions(text).map((segment, index) =>
        segment.username ? (
          <Link key={index} href={profileHref({ username: segment.username })} className="font-medium text-primary hover:underline">
            {segment.text}
          </Link>
        ) : (
          <Fragment key={index}>{segment.text}</Fragment>
        ),
      )}
    </>
  );
}
