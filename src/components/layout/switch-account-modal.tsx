"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Modal } from "@/components/ui/modal";
import { fetchDemoAccounts, switchToDemoAccount } from "@/lib/supabase/account-switch";
import { useTranslation } from "@/lib/i18n/language-provider";
import type { UserProfile } from "@/types";

/** Site sahibi için demo hesap seçici: bir satıra dokunmak o hesaba anında geçirir (yetki sunucudadır). */
export function SwitchAccountModal({ currentUserId, onClose }: { currentUserId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<UserProfile[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchDemoAccounts()
      .then((list) => !cancelled && setAccounts(list))
      .catch(() => !cancelled && setAccounts([]));
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSwitch(id: string) {
    setBusyId(id);
    setError(null);
    try {
      await switchToDemoAccount(id);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("accountSwitch.error"));
      setBusyId(null);
    }
  }

  return (
    <Modal onClose={onClose} labelledBy="switch-account-title">
      <div className="flex max-h-[80vh] w-full max-w-sm flex-col rounded-lg border border-border-soft bg-surface">
        <div className="flex items-start justify-between gap-3 border-b border-border-soft p-4">
          <div>
            <h2 id="switch-account-title" className="text-h3 font-semibold text-text">{t("accountSwitch.title")}</h2>
            <p className="text-caption text-text-muted">{t("accountSwitch.help")}</p>
          </div>
          <button type="button" onClick={onClose} aria-label={t("common.close")} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-text-secondary hover:bg-surface-soft">
            <X size={18} aria-hidden />
          </button>
        </div>
        <div className="overflow-y-auto p-1.5">
          {accounts === null && <p className="p-4 text-small text-text-muted">{t("accountSwitch.loading")}</p>}
          {accounts?.length === 0 && <p className="p-4 text-small text-text-muted">{t("accountSwitch.empty")}</p>}
          <ul>
            {accounts?.map((account) => {
              const isCurrent = account.id === currentUserId;
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => handleSwitch(account.id)}
                    disabled={busyId !== null || isCurrent}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2.5 text-left transition-colors duration-200 hover:bg-surface-soft disabled:opacity-60"
                  >
                    <Avatar src={account.avatarUrl} alt={account.displayName} size={32} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-small font-medium text-text">{account.displayName}</span>
                      <span className="block truncate text-caption text-text-muted">@{account.username}</span>
                    </span>
                    {isCurrent && <span className="text-caption text-primary">{t("accountSwitch.current")}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        {error && <p role="alert" className="border-t border-border-soft p-3 text-small text-danger">{error}</p>}
      </div>
    </Modal>
  );
}
