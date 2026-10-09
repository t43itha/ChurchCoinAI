import type { Fund, Pledge } from "../../types";

export type TemplateType = "newPledge" | "pledgeChaser" | "pledgeFulfillment" | "generalUpdate" | "endOfYear";

export interface MessageTemplate {
  name: string;
  description: string;
  template: string;
  requiresPledge: boolean;
}

export const MESSAGE_TEMPLATES: Record<TemplateType, MessageTemplate> = {
  newPledge: {
    name: "New Pledge",
    description: "Thank you for signing up",
    template: `Hi {donorName}, thank you for committing to support our church with your pledge of £{pledgeAmount} ({frequency}) towards {fundName}. Your generosity makes a real difference. We look forward to partnering with you on this journey. God bless!

— {financeTeamName}`,
    requiresPledge: true,
  },
  pledgeChaser: {
    name: "Pledge Reminder",
    description: "Gentle reminder to start giving",
    template: `Hi {donorName}, we hope you're doing well! This is a gentle reminder about your pledge of £{pledgeAmount} ({frequency}) towards {fundName}. When you're ready, your contribution will help us continue our mission. Every gift matters. Thank you for your commitment!

— {financeTeamName}`,
    requiresPledge: true,
  },
  pledgeFulfillment: {
    name: "Pledge Complete",
    description: "Thank you for fulfilling pledge",
    template: `Hi {donorName}, amazing news! You've completed your pledge of £{pledgeAmount} towards {fundName}. Thank you for your faithful giving - it's made a real impact. If you'd like to continue supporting this cause or explore other giving opportunities, we'd love to hear from you.

— {financeTeamName}`,
    requiresPledge: true,
  },
  generalUpdate: {
    name: "General Update",
    description: "General appreciation message",
    template: `Hi {donorName}, thank you for being part of our church community. Your faithful giving towards {fundName} has helped us serve and grow. We're grateful for your ongoing support and partnership in our mission.

— {financeTeamName}`,
    requiresPledge: false,
  },
  endOfYear: {
    name: "End of Year",
    description: "Annual giving summary",
    template: `Hi {donorName}, as we reflect on the past year, we want to thank you for your generosity. Your total giving of £{yearTotal} towards {fundName} has made a meaningful difference in our community. Wishing you a blessed year ahead!

— {financeTeamName}`,
    requiresPledge: false,
  },
};

export const TEMPLATE_TYPES = Object.keys(MESSAGE_TEMPLATES) as TemplateType[];

// Fulfilment only ever quotes a completed pledge; the other pledge templates quote any pledge.
export function pledgesForTemplate(type: TemplateType, donorPledges: Pledge[]): Pledge[] {
  return type === "pledgeFulfillment" ? donorPledges.filter((pledge) => pledge.status === "Completed") : donorPledges;
}

export interface ThankYouSelection {
  type: TemplateType;
  pledgeId: string | null;
  fundId: string | null;
}

// Pledge templates start on the first pledge that fits; the rest start on the first fund.
export function defaultThankYouSelection(type: TemplateType, donorPledges: Pledge[], funds: Fund[]): ThankYouSelection {
  if (MESSAGE_TEMPLATES[type].requiresPledge) {
    return { type, pledgeId: pledgesForTemplate(type, donorPledges)[0]?._id ?? null, fundId: null };
  }
  return { type, pledgeId: null, fundId: funds[0]?._id ?? null };
}

export interface ThankYouContext {
  donorName: string;
  churchName: string;
  // Pounds given this year, quoted by the End of Year template.
  yearTotal: number;
  donorPledges: Pledge[];
  funds: Fund[];
}

const fundNameFor = (funds: Fund[], fundId: string | null) =>
  funds.find((fund) => fund._id === fundId)?.name || "General Fund";

// Shown in the message box when a pledge template has no pledge to quote.
export const noPledgeNote = (type: TemplateType) =>
  type === "pledgeFulfillment"
    ? "No completed pledges found for this donor."
    : "No pledges found for this donor. Please add a pledge first.";

export function thankYouMessage(selection: ThankYouSelection, context: ThankYouContext): string {
  const { type } = selection;
  const common = {
    type,
    donorName: context.donorName,
    churchName: context.churchName,
    yearTotal: context.yearTotal,
  };

  if (!MESSAGE_TEMPLATES[type].requiresPledge) {
    return fillTemplate({ ...common, fundName: fundNameFor(context.funds, selection.fundId) });
  }

  const pledge = context.donorPledges.find((candidate) => candidate._id === selection.pledgeId);
  if (!pledge) return noPledgeNote(type);
  return fillTemplate({ ...common, pledge, fundName: fundNameFor(context.funds, pledge.fundId) });
}

interface FillInput extends Pick<ThankYouContext, "donorName" | "churchName" | "yearTotal"> {
  type: TemplateType;
  pledge?: Pledge;
  fundName: string;
}

function fillTemplate({ type, donorName, churchName, yearTotal, pledge, fundName }: FillInput) {
  let message = MESSAGE_TEMPLATES[type].template
    .replace(/{donorName}/g, donorName)
    .replace(/{yearTotal}/g, yearTotal.toLocaleString())
    .replace(/{financeTeamName}/g, `${churchName} Finance Team`);
  if (pledge) {
    message = message
      .replace(/{pledgeAmount}/g, pledge.amount.toLocaleString())
      .replace(/{frequency}/g, pledge.frequency);
  }
  return message.replace(/{fundName}/g, fundName);
}
