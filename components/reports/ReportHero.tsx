import React from "react";
import { darkCard } from "../wizard/ui";
import type { Headline, HeadlineTone } from "../../lib/reportHeadline";
import { formatSignedCurrency } from "./format";

const LABEL_TONE: Record<HeadlineTone, string> = {
  surplus: "text-[#b7d9b7]",
  deficit: "text-[#f4b5b5]",
  breakeven: "text-[#d6d2ca]",
};

// The headline's sentence without its lead: the signed amount already says
// surplus or deficit. "so far." moves to the front of the sentence.
export function headlineSentence(headline: Headline): string {
  const body = headline.rest.trim();
  if (body.startsWith("so far.")) {
    const remainder = body.slice("so far.".length).trim();
    if (!remainder) return "So far.";
    return `So far, ${remainder.charAt(0).toLowerCase()}${remainder.slice(1)}`;
  }
  return body.replace(/^\.\s*/, "");
}

export interface ReportHeroProps {
  headline: Headline;
  net: number;
}

// The verdict: surplus or deficit, the signed amount, and the template sentence.
export const ReportHero: React.FC<ReportHeroProps> = ({ headline, net }) => {
  const sentence = headlineSentence(headline);
  return (
    <section className={`${darkCard} !p-5 md:!p-6`} aria-label="Verdict">
      <p className={`text-[11px] font-bold uppercase tracking-[0.08em] ${LABEL_TONE[headline.tone]}`}>
        {headline.status}
      </p>
      <p className="mt-1.5 font-mono text-[34px] font-bold leading-tight tracking-tight md:text-[40px]">
        {formatSignedCurrency(net)}
      </p>
      {sentence && <p className="mt-3 max-w-[64ch] text-[15px] leading-relaxed text-[#d6d2ca]">{sentence}</p>}
    </section>
  );
};
