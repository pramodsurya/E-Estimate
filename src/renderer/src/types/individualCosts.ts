import type { RateAnalysisSectionKey } from "./rateAnalysis";
export type CostOwner = "SSR" | "MORTH";
export interface IndividualCostAdoption {
  mode: "manual" | "sor";
  rate?: number;
  code?: string;
  component?: string;
  label?: string;
  updatedAt: string;
}
export type IndividualCosts = Record<string, IndividualCostAdoption>;
export interface IndividualCostChoice {
  code: string;
  description: string;
  unit: string;
  component: string;
  medium?: boolean;
}
export interface IndividualCostRow {
  key: unknown[];
  description: string;
  unit: string;
  usages: number;
  analyses: number;
  sample: Record<string, unknown>;
  minRate: number | null;
  maxRate: number | null;
  choices: IndividualCostChoice[];
}
export interface IndividualCostPage {
  rows: IndividualCostRow[];
  total: number;
}
export interface MorthSelection {
  category: string;
  printedItem: string;
  parameters: Record<string, string | number | boolean>;
}
export interface IndividualCostInput {
  owner: CostOwner;
  kind: RateAnalysisSectionKey;
  raw: Record<string, unknown>;
  context: string;
}
