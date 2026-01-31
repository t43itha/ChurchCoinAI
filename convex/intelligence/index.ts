export * from "./generateInsights";
export { DONOR_RULES, type DonorInsightRule, type DonorRuleContext } from "./rules/donorRules";
export { OPERATIONS_RULES, type OperationsInsightRule, type OperationsRuleContext } from "./rules/operationsRules";
// InsightResult is the same in both files, export from donorRules
export type { InsightResult } from "./rules/donorRules";

// RAG-based transaction categorization learning
export * as bootstrapRAG from "./bootstrapRAG";
export * as ragIndexer from "./ragIndexer";
