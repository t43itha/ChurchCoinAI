import type { Dispatch, SetStateAction } from "react";
import type { Fund } from "../../types";
import { readLogoFile } from "./readLogoFile";

// One reader per open sheet. Each pick takes the next sequence number, and only the newest pick may land, so an
// earlier file that finishes last can't replace the logo the user picked after it. A read that lands after the sheet
// closed, or for a different fund, is dropped too. The logo goes onto the draft as it is when the read lands,
// not the copy captured when the file was picked.
export function createLogoDraftReader(setDraft: Dispatch<SetStateAction<Partial<Fund>>>, isOpen: () => boolean) {
  let latestPick = 0;
  return (file: File, draftId: string | undefined) => {
    const pick = ++latestPick;
    readLogoFile(file, (logoUrl) => {
      if (pick !== latestPick || !isOpen()) return;
      setDraft((draft) => (draft._id === draftId ? { ...draft, logoUrl } : draft));
    });
  };
}
