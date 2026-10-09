import type { Dispatch, SetStateAction } from "react";
import type { Fund } from "../../types";
import { readLogoFile } from "./readLogoFile";

// The read finishes after the user may have kept editing, so the logo goes onto the draft as it is then,
// not the copy captured when the file was picked. A read that lands after the sheet closed, or for a different fund, is dropped.
export function readLogoIntoDraft(
  file: File,
  draftId: string | undefined,
  isOpen: () => boolean,
  setDraft: Dispatch<SetStateAction<Partial<Fund>>>
) {
  readLogoFile(file, (logoUrl) => {
    if (!isOpen()) return;
    setDraft((draft) => (draft._id === draftId ? { ...draft, logoUrl } : draft));
  });
}
