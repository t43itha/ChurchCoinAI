import { toPence } from "../../lib/reconciliation";
import type { Fund } from "../../types";
import { gbp } from "../cashEntry/format";
import { ReceiptCard, ReceiptRow } from "../wizard/Receipt";
import { eyebrow } from "../wizard/ui";
import { balanceAfterPence } from "./transferSteps";

interface TransferReceiptProps {
  from?: Fund;
  to?: Fund;
  // Null until a valid amount is typed.
  amountPence: number | null;
}

const pounds = (pence: number) => gbp(pence / 100);

// A fund's balance before the move and after it. `changePence` is signed: negative leaves the fund.
function BalanceLines({ fund, changePence }: { fund?: Fund; changePence: number | null }) {
  const before = fund ? toPence(fund.balance) : null;
  const after = fund && changePence !== null ? balanceAfterPence(fund.balance, changePence) : null;
  return (
    <>
      <ReceiptRow sub label="Before" value={before === null ? "—" : pounds(before)} dim={before === null} />
      <ReceiptRow
        sub
        label="After"
        value={after === null ? "—" : <span className={after < 0 ? "text-error" : undefined}>{pounds(after)}</span>}
        dim={after === null}
      />
    </>
  );
}

// The two funds and what the move does to each, worked live as the form is filled in.
export default function TransferReceipt({ from, to, amountPence }: TransferReceiptProps) {
  return (
    <aside className="hidden min-h-0 flex-col overflow-y-auto border-l border-ledger bg-white p-5 lg:flex">
      <div className={`${eyebrow} mb-2.5`}>The move</div>
      <ReceiptCard className="shadow-soft-md">
        <ReceiptRow label="From" value={from?.name ?? "Not chosen"} dim={!from} />
        <BalanceLines fund={from} changePence={amountPence === null ? null : -amountPence} />
        <div className="my-2 border-t border-dashed border-ledger" />
        <ReceiptRow label="To" value={to?.name ?? "Not chosen"} dim={!to} />
        <BalanceLines fund={to} changePence={amountPence} />
        <div className="flex items-baseline justify-between gap-2 border-t border-dashed border-ledger pb-2 pt-3">
          <span className="text-xs text-grey-mid">Amount</span>
          <b className={`font-mono text-2xl tracking-tight ${amountPence === null ? "text-grey-mid" : "text-ink"}`}>
            {amountPence === null ? "—" : pounds(amountPence)}
          </b>
        </div>
      </ReceiptCard>
      <p className="mt-5 text-xs text-grey-mid">Nothing is saved until you press Move money.</p>
    </aside>
  );
}
