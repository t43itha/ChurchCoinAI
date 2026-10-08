// Class strings for the walkthrough, translated from the Refined Ledger design
// in docs/plans/cash-recording-walkthrough.html. Heights are set per size so
// variants never fight over the same utility.
export const btnBase =
  "flex w-full items-center justify-center gap-2 rounded-2xl font-bold transition-transform active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-35";
export const btnLg = "h-[54px] text-base";
export const btnMd = "h-[46px] text-sm";
export const btnPrimary = `${btnBase} bg-ink text-white shadow-[0_8px_18px_-10px_rgba(28,25,23,0.6)] hover:bg-charcoal`;
export const btnSage = `${btnBase} bg-sage text-white`;
export const btnOutline = `${btnBase} border border-ledger bg-white text-ink`;
export const btnGhost =
  "flex h-11 w-full items-center justify-center rounded-2xl text-sm font-semibold text-grey-dark disabled:opacity-35";
export const btnDashed =
  "flex h-12 w-full items-center justify-center gap-2 rounded-2xl border-[1.5px] border-dashed border-[#d6d3cd] text-sm font-semibold text-grey-dark hover:bg-white";

export const linkBtn = "inline-flex min-h-11 items-center text-sm font-bold text-sage";
export const linkBtnSm = "inline-flex min-h-11 items-center text-xs font-bold text-sage";

export const chip =
  "inline-flex h-11 items-center gap-1.5 rounded-[13px] border-[1.5px] border-ledger bg-white px-4 text-sm font-semibold text-grey-dark";
export const chipDashed = `${chip} border-dashed text-grey-mid`;

export const txtInput =
  "h-12 w-full min-w-0 rounded-[13px] border-[1.5px] border-ledger bg-white px-3.5 text-base text-ink outline-none focus:border-ink";
export const txtArea =
  "min-h-[84px] w-full min-w-0 rounded-[13px] border-[1.5px] border-ledger bg-white px-3.5 py-3 text-base text-ink outline-none focus:border-ink";
export const amtBox =
  "flex h-12 min-w-0 items-center rounded-xl border-[1.5px] border-ledger bg-paper px-3 focus-within:border-ink focus-within:bg-white";
// styles.css sets a global `input:focus` box-shadow and border colour, unlayered,
// so it beats normal utilities; the important modifiers keep the wrapper as the only box.
export const amtInput =
  "min-w-0 w-full appearance-none border-0 bg-transparent p-0 font-mono text-[18px] font-bold text-ink !shadow-none outline-none focus:ring-0 focus:outline-none placeholder:text-[#d0ccc5]";
export const amtSymbol = "mr-1 font-mono text-base text-grey-mid";

export const card = "rounded-2xl border border-ledger bg-white p-3.5";
export const eyebrow = "text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid";
export const fieldLabel = `${eyebrow} mb-2 mt-5 block`;
export const screenTitle = "text-[23px] font-bold leading-tight tracking-tight text-ink";
export const screenHelp = "mb-4 mt-1.5 text-[13.5px] text-grey-mid";

export const tagBase =
  "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-[3px] text-[11px] font-bold uppercase tracking-wide";
export const tagGrey = `${tagBase} border border-ledger bg-grey-light text-grey-dark`;
export const tagAmber = `${tagBase} bg-amber-light text-amber`;
export const tagSage = `${tagBase} bg-sage-light text-sage`;

export const giftAidOn = "whitespace-nowrap rounded-full bg-sage-light px-2 py-0.5 text-[11px] font-bold text-sage";
export const giftAidOff = "whitespace-nowrap rounded-full bg-amber-light px-2 py-0.5 text-[11px] font-bold text-amber";
export const giftAidNone = "whitespace-nowrap rounded-full bg-grey-light px-2 py-0.5 text-[11px] font-bold text-grey-mid";

export const receipt =
  "relative rounded-[18px] border border-ledger bg-white px-4 pb-1.5 pt-3.5 shadow-soft-md after:absolute after:-bottom-[7px] after:left-3 after:right-3 after:h-[7px] after:bg-[radial-gradient(circle_at_6px_0,transparent_5px,#fff_5.5px)] after:bg-[length:12px_7px] after:bg-repeat-x after:content-['']";

export const darkCard = "relative overflow-hidden rounded-[20px] bg-ink p-4 text-white";

interface SegmentedProps<T extends string> {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}

export function Segmented<T extends string>({ options, value, onChange, label }: SegmentedProps<T>) {
  return (
    <div
      role="group"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
      className="grid rounded-xl bg-[#efeee9] p-[3px]"
    >
      {options.map((option) => {
        const on = option === value;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(option)}
            className={`h-11 rounded-[9px] text-sm font-semibold transition-colors ${
              on ? "bg-white text-ink shadow-[0_1px_3px_rgba(0,0,0,0.08)]" : "text-grey-mid"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}
