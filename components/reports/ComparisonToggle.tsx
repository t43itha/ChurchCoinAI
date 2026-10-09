import React from "react";

export interface ComparisonToggleOption {
  id: string;
  label: string;
}

export interface ComparisonToggleProps {
  options: ComparisonToggleOption[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

export const ComparisonToggle: React.FC<ComparisonToggleProps> = ({ options, value, onChange, ariaLabel }) => (
  <div role="group" aria-label={ariaLabel} className="inline-flex rounded-md border border-ledger bg-grey-light p-0.5">
    {options.map((option) => {
      const active = option.id === value;
      return (
        <button
          key={option.id}
          type="button"
          aria-pressed={active}
          onClick={() => onChange(option.id)}
          className={`rounded px-2.5 py-1 text-xs font-semibold transition-colors ${
            active ? "bg-white text-ink shadow-soft" : "text-grey-mid hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      );
    })}
  </div>
);
