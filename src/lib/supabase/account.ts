import { supabase } from "./client";
import { translateForRuntime } from "@/lib/i18n/translations";

/** Error codes the `delete-account` Edge Function answers with. */
const ERROR_MESSAGE_KEYS = {
  confirmation_mismatch: "settings.deleteAccountMismatch",
  moderator_account: "settings.deleteAccountModerator",
} as const;

/**
 * Permanently deletes the SIGNED-IN user's own account through the
 * `delete-account` Edge Function (supabase/functions/delete-account). The call
 * carries only the typed username — the function takes the account to delete from
 * the verified JWT, so this can never name another user. The username is checked
 * again on the server.
 *
 * Resolves only when the account is really gone; on ANY failure it throws and the
 * session is left untouched, so the caller shows the error and the user stays
 * signed in (the deletion is one database transaction: it either happened or not).
 */
export async function deleteOwnAccount(confirmUsername: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke("delete-account", { body: { confirmUsername } });
  if (error) {
    let code: string | undefined;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      try {
        code = ((await context.clone().json()) as { error?: string }).error;
      } catch {
        // not JSON — fall through to the generic message
      }
    }
    const key = code && code in ERROR_MESSAGE_KEYS ? ERROR_MESSAGE_KEYS[code as keyof typeof ERROR_MESSAGE_KEYS] : "settings.deleteAccountFailed";
    throw new Error(translateForRuntime(key));
  }
  if (!(data as { ok?: boolean } | null)?.ok) throw new Error(translateForRuntime("settings.deleteAccountFailed"));
}
