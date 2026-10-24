import type { PipeLeadSource } from "./project";
import type { SorLeadRule } from "./sorLead";
export type SorZone = "zone_1" | "zone_2" | "zone_3";
export type SorMaterialProfile =
  | "EARTH"
  | "SAND"
  | "STONE"
  | "CEMENT"
  | "STEEL"
  | "LIME"
  | "WOOD"
  | "WATER"
  | "BRICKS"
  | "PIPE";
export type SorPath = Partial<
  Record<"part" | "heading" | "section" | "subsection" | "family", string>
>;
export type SorLevel =
  "part" | "heading" | "section" | "subsection" | "family" | "item";
export interface SorNode {
  key: string;
  label: string;
  count: number;
  page: number | null;
  /** A single terminal family, supplied with the group page to avoid another fetch. */
  item?: SorLeaf | null;
}
export interface SorCell {
  row: { id: string; label: string };
  column: { id: string; label: string };
  rowLabel: string;
  columnLabel: string;
}
export interface SorLeaf {
  recipe_code: string;
  year_row_code: string;
  year: string;
  part_no: number;
  heading: string;
  section: string;
  subsection: string;
  table_code: string;
  description: string;
  unit: string;
  item_code: string | null;
  family_key: string;
  family_label: string;
  rate_status: string | null;
  cost_ready: string | null;
  pdf_page: number | null;
  matrix: SorCell | null;
  variants: Record<string, unknown> | null;
  requires_configuration?: boolean;
  lead_applicability: SorMaterialProfile | null;
}
export interface SorRecipe {
  recipe_code: string;
  part_no: number;
  heading: string;
  section: string;
  sub_section: string | null;
  description: string;
  unit: string;
  table_code: string;
  structure: string;
  metadata: Record<string, unknown>;
  variants: Record<string, unknown> | null;
  addons: Record<string, unknown> | null;
  lead_applicability: SorMaterialProfile | null;
  seigniorage_applicability: boolean | null;
}
export interface SorAnnual {
  recipe_code: string;
  year_row_code: string;
  year: string;
  description: string;
  unit: string;
  heading: string;
  section: string;
  sub_section: string | null;
  item_code: string | null;
  metadata: Record<string, unknown>;
  rate_detailed: Record<string, unknown> | null;
  to_be_printed: { description?: string; extra_columns?: unknown[] } | null;
}
export interface SorQuote {
  status: string;
  rate: number | null;
  year: string;
  zone: SorZone;
  unit: string;
  recipe_code: string;
  year_row_code: string;
  revision_path?: string[];
  fallback_path?: unknown[];
  requires_review?: boolean;
  rate_detailed?: Record<string, unknown> | null;
  [key: string]: unknown;
}
export interface SorDetail {
  related_addons?: SorRecipe[];
  resolution: Record<string, unknown>;
  recipe?: SorRecipe;
  annual?: SorAnnual;
  quote: SorQuote;
  lead_rule?: SorLeadRule | null;
}
export interface SorAdjustment {
  code: string;
  label: string;
  amount: number;
}
export interface SorConfiguration {
  inputs: Record<string, number | string | boolean>;
  enabled: string[];
  confirmed: string[];
}
/** Current SOR only. No archived observations, releases or rule-ID compatibility. */
export interface SorItemSelection {
  recipeCode: string;
  resolvedRecipeCode: string;
  year: string;
  zone: SorZone;
  quantity: number;
  recipe: SorRecipe;
  annual: SorAnnual;
  quote: SorQuote;
  leadRule?: SorLeadRule | null;
  pipeLead?: PipeLeadSource;
  configuration: SorConfiguration;
  adjustments: SorAdjustment[];
  rate: number;
  selectionKey: string;
}
