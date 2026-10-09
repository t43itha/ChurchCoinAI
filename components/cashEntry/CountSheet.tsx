import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import {
  COIN_KEYS,
  NOTE_VALUES,
  countTotal,
  type CashCount,
  type CoinKey,
  type NoteValue,
} from "../../lib/cashCollectionDraft";
import { coinsValueOf, gbp, noteCountOf } from "./format";
import { amtBox, amtInput, amtSymbol, btnLg, btnPrimary, eyebrow } from "../wizard/ui";

interface CountSheetProps {
  label: string;
  where: string;
  initial: CashCount | null;
  onUse: (count: CashCount) => void;
  onCancel: () => void;
}

const emptyCount = (): CashCount => ({ notes: {}, coins: {} });

export default function CountSheet({ label, where, initial, onUse, onCancel }: CountSheetProps) {
  const [count, setCount] = useState<CashCount>(() =>
    initial ? { notes: { ...initial.notes }, coins: { ...initial.coins } } : emptyCount()
  );
  const total = countTotal(count);
  const sheetRef = useRef<HTMLDivElement>(null);

  // Opening the sheet is for counting, so focus goes straight to the first count input.
  useEffect(() => {
    sheetRef.current?.querySelector<HTMLInputElement>("input")?.focus();
  }, []);

  const setNotes = (value: NoteValue, quantity: number) =>
    setCount((current) => ({ ...current, notes: { ...current.notes, [value]: Math.max(0, quantity) } }));
  const setCoins = (key: CoinKey, amount: string) =>
    setCount((current) => ({ ...current, coins: { ...current.coins, [key]: amount } }));

  return (
    <div ref={sheetRef} className="absolute inset-0 z-10 flex items-end bg-ink/45">
      <div className="flex max-h-[91%] w-full flex-col rounded-t-[26px] bg-paper shadow-soft-lg lg:mx-auto lg:mb-6 lg:max-w-md lg:rounded-[26px]">
        <div className="mx-auto mt-2 h-1.5 w-10 shrink-0 rounded-full bg-[#d6d3cd]" />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pb-2 pt-1">
          <div className="min-w-0">
            <div className={eyebrow}>{where}</div>
            <b className="text-lg tracking-tight text-ink">Count the {label} bag</b>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close count"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[11px] text-grey-dark hover:bg-white"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-1.5">
          <div className="overflow-hidden rounded-2xl border border-ledger bg-white">
            <div className="bg-[#fcfbf9] px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid">
              Notes · how many
            </div>
            {NOTE_VALUES.map((value) => {
              const quantity = count.notes[value] ?? 0;
              return (
                <div key={value} className="grid grid-cols-[54px_auto_1fr] items-center gap-2 border-t border-[#f1f0ec] px-3 py-1.5 first:border-t-0">
                  <span className="font-mono text-sm font-bold whitespace-nowrap">£{value}</span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      aria-label={`One fewer £${value} note`}
                      onClick={() => setNotes(value, quantity - 1)}
                      className="h-11 w-11 rounded-[10px] border border-ledger bg-grey-light text-lg font-semibold text-ink"
                    >
                      −
                    </button>
                    <input
                      aria-label={`£${value} notes`}
                      inputMode="numeric"
                      placeholder="0"
                      value={quantity || ""}
                      onChange={(event) => setNotes(value, parseInt(event.target.value, 10) || 0)}
                      className="h-11 w-14 rounded-[10px] border-[1.5px] border-ledger text-center font-mono text-base font-bold outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      aria-label={`One more £${value} note`}
                      onClick={() => setNotes(value, quantity + 1)}
                      className="h-11 w-11 rounded-[10px] border border-ledger bg-grey-light text-lg font-semibold text-ink"
                    >
                      +
                    </button>
                  </div>
                  <span className="text-right font-mono text-[12.5px] whitespace-nowrap text-grey-mid">
                    {gbp((quantity * value) || 0)}
                  </span>
                </div>
              );
            })}

            <div className="bg-[#fcfbf9] px-3 pb-1 pt-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-grey-mid">
              Coins · bagged value
            </div>
            {COIN_KEYS.map((key) => (
              <div key={key} className="grid grid-cols-[54px_minmax(0,1fr)] items-center gap-2 border-t border-[#f1f0ec] px-3 py-1.5">
                <span className="font-mono text-sm font-bold whitespace-nowrap">{key}</span>
                <label className={`${amtBox} h-11 w-full max-w-[140px]`}>
                  <span className={amtSymbol}>£</span>
                  <input
                    aria-label={`${key} coins`}
                    inputMode="decimal"
                    placeholder="0.00"
                    autoComplete="off"
                    value={count.coins[key] ?? ""}
                    onChange={(event) => setCoins(key, event.target.value)}
                    className={amtInput}
                  />
                </label>
              </div>
            ))}
          </div>
        </div>

        <div className="shrink-0 px-4 pb-6 pt-3">
          <div className="mb-2.5 flex items-baseline justify-between px-0.5 text-xs text-grey-mid">
            <span>
              {noteCountOf(count)} notes · {gbp(coinsValueOf(count))} coins
            </span>
            <b className="font-mono text-sm text-ink">{gbp(total)}</b>
          </div>
          {/* An existing count may be cleared to zero; a new one with nothing counted has nothing to use. */}
          <button
            type="button"
            disabled={total === 0 && initial === null}
            onClick={() => onUse(count)}
            className={`${btnPrimary} ${btnLg}`}
          >
            Use {gbp(total)}
          </button>
        </div>
      </div>
    </div>
  );
}
