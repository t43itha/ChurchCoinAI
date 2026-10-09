import { useEffect, type RefObject } from "react";

// Keeps keyboard focus in a modal walkthrough while it is open. The dialog takes focus on mount so
// screen readers announce its label. Every other child of body is made inert, so the browser's own
// Tab order stays inside the dialog and skips hidden or disabled controls. Children marked
// data-dialog-exempt (the toast host) are left alone. On unmount the inert attributes and focus
// are restored. Nothing is touched when there is no document.
export function useDialogFocus(dialog: RefObject<HTMLElement | null>): void {
  useEffect(() => {
    const root = dialog.current;
    if (!root || typeof document === "undefined") return;

    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // The dialog sits in a portal that is a direct child of body. Only siblings that were not
    // already inert are marked, so their restore leaves earlier state alone.
    let portalRoot: HTMLElement = root;
    while (portalRoot.parentElement && portalRoot.parentElement !== document.body) {
      portalRoot = portalRoot.parentElement;
    }
    const madeInert = Array.from(document.body.children).filter(
      (child) =>
        child !== portalRoot && !child.hasAttribute("inert") && !child.hasAttribute("data-dialog-exempt")
    );
    for (const child of madeInert) child.setAttribute("inert", "");

    root.focus();

    return () => {
      for (const child of madeInert) child.removeAttribute("inert");
      if (opener?.isConnected) opener.focus();
    };
  }, [dialog]);
}
