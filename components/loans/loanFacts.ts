import { isLoanOverdue } from "../../lib/movementMatching";
import { isVoidedTransaction } from "../../lib/reportableTransactions";

export type LoanStatus = "Repaid" | "Overdue" | "Open";

export function loanStatus(loan: { isRepaid: boolean; dueDate?: string; outstanding: number }, today: string): LoanStatus {
  if (loan.isRepaid) return "Repaid";
  return isLoanOverdue(loan, today) ? "Overdue" : "Open";
}

// The latest repayment that still counts, as YYYY-MM-DD.
export function lastRepaymentDate(legs: Array<{ date: string; type: string; isVoided?: boolean }>): string | undefined {
  const dates = legs
    .filter((leg) => leg.type === "Expenditure" && !isVoidedTransaction(leg))
    .map((leg) => leg.date);
  return dates.length === 0 ? undefined : dates.reduce((latest, date) => (date > latest ? date : latest));
}
