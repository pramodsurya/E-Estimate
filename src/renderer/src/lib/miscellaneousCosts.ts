import type { RateAnalysisRecipe } from "../types/rateAnalysis";
import { calculationBasisLabel } from "./morthAppendices";

export type MiscellaneousCosts = Record<
  string,
  { percent: number; updatedAt: string }
>;
export interface MiscellaneousCost {
  key: string;
  owner: "SSR" | "MORTH";
  id: string;
  label: string;
  base: string;
  defaultPercent: number;
  percent: number;
  enabled: boolean;
  condition?: string;
  conditionValue?: boolean;
  maximum?: number;
  unresolved?: boolean;
}
const rec = (v: unknown): Record<string, unknown> =>
  v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
const number = (v: unknown): number | undefined =>
  v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v))
    ? Number(v)
    : undefined;
export function miscellaneousDefinitions(
  recipe: RateAnalysisRecipe,
): MiscellaneousCost[] {
  if (recipe.itemSource !== "SSR" && recipe.itemSource !== "MORTH") return [];
  const make = (
    id: string,
    label: string,
    base: string,
    p: number,
    extra: Partial<MiscellaneousCost> = {},
  ): MiscellaneousCost => ({
    id,
    label,
    base,
    defaultPercent: p,
    percent: p,
    enabled: true,
    owner: recipe.itemSource as "SSR" | "MORTH",
    key: JSON.stringify([
      recipe.itemSource,
      id.startsWith("allowance-") ? "allowance" : id,
      label,
      base,
      p,
      extra.condition ?? null,
      extra.maximum ?? null,
    ]),
    ...extra,
  });
  if (!recipe.morth)
    return [
      make(
        "overhead",
        "Contractor profit and overheads",
        "direct_cost",
        recipe.miscellaneousDefaults?.overheadPercent ?? recipe.overheadPercent,
      ),
    ];
  const source = recipe.morth.source,
    calc = rec(source._default_calculation ?? source.calculation),
    params = recipe.morth.parameters;
  const policy = (kind: string): number | undefined => {
    const explicit = number(calc[`${kind}_percent`]);
    if (explicit !== undefined) return explicit;
    const parameter = String(
      calc[
        kind === "contractor_profit"
          ? "profit_percent_parameter"
          : `${kind}_percent_parameter`
      ] ?? "",
    );
    if (parameter) {
      const published = String(source.project_category ?? "");
      const category = ["small", "medium", "large"].includes(published)
        ? published
        : String(source._project_category);
      return (
        number(params[parameter]) ??
        number(rec(rec(source._policies)[parameter])[category])
      );
    }
    if (kind === "overhead")
      return (
        number(
          rec(calc.overhead_percent_by_project_type)[
            String(params[String(calc.overhead_selection_parameter)])
          ],
        ) ?? number(calc.overhead_default)
      );
    return undefined;
  };
  const result: MiscellaneousCost[] = [];
  for (const [id, kind, label, base] of [
    ["overhead", "overhead", "Overheads", "overhead_base"],
    ["profit", "contractor_profit", "Contractor profit", "profit_base"],
  ]) {
    const p = policy(kind);
    if (p !== undefined)
      result.push(make(id, label, String(calc[base] ?? "direct_cost"), p));
  }
  const allowances = Array.isArray(calc.percentage_allowances)
    ? calc.percentage_allowances
    : [];
  allowances.forEach((raw, index) => {
    const a = rec(raw),
      condition = String(a.condition_parameter ?? ""),
      maximum = number(a.percent);
    const p = maximum;
    if (p !== undefined)
      result.push(
        make(
          `allowance-${index}`,
          String(
            a.label ??
              a.description ??
              (typeof a.source_note === "string"
                ? a.source_note.split(";")[0]
                : "Percentage allowance"),
          ),
          String(a.base ?? "direct_cost"),
          p,
          {
            condition: condition || undefined,
            conditionValue:
              typeof params[condition] === "boolean"
                ? (params[condition] as boolean)
                : undefined,
            enabled: !condition || params[condition] === true,
            maximum: a.percent_is_maximum === true ? maximum : undefined,
            percent:
              a.percent_is_maximum === true
                ? (number(params[`${condition}_percent`]) ?? 0)
                : (maximum ?? 0),
            unresolved:
              a.percent_is_maximum === true &&
              number(params[`${condition}_percent`]) === undefined,
          },
        ),
      );
  });
  return result;
}
export function applyMiscellaneousCosts(
  recipe: RateAnalysisRecipe,
  costs?: MiscellaneousCosts,
): RateAnalysisRecipe {
  const defs = miscellaneousDefinitions(recipe),
    changed = defs.filter(
      (d) =>
        costs?.[d.key] &&
        Number.isFinite(costs[d.key].percent) &&
        costs[d.key].percent >= 0 &&
        (d.maximum === undefined || costs[d.key].percent <= d.maximum),
    );
  if (!changed.length) return recipe;
  if (!recipe.morth) {
    const percent = costs![changed[0].key].percent;
    return {
      ...recipe,
      miscellaneousDefaults: { overheadPercent: defs[0].defaultPercent },
      overheadPercent: percent,
      calculationStale: true,
      recalculation: undefined,
    };
  }
  const original = rec(
      recipe.morth.source._default_calculation ??
        recipe.morth.source.calculation,
    ),
    calc = { ...original },
    parameters = { ...recipe.morth.parameters };
  const allowances = (
    Array.isArray(original.percentage_allowances)
      ? original.percentage_allowances
      : []
  ).map((a) => ({ ...rec(a) }));
  for (const d of changed) {
    const p = costs![d.key].percent;
    if (d.id === "overhead") calc.overhead_percent = p;
    else if (d.id === "profit") calc.contractor_profit_percent = p;
    else {
      const i = Number(d.id.split("-")[1]);
      if (d.maximum !== undefined && d.condition)
        parameters[`${d.condition}_percent`] = p;
      else allowances[i].percent = p;
    }
  }
  calc.percentage_allowances = allowances;
  return {
    ...recipe,
    morth: {
      ...recipe.morth,
      parameters,
      source: {
        ...recipe.morth.source,
        _default_calculation: original,
        calculation: calc,
      },
    },
  };
}
export const miscellaneousBasisLabel = calculationBasisLabel;
