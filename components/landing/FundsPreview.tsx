import { Activity, ArrowRight, Wallet } from "lucide-react";

const funds = [
  ["General Fund", "Unrestricted", "£7,790.99", "Main unrestricted fund for general operations"],
  ["Legacy Building Fund", "Restricted", "£42,236.19", "Raising funds towards our own property."],
  ["Charity", "Restricted", "£90.00", "Trussell Trust donations"],
] as const;

const spending = [
  ["Gross Salary", "£38,506", 100],
  ["Rent – Premises", "£23,664", 61],
  ["Premises – Maint.", "£15,000", 39],
  ["Allowances", "£10,996", 29],
  ["Honorarium", "£7,380", 19],
] as const;

const mini = "text-[clamp(3px,.39vw,6px)]";

export default function FundsPreview() {
  return (
    <div
      className="relative aspect-video overflow-hidden bg-[#fbfaf8]"
      role="img"
      aria-label="ChurchCoin Funds and Balances page showing restricted, designated and unrestricted fund balances"
    >
      <div className="relative grid h-full grid-cols-[12%_1fr] overflow-hidden bg-[#fbfaf8]">
        <aside className={`flex flex-col border-r border-[#e9e6e0] bg-white px-[9%] py-[7%] ${mini} text-[#5f5a55]`}>
          <img src="/ChurchCoin-Variation 01-transparent-s.png" alt="" className="mx-auto mb-[16%] w-[66%]" />
          <nav className="space-y-[3%]" aria-hidden="true">
            {["Dashboard", "Transactions", "Funds & Balances", "Donors", "Campaigns", "Reports", "Settings", "Ask Ward"].map((item) => (
              <div key={item} className={`rounded-[4px] px-[9%] py-[6%] ${item === "Funds & Balances" ? "bg-[#f8ecdc] font-semibold text-[#a9743f]" : ""}`}>
                {item}
              </div>
            ))}
          </nav>
          <div className="mt-auto flex h-[10%] w-[18%] min-w-3 items-center justify-center rounded-full bg-[#735443] text-white">T</div>
        </aside>

        <div className="overflow-hidden p-[2.6%] text-[#1c1917]">
          <header className="flex items-start justify-between rounded-[6px] border border-[#ebe8e2] bg-white px-[2.2%] py-[1.5%] shadow-[0_2px_6px_rgba(28,25,23,.03)]">
            <div>
              <h4 className="text-[clamp(7px,1.3vw,18px)] font-bold tracking-[-0.04em]">Funds &amp; Balances</h4>
              <p className={`mt-[2%] ${mini} text-[#78716c]`}>Restricted, designated, and unrestricted balances with month movement</p>
            </div>
            <span className="rounded-full bg-[#fcf2e7] px-[1.4%] py-[.55%] font-mono text-[clamp(3px,.42vw,6px)] font-semibold uppercase tracking-[.12em] text-[#a9743f]">7 funds</span>
          </header>

          <div className="mt-[1.5%] grid grid-cols-4 divide-x divide-[#efeee9] overflow-hidden rounded-[6px] border border-[#ebe8e2] bg-white">
            {[
              ["Total funds", "£52,396", "Across 7 funds"],
              ["Unrestricted", "£7,791", "General use"],
              ["Restricted", "£43,856", "Purpose-bound giving"],
              ["Designated", "£749", "Board-allocated"],
            ].map(([label, value, detail]) => (
              <div key={label} className="px-[7%] py-[6%]">
                <p className="text-[clamp(3px,.4vw,6px)] font-bold uppercase tracking-[.08em] text-[#78716c]">{label}</p>
                <p className="mt-[3%] font-mono text-[clamp(6px,.9vw,13px)] font-bold">{value}</p>
                <p className="mt-[2%] text-[clamp(3px,.39vw,6px)] text-[#8b8580]">{detail}</p>
              </div>
            ))}
          </div>

          <div className="mt-[1.5%] grid grid-cols-[1.37fr_1fr] gap-[1.5%]">
            <div className="space-y-[1.7%]">
              {funds.map(([name, type, balance, description]) => (
                <div key={name} className="relative rounded-[6px] border border-[#ebe8e2] bg-white px-[4.4%] py-[3.1%] shadow-[0_2px_6px_rgba(28,25,23,.025)]">
                  <span className="absolute inset-y-[12%] left-0 w-[2px] rounded-r bg-[#6b8e6b]" />
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-[4%]">
                      <span className="flex aspect-square w-[13%] min-w-4 items-center justify-center rounded-[4px] bg-[#f8f3ea] text-[#b2834f]"><Wallet className="h-[52%] w-[52%]" strokeWidth={1.8} /></span>
                      <div>
                        <p className="text-[clamp(4px,.62vw,9px)] font-bold">{name}</p>
                        <p className="mt-[2%] text-[clamp(3px,.37vw,5px)] font-bold uppercase tracking-[.08em] text-[#a9743f]">● &nbsp;{type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-[clamp(5px,.72vw,11px)] font-bold">{balance}</p>
                      <p className="mt-[2%] font-mono text-[clamp(3px,.34vw,5px)] text-[#78716c]">No change</p>
                    </div>
                  </div>
                  <p className={`mt-[3%] ${mini} text-[#625d58]`}>{description}</p>
                  {name === "Legacy Building Fund" && (
                    <div className="mt-[3%] rounded-[4px] border border-[#efeee9] bg-[#fbfaf8] px-[3%] py-[2%]">
                      <div className="flex justify-between text-[clamp(3px,.32vw,5px)] font-semibold uppercase tracking-[.08em] text-[#78716c]"><span>Target progress</span><span>£42,236 / £625,000</span></div>
                      <div className="mt-[2%] h-[3px] overflow-hidden rounded-full bg-[#eceae5]"><div className="h-full w-[7%] bg-[#c79a5f]" /></div>
                    </div>
                  )}
                  <div className="mt-[2.5%] flex items-center justify-end gap-[1%] text-[clamp(3px,.33vw,5px)] font-bold uppercase tracking-[.06em] text-[#78716c]">Ledger history <ArrowRight className="h-[1em] w-[1em]" /></div>
                </div>
              ))}
            </div>

            <div className="space-y-[4%]">
              <div className="rounded-[6px] border border-[#ebe8e2] bg-white px-[5%] py-[5%]">
                <div className="flex items-center gap-[3%]">
                  <span className="flex aspect-square w-[9%] items-center justify-center rounded-[4px] bg-[#edf4ed] text-[#6b8e6b]"><Activity className="h-[55%] w-[55%]" /></span>
                  <div><p className="text-[clamp(4px,.53vw,8px)] font-bold">General Fund expenditure</p><p className="text-[clamp(3px,.31vw,5px)] uppercase tracking-[.08em] text-[#78716c]">Top categories · all time</p></div>
                </div>
                <div className="mt-[5%] space-y-[4%]">
                  {spending.map(([label, value, width]) => (
                    <div key={label} className="grid grid-cols-[27%_1fr_18%] items-center gap-[3%] text-[clamp(3px,.36vw,5px)]">
                      <span className="truncate text-[#625d58]">{label}</span>
                      <span className="h-[3px] overflow-hidden rounded-full bg-[#efeee9]"><span className="block h-full rounded-full bg-[#1c1917]" style={{ width: `${width}%` }} /></span>
                      <span className="text-right font-mono font-bold">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-[6px] border border-[#ebe8e2] bg-white px-[5%] py-[4.5%]">
                <p className="text-[clamp(4px,.53vw,8px)] font-bold">Capital allocation</p><p className="text-[clamp(3px,.31vw,5px)] uppercase tracking-[.08em] text-[#78716c]">By restriction type</p>
                <div className="mt-[4%] flex items-center gap-[7%]">
                  <div className="flex aspect-square w-[34%] items-center justify-center rounded-full bg-[conic-gradient(#c79a5f_0_84%,#9bb39b_84%_99%,#7d8a99_99%)]"><div className="flex h-[58%] w-[58%] flex-col items-center justify-center rounded-full bg-white"><strong className="font-mono text-[clamp(4px,.58vw,8px)]">£52k</strong><span className="text-[clamp(2px,.28vw,4px)] uppercase">Total</span></div></div>
                  <div className="flex-1 space-y-[5%] text-[clamp(3px,.35vw,5px)]"><p><span className="text-[#9bb39b]">■</span> &nbsp;Unrestricted <b className="float-right">15%</b></p><p><span className="text-[#c79a5f]">■</span> &nbsp;Restricted <b className="float-right">84%</b></p><p><span className="text-[#7d8a99]">■</span> &nbsp;Designated <b className="float-right">1%</b></p></div>
                </div>
                <p className="mt-[4%] rounded-[4px] border border-[#ecd8bd] bg-[#fcf7f0] px-[3%] py-[2.5%] text-[clamp(3px,.3vw,5px)] leading-relaxed text-[#7a5a30]">Restricted funds must be reported separately in year-end accounts.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
