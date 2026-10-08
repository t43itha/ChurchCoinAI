import type { ReactNode, Ref } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, X } from "lucide-react";

export interface WizardFrameProps {
  ariaLabel: string;
  title: string;
  onClose: () => void;
  // Omit to show a hidden spacer in place of the Back button.
  onBack?: () => void;
  // `current` is a 0-based segment index. Segments before it are done, it is
  // the current one, and the rest are to do.
  progress?: { total: number; current: number };
  // Left column (lg and up). Omit for a single-column layout.
  rail?: ReactNode;
  // Right column (lg and up). Omit for a single-column layout.
  receipt?: ReactNode;
  // Scrolling region for the step body; callers use it to scroll back to top.
  bodyRef?: Ref<HTMLDivElement>;
  children?: ReactNode;
  // Rendered between the body and the footer, e.g. a save warning.
  notice?: ReactNode;
  footer?: ReactNode;
  // Rendered last inside the main column, covering the header and footer.
  overlay?: ReactNode;
  // Disables every control inside the frame, e.g. while a save is in flight.
  locked?: boolean;
}

// Grid columns follow which side columns are present, so a single-column
// layout is narrower and uses the full width of the panel.
function layoutClasses(hasRail: boolean, hasReceipt: boolean): string {
  if (hasRail && hasReceipt) return "lg:max-w-6xl lg:grid-cols-[230px_minmax(0,1fr)_310px]";
  if (hasRail) return "lg:max-w-4xl lg:grid-cols-[230px_minmax(0,1fr)]";
  if (hasReceipt) return "lg:max-w-4xl lg:grid-cols-[minmax(0,1fr)_310px]";
  return "lg:max-w-2xl lg:grid-cols-[minmax(0,1fr)]";
}

// A full-screen sheet below lg and a centred three-column panel from lg up.
// The portal is skipped when there is no document (static markup in tests),
// so the same tree renders in both places.
export default function WizardFrame({
  ariaLabel,
  title,
  onClose,
  onBack,
  progress,
  rail,
  receipt,
  bodyRef,
  children,
  notice,
  footer,
  overlay,
  locked = false,
}: WizardFrameProps) {
  const panel = (
    <div className="fixed inset-0 z-50 bg-paper lg:flex lg:items-center lg:justify-center lg:bg-ink/45 lg:p-6">
      <fieldset disabled={locked} className="contents">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={ariaLabel}
          className={`flex h-full w-full flex-col bg-paper lg:grid lg:h-[min(820px,100%)] lg:grid-rows-[minmax(0,1fr)] lg:overflow-hidden lg:rounded-3xl lg:border lg:border-ledger lg:shadow-soft-lg ${layoutClasses(Boolean(rail), Boolean(receipt))}`}
        >
          {rail}

          <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
            <header className="flex shrink-0 items-center gap-2 px-3 pt-3 lg:px-6 lg:pt-5">
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  aria-label="Back"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white"
                >
                  <ChevronLeft size={22} aria-hidden="true" />
                </button>
              ) : (
                <span className="h-11 w-11 shrink-0" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1 truncate text-center text-[15px] font-bold text-ink">{title}</div>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </header>

            {progress && (
              <div className="flex shrink-0 gap-1 px-4 pb-1 pt-2.5 lg:px-6" aria-hidden="true">
                {Array.from({ length: progress.total }, (_, index) => {
                  const tone =
                    index < progress.current ? "bg-sage" : index === progress.current ? "bg-ink" : "bg-ledger";
                  return <span key={index} className={`h-1 flex-1 rounded-full ${tone}`} />;
                })}
              </div>
            )}

            <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-4 pb-6 pt-4 lg:px-8">
              {children}
            </div>

            {notice}
            {footer}
            {overlay}
          </div>

          {receipt}
        </div>
      </fieldset>
    </div>
  );
  if (typeof document === "undefined") return panel;
  return createPortal(panel, document.body);
}
