import React, { useState } from "react";
import { useAction, useConvex } from "convex/react";
import {
  AlertTriangle,
  Database,
  Download,
  Loader2,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { api } from "../convex/_generated/api";
import { ORGANIZATION_DATA_TABLES } from "../lib/organizationData";
import { notify } from "../lib/notifications";

type DataPrivacySettingsProps = {
  organizationName: string;
};

const safeFilenamePart = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "organization";

const DataPrivacySettings: React.FC<DataPrivacySettingsProps> = ({
  organizationName,
}) => {
  const convex = useConvex();
  const deleteOrganization = useAction(
    api.actions.organizations.deleteOrganization
  );
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
          const result = (await convex.query(
            api.queries.organizations.exportDataPage,
            {
              table,
              paginationOpts: { cursor, numItems: 100 },
            }
          )) as {
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

  return (
    <div className="max-w-4xl space-y-5">
      <div className="swiss-card-static overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-[18px] border-b border-grey-light bg-[#fcfbf9]">
          <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-white border border-ledger text-grey-dark">
            <Database size={16} strokeWidth={1.9} />
          </span>
          <div>
            <h3 className="text-[13.5px] font-bold text-ink uppercase tracking-[0.02em]">
              Organization data export
            </h3>
            <p className="text-[11.5px] text-grey-mid mt-0.5">
              Download all financial, donor, user, and configuration records.
            </p>
          </div>
        </div>
        <div className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5">
            <div className="max-w-xl">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink">
                <ShieldCheck size={16} className="text-sage" />
                Portable JSON with credentials removed
              </div>
              <p className="text-xs text-grey-mid leading-relaxed mt-2">
                The export is assembled in paginated batches and excludes invite
                tokens, bank access tokens, provider identifiers, and Stripe IDs.
              </p>
            </div>
            <button
              type="button"
              onClick={handleExport}
              disabled={isExporting || isDeleting}
              className="btn-primary inline-flex items-center justify-center gap-2 px-4 py-2.5 text-xs font-bold uppercase tracking-[0.04em] whitespace-nowrap disabled:opacity-50"
            >
              {isExporting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Download size={15} />
              )}
              {isExporting ? "Preparing export…" : "Download export"}
            </button>
          </div>
        </div>
      </div>

      <div className="border border-error/35 bg-white rounded-xl overflow-hidden shadow-soft-sm">
        <div className="flex items-center gap-3 px-6 py-[18px] border-b border-error/20 bg-[#fff9f8]">
          <span className="inline-flex items-center justify-center w-[34px] h-[34px] rounded-[9px] bg-white border border-error/25 text-error">
            <Trash2 size={16} strokeWidth={1.9} />
          </span>
          <div>
            <h3 className="text-[13.5px] font-bold text-error uppercase tracking-[0.02em]">
              Delete organization
            </h3>
            <p className="text-[11.5px] text-grey-mid mt-0.5">
              Permanently erase this tenant and revoke connected services.
            </p>
          </div>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-3 rounded-[10px] border border-[#ecd8bd] bg-[#fcf7f0] p-4 text-xs leading-relaxed text-[#7a5a30]">
            <AlertTriangle size={18} className="shrink-0 mt-0.5" />
            <p>
              UK charities generally need to retain accounting and Gift Aid
              records for at least six years. Export first and confirm your
              trustees have retained every copy required by law or policy.
            </p>
          </div>

          <div>
            <label className="block text-[10.5px] font-bold text-grey-mid uppercase tracking-[0.08em] mb-1.5">
              Type {organizationName} to confirm
            </label>
            <input
              type="text"
              value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)}
              disabled={isDeleting}
              autoComplete="off"
              className="w-full max-w-md p-3 bg-white border border-ledger rounded-[10px] text-sm text-ink focus:ring-1 focus:ring-error outline-none disabled:opacity-60"
            />
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-xs text-grey-mid max-w-xl leading-relaxed">
              This revokes Yapily and Plaid access, deletes the Stripe
              customer, removes AI memory, and erases all organization records.
              Your personal sign-in remains available for joining another church.
            </p>
            <button
              type="button"
              onClick={handleDelete}
              disabled={
                isDeleting ||
                isExporting ||
                confirmation.trim() !== organizationName.trim()
              }
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-[9px] bg-error text-white text-xs font-bold uppercase tracking-[0.04em] hover:opacity-90 disabled:opacity-40 whitespace-nowrap"
            >
              {isDeleting ? (
                <Loader2 size={15} className="animate-spin" />
              ) : (
                <Trash2 size={15} />
              )}
              {isDeleting ? "Deleting…" : "Delete permanently"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataPrivacySettings;
