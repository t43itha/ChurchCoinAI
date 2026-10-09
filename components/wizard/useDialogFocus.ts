import { useEffect, type RefObject } from "react";

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

// Where Tab goes inside a dialog with `count` focusable controls. `current` is the index of the
// focused control, or -1 when focus is on the dialog itself. Returns the index to focus next.
export function nextFocusIndex(count: number, current: number, shift: boolean): number {
  if (count === 0) return -1;
  if (shift) return current <= 0 ? count - 1 : current - 1;
  return current < 0 || current >= count - 1 ? 0 : current + 1;
}

// Enabled controls in document order. Controls inside a disabled fieldset report :disabled too.
function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) => !element.matches(":disabled"));
}

// Keeps keyboard focus inside a modal walkthrough while it is open. Focus moves in on mount,
// Tab cycles within the dialog, every other child of body is made inert, and on unmount the
// inert attributes and focus are restored. Nothing is touched when there is no document.
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
      (child) => child !== portalRoot && !child.hasAttribute("inert")
    );
    for (const child of madeInert) child.setAttribute("inert", "");

    (focusables(root)[0] ?? root).focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = focusables(root);
      event.preventDefault();
      if (items.length === 0) {
        root.focus();
        return;
      }
      const current = items.indexOf(document.activeElement as HTMLElement);
      items[nextFocusIndex(items.length, current, event.shiftKey)]?.focus();
    };
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      for (const child of madeInert) child.removeAttribute("inert");
      if (opener?.isConnected) opener.focus();
    };
  }, [dialog]);
}
