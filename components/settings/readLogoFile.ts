import { notify } from "../../lib/notifications";

const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];
const MAX_BYTES = 500 * 1024;

// Reads a logo as a data URL after checking its type and size. Reports problems with a toast and calls nothing.
export function readLogoFile(file: File, onLoad: (dataUrl: string) => void) {
  if (!ALLOWED_TYPES.includes(file.type)) {
    notify("Error", "Unsupported image type. Please upload PNG/JPEG/WEBP/GIF (SVG is not allowed).");
    return;
  }
  if (file.size > MAX_BYTES) {
    notify("Error", "File size too large. Please upload an image under 500KB.");
    return;
  }
  const reader = new FileReader();
  reader.onloadend = () => onLoad(reader.result as string);
  reader.readAsDataURL(file);
}
