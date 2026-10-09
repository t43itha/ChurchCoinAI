import React, { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";

export interface ExportActions {
  onPdf: () => void;
  onExcel: () => void;
  busy: boolean;
}

// One Export menu for PDF and Excel. Closes on outside click or Escape.
export const ExportMenu: React.FC<{ actions: ExportActions }> = ({ actions }) => {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (action: () => void) => {
    setOpen(false);
    action();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={actions.busy}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-ledger bg-white px-3.5 text-sm font-bold text-ink transition-colors hover:bg-grey-light disabled:opacity-60"
      >
        {actions.busy ? "Exporting…" : "Export"}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1.5 min-w-[140px] overflow-hidden rounded-xl border border-ledger bg-white py-1 shadow-soft-md"
        >
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(actions.onPdf)}
            className="block w-full px-3.5 py-2 text-left text-sm text-ink hover:bg-grey-light"
          >
            PDF
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => choose(actions.onExcel)}
            className="block w-full px-3.5 py-2 text-left text-sm text-ink hover:bg-grey-light"
          >
            Excel
          </button>
        </div>
      )}
    </div>
  );
};
