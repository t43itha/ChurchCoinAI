import type { InputHTMLAttributes } from "react";
import { CalendarDays } from "lucide-react";

type DateInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "className"> & {
  className?: string;
};

// Padding belongs to the wrapper: iOS can add native date-control sizing to
// an input's declared width. The icon is ours because iOS does not supply one.
export default function DateInput({ className = "", ...props }: DateInputProps) {
  return (
    <label className={`cash-date-field ${className}`}>
      <input {...props} type="date" className="cash-date-input" />
      <CalendarDays size={18} className="pointer-events-none shrink-0" aria-hidden="true" />
    </label>
  );
}
