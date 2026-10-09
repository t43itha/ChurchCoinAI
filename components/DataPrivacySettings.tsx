import { useState, type FC } from "react";
import { useAction, useConvex } from "convex/react";
import { AlertTriangle, Download, Loader2, ShieldCheck, Trash2 } from "lucide-react";
import { api } from "../convex/_generated/api";
import { ORGANIZATION_DATA_TABLES } from "../lib/organizationData";
import { notify } from "../lib/notifications";
import WizardFrame from "./wizard/WizardFrame";
import { btnBase, btnLg, btnOutline, card, fieldLabel, screenHelp, screenTitle, txtInput } from "./wizard/ui";

type DataPrivacySettingsProps = {
  organizationName: string;
  onClose: () => void;
};

const safeFilenamePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "organization";

// Export everything, or permanently delete the organisation. Deletion needs the church name typed back.
const DataPrivacySettings: FC<DataPrivacySettingsProps> = ({ organizationName, onClose }) => {
  const convex = useConvex();
  const deleteOrganization = useAction(api.actions.organizations.deleteOrganization);
  const [isExporting, setIsExporting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState("");

  const handleExport = async () => {
    setIsExporting(true);
    try {
      const tables: Record<string, unknown[]> = {};

      for (const table of ORGANIZATION_DATA_TABLES) {
        const records: unknown[] = [];
        let cursor: string | null = null;
        let isDone = false;

        while (!isDone) {
          const result = (await convex.query(api.queries.organizations.exportDataPage, {
            table,
            paginationOpts: { cursor, numItems: 100 },
          })) as {
            page: unknown[];
            isDone: boolean;
            continueCursor: string;
          };

          records.push(...result.page);
          isDone = result.isDone;
          cursor = result.continueCursor || null;
        }

        tables[table] = records;
      }

      const exportedAt = new Date();
      const document = {
        format: "churchcoin-organization-export",
        formatVersion: 1,
        exportedAt: exportedAt.toISOString(),
        organizationName,
        tables,
      };
      const blob = new Blob([JSON.stringify(document, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement("a");
      link.href = url;
      link.download = `${safeFilenamePart(organizationName)}-churchcoin-export-${exportedAt
        .toISOString()
        .slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      notify(
        "Export ready",
        "A complete, credential-redacted organization export has been downloaded."
      );
    } catch (error: any) {
      console.error("Organization export failed:", error);
      notify("Export failed", error?.message || "Could not export organization data.");
    } finally {
      setIsExporting(false);
    }
  };

  const handleDelete = async () => {
    if (confirmation.trim() !== organizationName.trim()) return;
    const confirmed = window.confirm(
      `Permanently delete ${organizationName}, revoke bank access, and cancel its billing? This cannot be undone.`
    );
    if (!confirmed) return;

    setIsDeleting(true);
    try {
      await deleteOrganization({ confirmation });
      notify(
        "Organization deleted",
        "Organization data, bank access, and billing records have been removed."
      );
      window.location.assign("/");
    } catch (error: any) {
      console.error("Organization deletion failed:", error);
      notify(
        "Deletion failed",
        error?.message ||
          "No local data was removed. Check provider configuration and try again."
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const busy = isExporting || isDeleting;

  return (
    <WizardFrame ariaLabel="Data and privacy" title="Data and privacy" onClose={onClose}>
      <h2 className={screenTitle}>Data and privacy</h2>
      <p className={screenHelp}>Your church's records belong to you. Export them any time.</p>

      <section className={card}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-light text-sage">
            <ShieldCheck size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-ink">Download a copy</h3>
            <p className="mt-1 text-xs leading-relaxed text-grey-mid">
              Every financial, donor, people and settings record as portable JSON. Invite tokens, bank access
              tokens, provider identifiers and Stripe IDs are left out.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleExport}
          disabled={busy}
          className={`${btnOutline} ${btnLg} mt-4`}
        >
          {isExporting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Download size={15} aria-hidden="true" />}
          {isExporting ? "Preparing export…" : "Download export"}
        </button>
      </section>

      <section className="mt-5 rounded-2xl border border-error/35 bg-white p-3.5">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-error-light text-error">
            <Trash2 size={17} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-error">Delete this church</h3>
            <p className="mt-1 text-xs leading-relaxed text-grey-mid">
              Erases every record for this church and disconnects its bank and billing. Your personal sign-in stays, so you
              can join another church.
            </p>
          </div>
        </div>

        <div className="mt-3.5 flex gap-3 rounded-2xl border border-[#ecd8bd] bg-[#fcf7f0] p-3.5 text-xs leading-relaxed text-[#7a5a30]">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
          <p>
            UK charities generally keep accounting and Gift Aid records for at least six years. Export first and check your
            trustees have every copy they need.
          </p>
        </div>

        <label htmlFor="delete-confirm" className={fieldLabel}>
          Type {organizationName} to confirm
        </label>
        <input
          id="delete-confirm"
          type="text"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          disabled={isDeleting}
          autoComplete="off"
          className={txtInput}
        />
        <p className="mt-3 text-xs leading-relaxed text-grey-mid">
          Revokes Yapily and Plaid access, deletes the Stripe customer and AI memory.
        </p>
        <button
          type="button"
          onClick={handleDelete}
          disabled={busy || confirmation.trim() !== organizationName.trim()}
          className={`${btnBase} ${btnLg} mt-4 bg-error text-white`}
        >
          {isDeleting ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : <Trash2 size={15} aria-hidden="true" />}
          {isDeleting ? "Deleting…" : "Delete permanently"}
        </button>
      </section>
    </WizardFrame>
  );
};

export default DataPrivacySettings;
